// Scheduled meetings + calendar invites, and the paged / searched / filtered "my meetings" list.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";

const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  if (url.hostname === "localhost") return realFetch(input, init);
  if (url.hostname.endsWith("livekit.cloud")) return new Response(JSON.stringify({ participants: [] }), { status: 200 });
  return new Response(JSON.stringify({ choices: [{ message: { content: "{}" } }] }), { status: 200 });
}) as typeof fetch;

process.env.SMTP_HOST = ""; // emails stay in the dev outbox
const { app } = await import("./app.js");
const { prisma } = await import("./config/db.js");
const { devOutbox } = await import("./services/email.service.js");
const { inviteIcs, formatWhen } = await import("./services/calendar.service.js");
const server = app.listen(0);
const base = `http://localhost:${(server.address() as AddressInfo).port}/api`;
after(async () => {
  server.close();
  await prisma.$disconnect();
});

function browser() {
  let cookie = "";
  const ip = `10.8.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
  return async (method: string, path: string, body?: unknown) => {
    const res = await realFetch(base + path, {
      method,
      headers: { "content-type": "application/json", "x-forwarded-for": ip, ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0]!;
    return { status: res.status, body: (await res.json().catch(() => null)) as any };
  };
}
const unique = () => `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
const inHours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();
async function signedIn(name = "Host") {
  const b = browser();
  const email = `${name.toLowerCase()}${unique()}@example.com`;
  await b("POST", "/auth/register", { name, email, password: "password-1" });
  return Object.assign(b, { email });
}
const waitFor = async (cond: () => boolean) => {
  for (let i = 0; i < 50 && !cond(); i++) await new Promise((r) => setTimeout(r, 100));
};

test("calendar invite file: UTC times, escaped text, folded long lines", () => {
  const ics = inviteIcs(
    {
      uid: "m1@meetapp",
      start: new Date("2026-11-12T10:00:00Z"),
      minutes: 45,
      title: "Plan; budget, Q4",
      description: "Join: https://x.test/m/abc-defg-hij",
      url: "https://x.test/m/abc-defg-hij",
      organizer: { name: "Asha (MeetApp)", email: "bot@example.com" },
      attendee: "guest@example.com",
    },
    new Date("2026-11-11T00:00:00Z"),
  );
  assert.match(ics, /DTSTART:20261112T100000Z\r\n/);
  assert.match(ics, /DTEND:20261112T104500Z\r\n/);
  assert.match(ics, /SUMMARY:Plan\\; budget\\, Q4\r\n/);
  assert.match(ics, /METHOD:REQUEST/);
  assert.ok(ics.split("\r\n").every((line) => Buffer.byteLength(line) <= 75), "no line over 75 bytes");
  assert.match(formatWhen(new Date("2026-11-12T10:00:00Z"), "Asia/Kolkata"), /15:30/);
  assert.match(formatWhen(new Date("2026-11-12T10:00:00Z"), "Not/AZone"), /10:00/); // unknown zone -> UTC
});

test("schedule a meeting: each guest gets an email with a calendar invite", async () => {
  const host = await signedIn("Hema");
  const before = devOutbox.length;
  const res = await host("POST", "/meetings", {
    title: "Roadmap review",
    scheduledFor: inHours(24),
    durationMin: 45,
    invitees: ["One@Example.com", "two@example.com", "one@example.com"], // same person twice
    timeZone: "Asia/Kolkata",
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.data.invited, 2);
  assert.equal(res.body.data.status, "SCHEDULED");
  assert.equal(res.body.data.durationMin, 45);
  await waitFor(() => devOutbox.length >= before + 2);
  const sent = devOutbox.slice(before);
  assert.deepEqual(sent.map((e) => e.to).sort(), ["one@example.com", "two@example.com"]);
  assert.match(sent[0]!.subject, /^Invitation: Roadmap review · /);
  assert.equal(sent[0]!.replyTo, host.email);
  assert.match(sent[0]!.icalEvent!.content, new RegExp(`/m/${res.body.data.roomCode}`));
  assert.match(sent[0]!.icalEvent!.content, /ATTENDEE;.*mailto:/);
});

test("scheduling rules: account needed, future time, valid emails, time needed for invites", async () => {
  assert.equal((await browser()("POST", "/meetings", { scheduledFor: inHours(2) })).body.error.code, "SIGN_IN_TO_SCHEDULE");
  const host = await signedIn();
  assert.equal((await host("POST", "/meetings", { scheduledFor: inHours(-2) })).status, 400);
  assert.equal((await host("POST", "/meetings", { scheduledFor: inHours(2), invitees: ["nope"] })).status, 400);
  assert.equal((await host("POST", "/meetings", { invitees: ["a@example.com"] })).status, 400);
  assert.equal((await host("POST", "/meetings", { scheduledFor: inHours(2), invitees: Array(21).fill(0).map((_, i) => `p${i}@example.com`) })).status, 400);
  assert.equal((await browser()("POST", "/meetings", {})).status, 201); // quick meetings still need no account
});

test("my meetings: pages, search, status filter, counts, invited role, soonest sort", async () => {
  const host = await signedIn("Pager");
  const codes: string[] = [];
  for (let i = 0; i < 12; i++) codes.push((await host("POST", "/meetings", { title: `Sync ${i}` })).body.data.roomCode);
  await host("POST", "/meetings", { title: "Budget planning", scheduledFor: inHours(48) });
  await host("POST", "/meetings", { title: "Hiring chat", scheduledFor: inHours(3) });
  await host("POST", `/meetings/${codes[0]}/token`, { name: "Pager" }); // -> LIVE

  const p1 = (await host("GET", "/meetings/mine?pageSize=5")).body.data;
  assert.equal(p1.total, 14);
  assert.equal(p1.pageCount, 3);
  assert.equal(p1.items.length, 5);
  assert.deepEqual(p1.counts, { all: 14, live: 1, upcoming: 2, ended: 0 }); // 11 quick ones not started: only in "all"
  const p3 = (await host("GET", "/meetings/mine?pageSize=5&page=3")).body.data;
  assert.equal(p3.items.length, 4);

  assert.deepEqual((await host("GET", "/meetings/mine?q=budget")).body.data.items.map((m: any) => m.title), ["Budget planning"]);
  assert.equal((await host("GET", "/meetings/mine?status=live")).body.data.items[0].roomCode, codes[0]);
  const soonest = (await host("GET", "/meetings/mine?status=upcoming&sort=soonest&pageSize=2")).body.data.items;
  assert.deepEqual(soonest.map((m: any) => m.title), ["Hiring chat", "Budget planning"]);
  assert.equal((await host("GET", "/meetings/mine?status=nope")).status, 400);
  assert.equal((await host("GET", "/meetings/mine?pageSize=500")).status, 400);

  // an invited person sees it under "invited" once they have an account with that email
  const guestEmail = `guest${unique()}@example.com`;
  const { roomCode } = (await host("POST", "/meetings", { title: "Intro call", scheduledFor: inHours(5), invitees: [guestEmail] })).body.data;
  const guest = browser();
  await guest("POST", "/auth/register", { name: "Gia", email: guestEmail, password: "password-1" });
  const invited = (await guest("GET", "/meetings/mine?role=invited")).body.data.items;
  assert.deepEqual(invited.map((m: any) => m.roomCode), [roomCode]);
  assert.equal(invited[0].isHost, false);

  const stats = (await host("GET", "/meetings/stats")).body.data;
  assert.equal(stats.meetings, 15);
  assert.deepEqual(stats.live.map((m: any) => m.roomCode), [codes[0]]);
  assert.equal(stats.upcoming[0].title, "Hiring chat"); // scheduled ones, soonest first
  assert.ok(stats.upcoming.every((m: any) => m.scheduledFor));
});
