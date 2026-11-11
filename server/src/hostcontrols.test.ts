// Waiting room ("Ask to join"), lock, mute and remove. LiveKit calls are faked and recorded.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";

const realFetch = globalThis.fetch;
const livekitCalls: string[] = [];
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  if (url.hostname === "localhost") return realFetch(input, init);
  if (url.hostname.endsWith("livekit.cloud")) {
    const method = url.pathname.split("/").pop()!; // e.g. RemoveParticipant
    livekitCalls.push(method);
    return new Response(JSON.stringify(method === "ListParticipants" ? { participants: [] } : {}), { status: 200 });
  }
  return new Response(JSON.stringify({ choices: [{ message: { content: "{}" } }] }), { status: 200 });
}) as typeof fetch;

process.env.SMTP_HOST = "";
const { app } = await import("./app.js");
const { prisma } = await import("./config/db.js");
const server = app.listen(0);
const base = `http://localhost:${(server.address() as AddressInfo).port}/api`;
after(async () => {
  server.close();
  await prisma.$disconnect();
});

function browser() {
  let cookie = "";
  const ip = `10.7.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
  return async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
    const res = await realFetch(base + path, {
      method,
      headers: { "content-type": "application/json", "x-forwarded-for": ip, ...(cookie ? { cookie } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0]!;
    return { status: res.status, body: (await res.json().catch(() => null)) as any };
  };
}
const unique = () => `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;

async function hostedMeeting() {
  const host = browser();
  await host("POST", "/auth/register", { name: "Host", email: `h${unique()}@example.com`, password: "password-1" });
  const { roomCode, hostKey } = (await host("POST", "/meetings", { title: "Standup" })).body.data;
  const me = (await host("POST", `/meetings/${roomCode}/token`, { name: "Host" })).body.data;
  return { host, roomCode, hostKey, hostParticipantId: me.participantId as string };
}

test("ask to join: guest waits, host sees and admits, guest gets in; waiting people aren't members", async () => {
  const { host, roomCode } = await hostedMeeting();
  assert.deepEqual((await host("PATCH", `/meetings/${roomCode}/settings`, { waitingRoom: true })).body.data, { waitingRoom: true, locked: false });

  const guest = browser();
  const ask = (await guest("POST", `/meetings/${roomCode}/token`, { name: "Gita" })).body.data;
  assert.equal(ask.waiting, true);
  assert.equal(ask.token, undefined); // no way into the call yet
  assert.equal((await guest("POST", `/meetings/${roomCode}/requests/${ask.requestId}`, { ticket: ask.ticket })).body.data.waiting, true);
  assert.equal((await guest("POST", `/meetings/${roomCode}/requests/${ask.requestId}`, { ticket: "wrong" })).status, 404);
  assert.equal((await guest("GET", `/meetings/${roomCode}/notes`, undefined, { "x-participant-id": ask.requestId })).status, 403);
  assert.equal((await guest("GET", `/meetings/${roomCode}/waiting`)).status, 403); // host only

  const list = (await host("GET", `/meetings/${roomCode}/waiting`)).body.data;
  assert.deepEqual(list.waiting.map((w: any) => w.name), ["Gita"]);

  assert.equal((await host("POST", `/meetings/${roomCode}/waiting/${ask.requestId}`, { admit: true })).status, 200);
  const inside = (await guest("POST", `/meetings/${roomCode}/requests/${ask.requestId}`, { ticket: ask.ticket })).body.data;
  assert.equal(inside.waiting, false);
  assert.ok(inside.token);
  assert.equal(inside.isHost, false);
  assert.equal((await host("GET", `/meetings/${roomCode}/waiting`)).body.data.waiting.length, 0);
});

test("denied guest is told so; turning ask-to-join off lets everyone waiting in; host key skips the wait", async () => {
  const { host, roomCode, hostKey } = await hostedMeeting();
  await host("PATCH", `/meetings/${roomCode}/settings`, { waitingRoom: true });

  const a = browser();
  const askA = (await a("POST", `/meetings/${roomCode}/token`, { name: "A" })).body.data;
  await host("POST", `/meetings/${roomCode}/waiting/${askA.requestId}`, { admit: false });
  assert.equal((await a("POST", `/meetings/${roomCode}/requests/${askA.requestId}`, { ticket: askA.ticket })).body.error.code, "JOIN_DENIED");

  const b = browser();
  const askB = (await b("POST", `/meetings/${roomCode}/token`, { name: "B" })).body.data;
  await host("PATCH", `/meetings/${roomCode}/settings`, { waitingRoom: false });
  assert.ok((await b("POST", `/meetings/${roomCode}/requests/${askB.requestId}`, { ticket: askB.ticket })).body.data.token);

  await host("PATCH", `/meetings/${roomCode}/settings`, { waitingRoom: true });
  const otherDevice = (await browser()("POST", `/meetings/${roomCode}/token`, { name: "Host phone", hostKey })).body.data;
  assert.equal(otherDevice.waiting, false);
  assert.equal(otherDevice.isHost, true);
});

test("locked meeting: new guests are refused, the host still gets in", async () => {
  const { host, roomCode } = await hostedMeeting();
  await host("PATCH", `/meetings/${roomCode}/settings`, { locked: true });
  assert.equal((await browser()("POST", `/meetings/${roomCode}/token`, { name: "Late" })).body.error.code, "MEETING_LOCKED");
  assert.ok((await host("POST", `/meetings/${roomCode}/token`, { name: "Host" })).body.data.token);
  assert.equal((await host("PATCH", `/meetings/${roomCode}/settings`, {})).status, 400); // nothing to change
});

test("host mutes and removes a guest; can't target a host; others can't do it", async () => {
  const { host, roomCode, hostParticipantId } = await hostedMeeting();
  const guest = browser();
  const g = (await guest("POST", `/meetings/${roomCode}/token`, { name: "Guest" })).body.data;

  assert.equal((await guest("POST", `/meetings/${roomCode}/participants/${hostParticipantId}/mute`, {})).status, 403);
  assert.equal((await host("POST", `/meetings/${roomCode}/participants/${hostParticipantId}/mute`, {})).body.error.code, "CANNOT_TARGET_HOST");

  livekitCalls.length = 0;
  assert.equal((await host("POST", `/meetings/${roomCode}/participants/${g.participantId}/mute`, {})).status, 200);
  assert.ok(livekitCalls.includes("GetParticipant"));

  assert.equal((await host("POST", `/meetings/${roomCode}/participants/${g.participantId}/remove`, {})).status, 200);
  assert.ok(livekitCalls.includes("RemoveParticipant"));
  // removed: can't write captions any more
  const line = { participantId: g.participantId, lines: [{ text: "hi", spokenAt: new Date().toISOString() }] };
  assert.equal((await guest("POST", `/meetings/${roomCode}/transcript`, line)).status, 403);
  assert.equal((await host("POST", `/meetings/${roomCode}/participants/${g.participantId}/remove`, {})).status, 404);
});

test("a removed signed-in person can't come straight back", async () => {
  const { host, roomCode } = await hostedMeeting();
  const member = browser();
  await member("POST", "/auth/register", { name: "M", email: `m${unique()}@example.com`, password: "password-1" });
  const m = (await member("POST", `/meetings/${roomCode}/token`, { name: "M" })).body.data;
  await host("POST", `/meetings/${roomCode}/participants/${m.participantId}/remove`, {});
  assert.equal((await member("POST", `/meetings/${roomCode}/token`, { name: "M" })).body.error.code, "REMOVED_FROM_MEETING");
});
