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
process.env.CRON_SECRET = "test-cron-secret-0123456789";
const { app } = await import("./app.js");
const { prisma } = await import("./config/db.js");
const { devOutbox } = await import("./services/email.service.js");
const { inviteIcs, formatWhen } = await import("./services/calendar.service.js");
const { sendDueReminders } = await import("./services/reminder.service.js");
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
const waitFor = async (cond: () => boolean) => {
  for (let i = 0; i < 50 && !cond(); i++) await new Promise((r) => setTimeout(r, 100));
};
const confirmLink = async (email: string) => {
  await waitFor(() => devOutbox.some((m) => m.to === email && m.subject.startsWith("Confirm")));
  return devOutbox.findLast((m) => m.to === email && m.subject.startsWith("Confirm"))!.text.match(/verify-email\?token=([\w.-]+)/)![1]!;
};
/** A signed-in account that has confirmed its email (invites need that). */
async function signedIn(name = "Host", { confirm = true } = {}) {
  const b = browser();
  const email = `${name.toLowerCase()}${unique()}@example.com`;
  await b("POST", "/auth/register", { name, email, password: "password-1" });
  if (confirm) await b("POST", "/auth/verify-email", { token: await confirmLink(email) });
  return Object.assign(b, { email });
}

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
  assert.equal((await browser()("POST", "/meetings", { title: "T", scheduledFor: inHours(2) })).body.error.code, "SIGN_IN_TO_SCHEDULE");
  const host = await signedIn();
  assert.equal((await host("POST", "/meetings", { scheduledFor: inHours(2) })).body.error.details.title[0], "Give the meeting a title");
  assert.equal((await host("POST", "/meetings", { title: "T", scheduledFor: inHours(-2) })).status, 400);
  assert.equal((await host("POST", "/meetings", { title: "T", scheduledFor: inHours(2), invitees: ["nope"] })).status, 400);
  assert.equal((await host("POST", "/meetings", { invitees: ["a@example.com"] })).status, 400);
  assert.equal((await host("POST", "/meetings", { title: "T", scheduledFor: inHours(2), invitees: Array(21).fill(0).map((_, i) => `p${i}@example.com`) })).status, 400);
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
  await prisma.user.update({ where: { email: guestEmail }, data: { emailVerifiedAt: new Date() } });
  const invited = (await guest("GET", "/meetings/mine?role=invited")).body.data.items;
  assert.deepEqual(invited.map((m: any) => m.roomCode), [roomCode]);
  assert.equal(invited[0].isHost, false);

  const stats = (await host("GET", "/meetings/stats")).body.data;
  assert.equal(stats.meetings, 15);
  assert.deepEqual(stats.live.map((m: any) => m.roomCode), [codes[0]]);
  assert.equal(stats.upcoming[0].title, "Hiring chat"); // scheduled ones, soonest first
  assert.ok(stats.upcoming.every((m: any) => m.scheduledFor));
});

test("meetings everyone left are closed when the list loads (rooms checked with LiveKit)", async () => {
  const host = await signedIn("Leaver");
  const { roomCode } = (await host("POST", "/meetings", { title: "Abandoned" })).body.data;
  await host("POST", `/meetings/${roomCode}/token`, { name: "Leaver" }); // -> LIVE
  const fresh = (await host("POST", "/meetings", { title: "Just started" })).body.data.roomCode;
  await host("POST", `/meetings/${fresh}/token`, { name: "Leaver" });
  // the first one started 10 minutes ago; its room is empty (fake LiveKit says nobody is there)
  await prisma.meeting.update({ where: { roomCode }, data: { startedAt: new Date(Date.now() - 10 * 60_000) } });
  const stats = (await host("GET", "/meetings/stats")).body.data;
  assert.deepEqual(stats.live.map((m: any) => m.roomCode), [fresh]); // a just-started one is left alone
  const closed = await prisma.meeting.findUniqueOrThrow({ where: { roomCode }, include: { notes: true } });
  assert.equal(closed.status, "ENDED");
  assert.ok(closed.notes); // notes started like a normal end
});

test("edit a scheduled meeting: kept guests get an update, new ones an invite, removed ones a cancellation", async () => {
  const host = await signedIn("Editor");
  const a = `a${unique()}@example.com`, b = `b${unique()}@example.com`, c = `c${unique()}@example.com`;
  const { roomCode } = (await host("POST", "/meetings", { title: "Plan", scheduledFor: inHours(24), invitees: [a, b] })).body.data;
  await waitFor(() => devOutbox.filter((e) => e.to === a || e.to === b).length >= 2);
  const before = devOutbox.length;

  assert.equal((await browser()("PATCH", `/meetings/${roomCode}/schedule`, { title: "Hack" })).status, 403); // not the host
  assert.deepEqual((await host("GET", `/meetings/${roomCode}/schedule`)).body.data.invitees.sort(), [a, b].sort());

  const res = await host("PATCH", `/meetings/${roomCode}/schedule`, { title: "Plan v2", scheduledFor: inHours(48), durationMin: 60, invitees: [b, c] });
  assert.equal(res.status, 200);
  assert.deepEqual([res.body.data.invited, res.body.data.updated, res.body.data.removed], [1, 1, 1]);
  assert.equal(res.body.data.title, "Plan v2");
  await waitFor(() => devOutbox.length >= before + 3);
  const sent = devOutbox.slice(before);
  const to = (email: string) => sent.find((e) => e.to === email)!;
  assert.match(to(a).subject, /^Removed: Plan/);
  assert.match(to(a).icalEvent!.content, /METHOD:CANCEL/);
  assert.match(to(b).subject, /^Updated invitation: Plan v2/);
  assert.match(to(b).icalEvent!.content, /SEQUENCE:[1-9]/); // same event, newer version
  assert.match(to(c).subject, /^Invitation: Plan v2/);
  assert.equal(to(b).icalEvent!.content.match(/UID:(.*)/)![1], to(c).icalEvent!.content.match(/UID:(.*)/)![1]); // one calendar event
});

test("cancel a scheduled meeting: guests get a cancellation, the link stops working, it leaves the lists", async () => {
  const host = await signedIn("Canceller");
  const g = `g${unique()}@example.com`;
  const { roomCode } = (await host("POST", "/meetings", { title: "Offsite", scheduledFor: inHours(5), invitees: [g] })).body.data;
  await waitFor(() => devOutbox.some((e) => e.to === g));
  const before = devOutbox.length;
  assert.equal((await host("POST", `/meetings/${roomCode}/cancel`, {})).body.data.notified, 1);
  await waitFor(() => devOutbox.length > before);
  const mail = devOutbox.slice(before).find((e) => e.to === g)!;
  assert.match(mail.subject, /^Cancelled: Offsite/);
  assert.match(mail.icalEvent!.content, /STATUS:CANCELLED/);
  assert.equal((await browser()("GET", `/meetings/${roomCode}`)).body.error.code, "MEETING_CANCELLED");
  assert.equal((await browser()("POST", `/meetings/${roomCode}/token`, { name: "Late" })).body.error.code, "MEETING_CANCELLED");
  assert.equal((await host("GET", "/meetings/mine")).body.data.items.some((m: any) => m.roomCode === roomCode), false);
  assert.equal((await host("POST", `/meetings/${roomCode}/cancel`, {})).status, 410);
  assert.equal((await host("PATCH", `/meetings/${roomCode}/schedule`, { title: "Back on" })).status, 410);
});

test("a meeting that already started can't be edited or cancelled", async () => {
  const host = await signedIn("Starter");
  const { roomCode } = (await host("POST", "/meetings", { title: "Now", scheduledFor: inHours(1) })).body.data;
  await host("POST", `/meetings/${roomCode}/token`, { name: "Starter" }); // -> LIVE
  assert.equal((await host("PATCH", `/meetings/${roomCode}/schedule`, { title: "Later" })).body.error.code, "MEETING_STARTED");
  assert.equal((await host("POST", `/meetings/${roomCode}/cancel`, {})).body.error.code, "MEETING_STARTED");
});

test("email confirmation: link sent on sign-up; no invites until confirmed; link checks the address", async () => {
  const host = await signedIn("Una", { confirm: false });
  const me = await host("GET", "/auth/me");
  assert.equal(me.body.data.emailVerified, false);
  const token = await confirmLink(host.email);

  // unconfirmed: no scheduling, no invites, no dashboard data; quick meetings still work (like guests)
  const blocked = await host("POST", "/meetings", { title: "Sync", scheduledFor: inHours(5), invitees: ["x@example.com"] });
  assert.equal(blocked.status, 403);
  assert.equal(blocked.body.error.code, "EMAIL_NOT_VERIFIED");
  assert.equal((await host("POST", "/meetings", { title: "Solo", scheduledFor: inHours(5) })).status, 403);
  assert.equal((await host("GET", "/meetings/mine")).body.error.code, "EMAIL_NOT_VERIFIED");
  assert.equal((await host("GET", "/meetings/stats")).status, 403);
  assert.equal((await host("PATCH", "/me", { name: "X" })).status, 403);
  assert.equal((await host("POST", "/meetings", { title: "Quick" })).status, 201);

  // resend: needs sign-in; sends a new link
  assert.equal((await browser()("POST", "/auth/resend-verification")).status, 401);
  const before = devOutbox.filter((m) => m.to === host.email).length;
  assert.equal((await host("POST", "/auth/resend-verification")).body.data.alreadyVerified, false);
  assert.equal(devOutbox.filter((m) => m.to === host.email).length, before + 1);

  // bad links
  assert.equal((await browser()("POST", "/auth/verify-email", { token: "x".repeat(40) })).body.error.code, "VERIFY_LINK_INVALID");

  // the link works from any device, twice is fine
  const other = browser();
  assert.equal((await other("POST", "/auth/verify-email", { token })).status, 200);
  assert.equal((await other("POST", "/auth/verify-email", { token })).status, 200);
  assert.equal((await host("GET", "/auth/me")).body.data.emailVerified, true);
  assert.equal((await host("POST", "/meetings", { title: "Sync", scheduledFor: inHours(5), invitees: ["x@example.com"] })).status, 201);
  assert.equal((await host("POST", "/auth/resend-verification")).body.data.alreadyVerified, true);

  // a link stops working if the account's email changed since it was sent
  const changer = await signedIn("Cho", { confirm: false });
  const oldLink = await confirmLink(changer.email);
  await prisma.user.update({ where: { email: changer.email }, data: { email: `new${unique()}@example.com` } });
  assert.equal((await browser()("POST", "/auth/verify-email", { token: oldLink })).status, 400);
});

const mailsTo = (email: string, since: number) => devOutbox.slice(since).filter((m) => m.to === email);
const replyLink = (text: string, a: "yes" | "maybe" | "no") => text.match(new RegExp(`rsvp\\?t=([\\w.-]+)&a=${a}`))?.[1];

test("chat is kept with the meeting: only people in it can write and read it", async () => {
  const host = await signedIn("Chen");
  const { roomCode, hostKey } = (await host("POST", "/meetings", { title: "Chatty" })).body.data;
  const me = (await host("POST", `/meetings/${roomCode}/token`, { name: "Chen", hostKey })).body.data;
  assert.equal((await host("POST", `/meetings/${roomCode}/chat`, { participantId: me.participantId, text: "  Hello team  " })).status, 201);
  assert.equal((await browser()("POST", `/meetings/${roomCode}/chat`, { participantId: "nope-not-real", text: "spam" })).status, 403);
  assert.equal((await host("POST", `/meetings/${roomCode}/chat`, { participantId: me.participantId, text: "" })).status, 400);

  const rows = (await host("GET", `/meetings/${roomCode}/chat`)).body.data;
  assert.deepEqual(rows.map((r: any) => [r.senderName, r.text]), [["Chen", "Hello team"]]);
  assert.equal((await browser()("GET", `/meetings/${roomCode}/chat`)).status, 403);
  assert.equal((await host("GET", `/meetings/${roomCode}/notes`)).body.data.chatCount, 1);
});

test("reminders: once per meeting, 10-15 min before, to host + guests who didn't say no; cron needs the secret", async () => {
  const host = await signedIn("Remi");
  const yes = `yes${unique()}@example.com`;
  const no = `no${unique()}@example.com`;
  const made = await host("POST", "/meetings", { title: "Standup", scheduledFor: inHours(1), invitees: [yes, no] });
  const far = await host("POST", "/meetings", { title: "Later", scheduledFor: inHours(5), invitees: [yes] });
  await waitFor(() => devOutbox.some((m) => m.to === no && m.subject.includes("Standup")));
  const noToken = replyLink(devOutbox.findLast((m) => m.to === no && m.subject.includes("Standup"))!.text, "no")!;
  assert.equal((await browser()("POST", "/meetings/rsvp", { token: noToken, answer: "NO" })).status, 200);
  // move it to 10 minutes from now
  await prisma.meeting.update({ where: { roomCode: made.body.data.roomCode }, data: { scheduledFor: new Date(Date.now() + 10 * 60_000) } });

  assert.equal((await browser()("GET", "/cron/reminders")).status, 401);
  const before = devOutbox.length;
  const run = await sendDueReminders();
  assert.ok(run.emails >= 2);
  const reminders = devOutbox.slice(before).filter((m) => m.subject.startsWith("Starting"));
  const to = reminders.filter((m) => m.text.includes(`/m/${made.body.data.roomCode}`)).map((m) => m.to).sort();
  assert.deepEqual(to, [host.email, yes].sort()); // not to the one who said no
  const standup = reminders.find((m) => m.text.includes(`/m/${made.body.data.roomCode}`))!;
  assert.match(standup.subject, /in (9|10) minutes/);
  assert.match(standup.text, new RegExp(`/m/${made.body.data.roomCode}`));
  assert.equal(reminders.filter((m) => m.subject.includes("Later")).length, 0); // too far away

  const again = devOutbox.length;
  await sendDueReminders();
  const mine = (m: { text: string }) => m.text.includes(`/m/${made.body.data.roomCode}`); // this meeting only (older runs leave other "Standup"s)
  assert.equal(devOutbox.slice(again).filter(mine).length, 0); // only once
  assert.ok(far.body.data.roomCode);
});

test("guest replies: Yes / Maybe / No links; host sees counts; a new time clears them", async () => {
  const host = await signedIn("Rana");
  const guest = `g${unique()}@example.com`;
  const since = devOutbox.length;
  const { roomCode } = (await host("POST", "/meetings", { title: "Design review", scheduledFor: inHours(30), invitees: [guest] })).body.data;
  await waitFor(() => mailsTo(guest, since).length > 0);
  const mail = mailsTo(guest, since)[0]!;
  assert.match(mail.html, /Going\?/);
  const token = replyLink(mail.text, "maybe")!;

  const read = await browser()("POST", "/meetings/rsvp", { token });
  assert.equal(read.body.data.answer, null);
  assert.equal(read.body.data.title, "Design review");
  const ans = await browser()("POST", "/meetings/rsvp", { token, answer: "MAYBE" });
  assert.equal(ans.body.data.answer, "MAYBE");
  assert.equal(ans.body.data.link, `/m/${roomCode}`);
  assert.equal((await browser()("POST", "/meetings/rsvp", { token: "x".repeat(40), answer: "YES" })).status, 400);

  const item = (await host("GET", "/meetings/mine?status=upcoming")).body.data.items.find((m: any) => m.roomCode === roomCode);
  assert.deepEqual(item.replies, { yes: 0, maybe: 1, no: 0 });
  assert.deepEqual((await host("GET", `/meetings/${roomCode}/schedule`)).body.data.replies, [{ email: guest, response: "MAYBE" }]);

  await host("PATCH", `/meetings/${roomCode}/schedule`, { scheduledFor: inHours(31) });
  assert.deepEqual((await host("GET", `/meetings/${roomCode}/schedule`)).body.data.replies, [{ email: guest, response: null }]);
});

test("recurring: weekly series = separate meetings + one calendar series; series link; edit moves all; cancel one or all", async () => {
  const host = await signedIn("Sami");
  const guest = `s${unique()}@example.com`;
  const start = inHours(48);
  const since = devOutbox.length;
  const bad = await host("POST", "/meetings", { title: "No time", repeat: "WEEKLY", repeatCount: 3 });
  assert.equal(bad.status, 400);
  const made = await host("POST", "/meetings", { title: "Weekly sync", scheduledFor: start, repeat: "WEEKLY", repeatCount: 3, invitees: [guest] });
  assert.equal(made.status, 201);
  assert.equal(made.body.data.occurrences, 3);

  const list = (await host("GET", "/meetings/mine?status=upcoming&sort=soonest&q=Weekly%20sync")).body.data.items;
  assert.equal(list.length, 3);
  assert.ok(list.every((m: any) => m.recurrence === "WEEKLY" && m.seriesId === list[0].seriesId));
  assert.equal(new Date(list[1].scheduledFor).getTime() - new Date(list[0].scheduledFor).getTime(), 7 * 86_400_000);

  await waitFor(() => mailsTo(guest, since).length > 0);
  const invites = mailsTo(guest, since);
  assert.equal(invites.length, 1); // one email for the whole series
  const ics = invites[0]!.icalEvent!.content;
  assert.match(ics, /RRULE:FREQ=WEEKLY;COUNT=3/);
  assert.match(ics, new RegExp(`UID:series-${list[0].seriesId}@meetapp`));
  assert.match(invites[0]!.subject, /Weekly, 3 times/);
  assert.match(ics.replace(/\r\n /g, ""), new RegExp(`/s/${list[0].seriesId}`));

  // the series link opens the first one
  assert.equal((await browser()("GET", `/meetings/series/${list[0].seriesId}/current`)).body.data.roomCode, list[0].roomCode);

  // a reply counts for the whole series
  const token = replyLink(invites[0]!.text, "yes")!;
  await browser()("POST", "/meetings/rsvp", { token, answer: "YES" });
  const again = (await host("GET", "/meetings/mine?status=upcoming&q=Weekly%20sync")).body.data.items;
  assert.ok(again.every((m: any) => m.replies.yes === 1));

  // cancel just the first: guest gets a one-meeting cancellation; the link moves on to the second
  const s1 = devOutbox.length;
  assert.equal((await host("POST", `/meetings/${list[0].roomCode}/cancel`, { scope: "one" })).status, 200);
  await waitFor(() => mailsTo(guest, s1).length > 0);
  const c1 = mailsTo(guest, s1)[0]!;
  assert.match(c1.icalEvent!.content, /RECURRENCE-ID:/);
  assert.match(c1.html, /this one meeting/);
  assert.equal((await browser()("GET", `/meetings/series/${list[0].seriesId}/current`)).body.data.roomCode, list[1].roomCode);

  // edit the second: time +1 h moves the third too; guests get one updated series
  const s2 = devOutbox.length;
  const moved = new Date(new Date(list[1].scheduledFor).getTime() + 3_600_000).toISOString();
  const edit = await host("PATCH", `/meetings/${list[1].roomCode}/schedule`, { scheduledFor: moved, title: "Weekly sync v2" });
  assert.equal(edit.body.data.occurrences, 3); // updates every not-started meeting of the series
  const after = (await host("GET", "/meetings/mine?status=upcoming&sort=soonest&q=Weekly%20sync%20v2")).body.data.items;
  assert.equal(after.length, 2);
  assert.equal(new Date(after[1].scheduledFor).getTime(), new Date(list[2].scheduledFor).getTime() + 3_600_000);
  await waitFor(() => mailsTo(guest, s2).length > 0);
  const upd = mailsTo(guest, s2)[0]!;
  assert.match(upd.subject, /^Updated invitation: Weekly sync v2/);
  assert.match(upd.icalEvent!.content, /EXDATE:/); // the cancelled one stays off their calendar

  // cancel the rest
  const s3 = devOutbox.length;
  await host("POST", `/meetings/${list[1].roomCode}/cancel`, { scope: "series" });
  assert.equal((await host("GET", "/meetings/mine?q=Weekly%20sync")).body.data.items.length, 0);
  assert.equal((await browser()("GET", `/meetings/series/${list[0].seriesId}/current`)).status, 410);
  await waitFor(() => mailsTo(guest, s3).length > 0);
  assert.doesNotMatch(mailsTo(guest, s3)[0]!.icalEvent!.content, /RECURRENCE-ID/); // the whole series
});
