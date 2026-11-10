// Notes flow with a pretend AI and pretend LiveKit (no real network). Needs the local database. Run: npm test
import { test, after } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";

// --- intercept outgoing calls to AI providers and LiveKit; let localhost through ---
const realFetch = globalThis.fetch;
const aiCalls: string[] = [];
let aiReply: (host: string) => Response = () => new Response("{}", { status: 500 });
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  if (url.hostname === "localhost") return realFetch(input, init);
  if (url.hostname.endsWith("livekit.cloud")) return new Response(JSON.stringify({ participants: [] }), { status: 200 });
  aiCalls.push(url.hostname);
  return aiReply(url.hostname);
}) as typeof fetch;

const { app } = await import("./app.js");
const { prisma } = await import("./config/db.js");

const server = app.listen(0);
const base = `http://localhost:${(server.address() as AddressInfo).port}/api`;
after(async () => {
  server.close();
  await prisma.$disconnect();
});

const call = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
  realFetch(base + path, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const json = async (r: Response) => (await r.json()) as any;

const NOTES = {
  title: "Launch planning",
  summary: "The team agreed on the launch date.",
  keyPoints: ["Launch date"],
  decisions: ["Launch on 15 Nov"],
  actionItems: [{ task: "Send the press release", owner: "Asha", dueDate: "Friday" }, { task: "Book the venue" }],
  openQuestions: [],
};
const chatAnswer = (content: string) =>
  new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200, headers: { "content-type": "application/json" } });

async function meetingWithSpeech(lines: string[]) {
  const created = await json(await call("POST", "/meetings", {}));
  const { roomCode, hostKey } = created.data;
  const joined = await json(await call("POST", `/meetings/${roomCode}/token`, { name: "Asha" }));
  const participantId = joined.data.participantId;
  if (lines.length)
    await call("POST", `/meetings/${roomCode}/transcript`, {
      participantId,
      lines: lines.map((text) => ({ text, spokenAt: new Date().toISOString() })),
    });
  return { roomCode, hostKey, participantId, created };
}

async function waitForNotes(roomCode: string, headers: Record<string, string>) {
  for (let i = 0; i < 40; i++) {
    const { data } = await json(await call("GET", `/meetings/${roomCode}/notes`, undefined, headers));
    if (data.notes && data.notes.status !== "PENDING") return data;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("notes never finished");
}

test("host key: only returned on create, never on GET", async () => {
  const { roomCode, created } = await meetingWithSpeech([]);
  assert.ok(created.data.hostKey.length >= 30);
  const got = await json(await call("GET", `/meetings/${roomCode}`));
  assert.equal(got.data.hostKey, undefined);
});

test("end meeting → AI notes ready; only members can read; meeting closed to new joins", async () => {
  aiReply = (host) => (host === "api.mistral.ai" ? chatAnswer("```json\n" + JSON.stringify(NOTES) + "\n```") : new Response("", { status: 500 }));
  const { roomCode, hostKey, participantId } = await meetingWithSpeech(["We launch on 15 Nov", "Asha sends the press release by Friday"]);

  assert.equal((await json(await call("POST", `/meetings/${roomCode}/end`, { hostKey: "wrong" }))).error.code, "HOST_ONLY");
  assert.equal((await call("POST", `/meetings/${roomCode}/end`, { hostKey })).status, 200);

  const stranger = await call("GET", `/meetings/${roomCode}/notes`);
  assert.equal(stranger.status, 403);

  const data = await waitForNotes(roomCode, { "x-participant-id": participantId });
  assert.equal(data.notes.status, "READY");
  assert.equal(data.notes.provider, "mistral");
  assert.equal(data.notes.title, "Launch planning");
  assert.deepEqual(data.notes.actionItems[1], { task: "Book the venue", owner: null, dueDate: null });
  assert.deepEqual(data.attendees, ["Asha"]);
  assert.equal(data.isHost, false);
  assert.equal(data.meeting.hostKey, undefined);

  const late = await call("POST", `/meetings/${roomCode}/token`, { name: "Late" });
  assert.equal(late.status, 410);

  const transcript = await json(await call("GET", `/meetings/${roomCode}/transcript`, undefined, { "x-host-key": hostKey }));
  assert.equal(transcript.data.length, 2);
});

test("falls back to the next AI when one fails (Mistral 400 → Gemini)", async () => {
  aiCalls.length = 0;
  aiReply = (host) =>
    host === "api.mistral.ai" ? new Response("bad request", { status: 400 }) : chatAnswer(JSON.stringify({ ...NOTES, title: "From Gemini" }));
  const { roomCode, hostKey } = await meetingWithSpeech(["Some talk"]);
  await call("POST", `/meetings/${roomCode}/end`, { hostKey });
  const data = await waitForNotes(roomCode, { "x-host-key": hostKey });
  assert.equal(data.notes.provider, "gemini");
  assert.equal(data.notes.title, "From Gemini");
  assert.equal(data.isHost, true);
  assert.deepEqual(aiCalls.slice(0, 2), ["api.mistral.ai", "generativelanguage.googleapis.com"]);
});

test("all AIs fail → FAILED with a reason; transcript kept; host can retry", async () => {
  aiReply = () => new Response("nope", { status: 401 });
  const { roomCode, hostKey } = await meetingWithSpeech(["Hello"]);
  await call("POST", `/meetings/${roomCode}/end`, { hostKey });
  const failed = await waitForNotes(roomCode, { "x-host-key": hostKey });
  assert.equal(failed.notes.status, "FAILED");
  assert.match(failed.notes.error, /mistral/);
  assert.equal(failed.lineCount, 1);

  aiReply = () => chatAnswer(JSON.stringify(NOTES));
  assert.equal((await call("POST", `/meetings/${roomCode}/notes/regenerate`, { hostKey })).status, 202);
  assert.equal((await waitForNotes(roomCode, { "x-host-key": hostKey })).notes.status, "READY");
});

test("nothing was said → EMPTY, no AI call", async () => {
  aiCalls.length = 0;
  const { roomCode, hostKey } = await meetingWithSpeech([]);
  await call("POST", `/meetings/${roomCode}/end`, { hostKey });
  assert.equal((await waitForNotes(roomCode, { "x-host-key": hostKey })).notes.status, "EMPTY");
  assert.equal(aiCalls.length, 0);
});

test("everyone left without pressing End → opening notes ends the meeting and writes them", async () => {
  aiReply = () => chatAnswer(JSON.stringify(NOTES));
  const { roomCode, participantId } = await meetingWithSpeech(["Bye all"]);
  const data = await waitForNotes(roomCode, { "x-participant-id": participantId }); // pretend LiveKit says the room is empty
  assert.equal(data.notes.status, "READY");
  assert.equal(data.meeting.status, "ENDED");
});

test("host edits notes; others can't", async () => {
  aiReply = () => chatAnswer(JSON.stringify(NOTES));
  const { roomCode, hostKey, participantId } = await meetingWithSpeech(["Hi"]);
  await call("POST", `/meetings/${roomCode}/end`, { hostKey });
  await waitForNotes(roomCode, { "x-host-key": hostKey });

  const edited = { ...NOTES, summary: "Edited by host" };
  const ok = await json(await call("PATCH", `/meetings/${roomCode}/notes`, { hostKey, notes: edited }));
  assert.equal(ok.data.summary, "Edited by host");
  assert.equal(ok.data.edited, true);

  const notHost = await call("PATCH", `/meetings/${roomCode}/notes`, { hostKey: participantId, notes: edited });
  assert.equal(notHost.status, 403);
  const bad = await call("PATCH", `/meetings/${roomCode}/notes`, { hostKey, notes: { actionItems: "oops" } });
  assert.equal(bad.status, 400);
});
