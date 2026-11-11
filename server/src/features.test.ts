// Search, Ask AI, teams (+ admin settings), calendar feed and plan limits.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";

// rooms listed here look full to LiveKit (10 people)
const fullRooms = new Set<string>();
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  if (url.hostname === "localhost") return realFetch(input, init);
  const body = String(init?.body ?? "");
  if (url.pathname.includes("livekit") || url.pathname.includes("twirp")) {
    const room = [...fullRooms].find((r) => body.includes(r));
    return new Response(JSON.stringify({ participants: room ? Array.from({ length: 10 }, (_, i) => ({ identity: `p${i}` })) : [] }), { status: 200 });
  }
  // AI: answers questions; anything else (notes) gets an empty object
  const content = body.includes("Question:") ? JSON.stringify({ answer: "Ravi books the venue [10:00]." }) : "{}";
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
}) as typeof fetch;

process.env.SMTP_HOST = ""; // emails stay in the dev outbox
const { app } = await import("./app.js");
const { prisma } = await import("./config/db.js");
const { devOutbox } = await import("./services/email.service.js");
const { toPrefixQuery } = await import("./services/search.service.js");
const server = app.listen(0);
const base = `http://localhost:${(server.address() as AddressInfo).port}/api`;
after(async () => {
  server.close();
  await prisma.$disconnect();
});

function browser() {
  let cookie = "";
  const ip = `10.9.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
  return async (method: string, path: string, body?: unknown) => {
    const res = await realFetch(base + path, {
      method,
      headers: { "content-type": "application/json", "x-forwarded-for": ip, ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0]!;
    const text = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
    return { status: res.status, body: json };
  };
}
const unique = () => `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
/** A signed-in, confirmed account. */
async function person(name: string) {
  const b = browser();
  const email = `${name.toLowerCase()}${unique()}@example.com`;
  await b("POST", "/auth/register", { name, email, password: "password-1" });
  await prisma.user.update({ where: { email }, data: { emailVerifiedAt: new Date() } });
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  return Object.assign(b, { email, id: user.id });
}
async function meetingWithTalk(host: Awaited<ReturnType<typeof person>>, title: string) {
  const { roomCode, hostKey } = (await host("POST", "/meetings", { title })).body.data;
  const me = (await host("POST", `/meetings/${roomCode}/token`, { name: "Host", hostKey })).body.data;
  return { roomCode, participantId: me.participantId as string };
}

test("search: prefix words, only my meetings, snippets from transcript, chat and notes", async () => {
  assert.equal(toPrefixQuery("Budg Q4! (venue)"), "budg:* & q4:* & venue:*");
  assert.equal(toPrefixQuery("&|!:*"), "");

  const host = await person("Sia");
  const word = `zebra${unique().slice(-5)}`; // a word nobody else has said
  const { roomCode, participantId } = await meetingWithTalk(host, "Planning");
  await host("POST", `/meetings/${roomCode}/transcript`, { participantId, lines: [{ text: `The ${word} budget is fine`, spokenAt: new Date().toISOString() }] });
  await host("POST", `/meetings/${roomCode}/chat`, { participantId, text: `${word} sheet link` });

  const r = await host("GET", `/meetings/search?q=${word.slice(0, 7)}`);
  assert.equal(r.status, 200);
  const hit = r.body.data.meetings.find((m: any) => m.roomCode === roomCode);
  assert.ok(hit, "finds my meeting");
  const kinds = hit.hits.map((h: any) => h.kind).sort();
  assert.deepEqual(kinds, ["chat", "transcript"]);
  assert.match(hit.hits.find((h: any) => h.kind === "transcript").snippet, new RegExp(`<<${word}>>`));

  const stranger = await person("Tom");
  assert.equal((await stranger("GET", `/meetings/search?q=${word}`)).body.data.meetings.length, 0);
  assert.equal((await host("GET", "/meetings/search?q=a")).status, 400);
  assert.equal((await browser()("GET", `/meetings/search?q=${word}`)).status, 401);
});

test("ask AI: members only, answers from the meeting, saved, daily limit", async () => {
  const host = await person("Ana");
  const { roomCode, participantId } = await meetingWithTalk(host, "Launch");
  const empty = await host("POST", `/meetings/${roomCode}/ask`, { question: "Who books the venue?" });
  assert.equal(empty.status, 409); // nothing said yet
  await host("POST", `/meetings/${roomCode}/transcript`, { participantId, lines: [{ text: "Ravi will book the venue", spokenAt: new Date().toISOString() }] });

  const a = await host("POST", `/meetings/${roomCode}/ask`, { question: "Who books the venue?" });
  assert.equal(a.status, 201);
  assert.match(a.body.data.answer, /Ravi/);
  assert.equal((await host("GET", `/meetings/${roomCode}/ask`)).body.data.length, 1);
  assert.equal((await (await person("Out"))("POST", `/meetings/${roomCode}/ask`, { question: "Who books the venue?" })).status, 403);

  // free plan: 20 questions a day
  const meeting = await prisma.meeting.findUniqueOrThrow({ where: { roomCode } });
  await prisma.aiQuestion.createMany({ data: Array.from({ length: 19 }, () => ({ meetingId: meeting.id, userId: host.id, question: "q", answer: "a", provider: "test" })) });
  const over = await host("POST", `/meetings/${roomCode}/ask`, { question: "One more?" });
  assert.equal(over.status, 403);
  assert.equal(over.body.error.code, "PLAN_LIMIT");
});

test("teams: invite, accept, shared meetings and notes, roles, admin settings, plan limits", async () => {
  const owner = await person("Olga");
  const mate = await person("Max");
  const t = await owner("POST", "/teams", { name: "Design" });
  assert.equal(t.status, 201);
  const teamId = t.body.data.id;
  assert.equal((await owner("POST", "/teams", { name: "Second" })).body.error.code, "PLAN_LIMIT"); // free: 1 team

  const before = devOutbox.length;
  assert.equal((await owner("POST", `/teams/${teamId}/invites`, { emails: [mate.email] })).body.data.invited, 1);
  assert.ok(devOutbox.slice(before).some((m) => m.to === mate.email && m.subject.includes("Design")));
  const invites = (await mate("GET", "/teams")).body.data.invites;
  assert.equal(invites.length, 1);
  assert.equal((await mate("GET", `/teams/${teamId}`)).status, 404); // not in it yet
  assert.equal((await mate("POST", `/teams/invites/${invites[0].id}`, { accept: true })).body.data.joined, true);
  const view = (await mate("GET", `/teams/${teamId}`)).body.data;
  assert.equal(view.myRole, "MEMBER");
  assert.equal(view.members.length, 2);
  assert.deepEqual(view.invites, []); // members don't see invites

  // a team meeting: the other member sees it and can read what was said without having joined
  const made = await owner("POST", "/meetings", { title: "Team sync", teamId });
  const code = made.body.data.roomCode;
  assert.ok((await mate("GET", "/meetings/mine?role=team")).body.data.items.some((m: any) => m.roomCode === code && m.team.name === "Design"));
  assert.equal((await mate("GET", `/meetings/${code}/transcript`)).status, 200);
  assert.equal((await (await person("Nope"))("POST", "/meetings", { title: "x", teamId })).status, 403);

  // roles: members can't change settings; owner makes admins
  assert.equal((await mate("PATCH", `/teams/${teamId}`, { askToJoin: true })).status, 403);
  assert.equal((await owner("PATCH", `/teams/${teamId}/members/${mate.id}`, { role: "ADMIN" })).body.data.role, "ADMIN");

  // admin settings
  const s = await mate("PATCH", `/teams/${teamId}`, { askToJoin: true, allowedDomains: ["@Example.com"], recording: "OFF" });
  assert.deepEqual(s.body.data, { name: "Design", askToJoin: true, allowedDomains: ["example.com"], recording: "OFF" });
  const asked = await owner("POST", "/meetings", { title: "Gated", teamId });
  assert.equal((await prisma.meeting.findUniqueOrThrow({ where: { roomCode: asked.body.data.roomCode } })).waitingRoom, true);
  const guestJoin = await browser()("POST", `/meetings/${asked.body.data.roomCode}/token`, { name: "Guest" });
  assert.equal(guestJoin.body.error.code, "DOMAIN_NOT_ALLOWED");
  const rec = await owner("POST", `/meetings/${asked.body.data.roomCode}/recordings`, { mimeType: "video/webm", durationSec: 5 });
  assert.equal(rec.body.error.code, "RECORDING_OFF");

  // team size on the free plan: 5 people (members + invites)
  const many = Array.from({ length: 4 }, (_, i) => `x${i}${unique()}@example.com`);
  assert.equal((await owner("POST", `/teams/${teamId}/invites`, { emails: many })).body.error.code, "PLAN_LIMIT");
  assert.equal((await owner("POST", `/teams/${teamId}/invites`, { emails: many.slice(0, 3) })).status, 201);

  // leave / remove / delete
  assert.equal((await owner("DELETE", `/teams/${teamId}/members/${owner.id}`)).status, 400); // owner can't leave
  assert.equal((await mate("DELETE", `/teams/${teamId}/members/${mate.id}`)).body.data.removed, true);
  assert.equal((await owner("DELETE", `/teams/${teamId}`)).body.data.deleted, true);
  assert.equal((await prisma.meeting.findUniqueOrThrow({ where: { roomCode: code } })).teamId, null); // meeting stays with its host
});

test("calendar feed: my scheduled meetings as a subscribable calendar; reset kills the old link", async () => {
  const me = await person("Cal");
  await me("POST", "/meetings", { title: "Feed check", scheduledFor: new Date(Date.now() + 86_400_000).toISOString() });
  const { url } = (await me("GET", "/me/calendar")).body.data;
  assert.match(url, /\/api\/calendar\/[\w-]+\.ics$/);
  const path = new URL(url).pathname.replace(/^\/api/, "");
  const feed = await browser()("GET", path);
  assert.equal(feed.status, 200);
  assert.match(feed.body, /BEGIN:VCALENDAR/);
  assert.match(feed.body, /SUMMARY:Feed check/);
  assert.equal((await me("GET", "/me/calendar")).body.data.url, url); // same link every time

  await me("POST", "/me/calendar/reset");
  assert.equal((await browser()("GET", path)).status, 404);
  assert.equal((await browser()("GET", "/calendar/short.ics")).status, 404);
});

test("plans: people per call and recordings per month follow the host's plan", async () => {
  const host = await person("Pia");
  const { roomCode } = (await host("POST", "/meetings", { title: "Big call" })).body.data;
  fullRooms.add(roomCode);
  const full = await browser()("POST", `/meetings/${roomCode}/token`, { name: "Late" });
  assert.equal(full.body.error.code, "MEETING_FULL");
  await prisma.user.update({ where: { id: host.id }, data: { plan: "PRO" } });
  assert.equal((await browser()("POST", `/meetings/${roomCode}/token`, { name: "Late" })).status, 200); // 50 on Pro
  fullRooms.delete(roomCode);

  await prisma.user.update({ where: { id: host.id }, data: { plan: "FREE" } });
  const m = await prisma.meeting.findUniqueOrThrow({ where: { roomCode } });
  await prisma.recording.createMany({ data: Array.from({ length: 5 }, (_, i) => ({ meetingId: m.id, storageKey: `k${i}${unique()}`, mimeType: "video/webm", durationSec: 1 })) });
  const rec = await host("POST", `/meetings/${roomCode}/recordings`, { mimeType: "video/webm", durationSec: 5 });
  assert.equal(rec.body.error.code, "PLAN_LIMIT");
  await prisma.user.update({ where: { id: host.id }, data: { plan: "PRO" } });
  assert.notEqual((await host("POST", `/meetings/${roomCode}/recordings`, { mimeType: "video/webm", durationSec: 5 })).body.error?.code, "PLAN_LIMIT");

  // public plans list (landing page): 3 plans, no prices without Stripe
  const plans = (await browser()("GET", "/billing/plans")).body.data;
  assert.deepEqual(plans.map((p: any) => [p.id, p.people, p.prices]), [["FREE", 10, null], ["PRO", 50, null], ["BUSINESS", 100, null]]);

  // billing page without Stripe set up: plan + usage, no billing block
  const b = (await host("GET", "/billing")).body.data;
  assert.equal(b.plan, "PRO");
  assert.equal(b.billing, null);
  assert.equal(b.used.recordingsThisMonth, 6); // 5 + the one Pro just allowed
  assert.equal((await host("POST", "/billing/checkout", { interval: "month" })).body.error.code, "BILLING_NOT_CONFIGURED");
});
