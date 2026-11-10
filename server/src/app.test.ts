// Needs the local database (docker compose up -d). Run: npm test
import { test, after } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { app } from "./app.js";
import { prisma } from "./config/db.js";

const server = app.listen(0);
const base = `http://localhost:${(server.address() as AddressInfo).port}/api`;
after(async () => {
  server.close();
  await prisma.$disconnect();
});

const post = (path: string, body: string) =>
  fetch(base + path, { method: "POST", headers: { "content-type": "application/json" }, body });

test("create → get → join a meeting", async () => {
  const created = await (await post("/meetings", '{"title":"T"}')).json();
  assert.match(created.data.roomCode, /^[a-z]{3}-[a-z]{4}-[a-z]{3}$/);

  const joined = await (await post(`/meetings/${created.data.roomCode}/token`, '{"name":"Asha"}')).json();
  assert.equal(joined.success, true);
  assert.ok(joined.data.token.split(".").length === 3, "token is a JWT");
  assert.equal(joined.data.meeting.roomCode, created.data.roomCode);
});

test("errors always use the same JSON shape", async () => {
  const cases: [Promise<Response>, number, string][] = [
    [post("/meetings", "{bad"), 400, "INVALID_JSON"],
    [post("/meetings/aaa-bbbb-ccc/token", '{"name":"A"}'), 404, "MEETING_NOT_FOUND"],
    [post("/meetings/aaa-bbbb-ccc/token", '{"name":""}'), 400, "VALIDATION_ERROR"],
    [fetch(base + "/meetings/BAD"), 400, "VALIDATION_ERROR"],
    [fetch(base + "/nope"), 404, "ROUTE_NOT_FOUND"],
  ];
  for (const [req, status, code] of cases) {
    const res = await req;
    const body = await res.json();
    assert.equal(res.status, status, code);
    assert.equal(body.success, false);
    assert.equal(body.error.code, code);
    assert.ok(body.requestId);
  }
});

test("transcript: a participant saves lines under their own name; strangers can't", async () => {
  const { data: m } = await (await post("/meetings", "{}")).json();
  const { data: joined } = await (await post(`/meetings/${m.roomCode}/token`, '{"name":"Asha"}')).json();
  const line = (text: string) => ({ text, spokenAt: new Date().toISOString() });

  const ok = await post(`/meetings/${m.roomCode}/transcript`, JSON.stringify({ participantId: joined.participantId, lines: [line("Hello team"), line("Let's start")] }));
  assert.equal(ok.status, 201);
  assert.equal((await ok.json()).data.saved, 2);
  const rows = await prisma.transcript.findMany({ where: { meetingId: m.id }, orderBy: { spokenAt: "asc" } });
  assert.deepEqual(rows.map((r) => [r.speakerName, r.text]), [["Asha", "Hello team"], ["Asha", "Let's start"]]);

  const stranger = await post(`/meetings/${m.roomCode}/transcript`, JSON.stringify({ participantId: "not-a-real-id", lines: [line("hi")] }));
  assert.equal(stranger.status, 403);
  assert.equal((await stranger.json()).error.code, "NOT_IN_MEETING");

  const empty = await post(`/meetings/${m.roomCode}/transcript`, JSON.stringify({ participantId: joined.participantId, lines: [] }));
  assert.equal(empty.status, 400);
});
