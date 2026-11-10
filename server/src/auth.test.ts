// Accounts + linking meetings to accounts. Needs the local database. Run: npm test
import { test, after } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";

// pretend LiveKit (ending a meeting closes the room) — no real network
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  if (url.hostname === "localhost") return realFetch(input, init);
  return new Response(JSON.stringify({ participants: [] }), { status: 200 });
}) as typeof fetch;

const { app } = await import("./app.js");
const { prisma } = await import("./config/db.js");
const server = app.listen(0);
const base = `http://localhost:${(server.address() as AddressInfo).port}/api`;
after(async () => {
  server.close();
  await prisma.$disconnect();
});

/** Tiny cookie-keeping client, like one browser. */
function browser() {
  let cookie = "";
  // each pretend browser gets its own IP so the sign-up rate limit (5/min per IP) doesn't block the tests
  const ip = `10.0.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
  return async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
    const res = await realFetch(base + path, {
      method,
      headers: { "content-type": "application/json", "x-forwarded-for": ip, ...(cookie ? { cookie } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0]!.endsWith("=") ? "" : set.split(";")[0]!;
    return { status: res.status, setCookie: set, body: (await res.json()) as any };
  };
}
const email = () => `user${Date.now()}${Math.random().toString(36).slice(2, 6)}@example.com`;

test("register → signed in; duplicate email; weak password; logout", async () => {
  const b = browser();
  const e = email();
  const reg = await b("POST", "/auth/register", { name: "Asha", email: e.toUpperCase(), password: "correct horse" });
  assert.equal(reg.status, 201);
  assert.equal(reg.body.data.email, e); // stored lower-case
  assert.match(reg.setCookie!, /HttpOnly/i);
  assert.equal(reg.body.data.passwordHash, undefined);
  assert.equal((await b("GET", "/auth/me")).body.data.name, "Asha");

  assert.equal((await browser()("POST", "/auth/register", { name: "X", email: e, password: "another one" })).body.error.code, "EMAIL_TAKEN");
  assert.equal((await browser()("POST", "/auth/register", { name: "X", email: email(), password: "short" })).status, 400);

  await b("POST", "/auth/logout");
  assert.equal((await b("GET", "/auth/me")).body.data, null);
});

test("login: wrong password / unknown email → same error; right password → session; tampered cookie ignored", async () => {
  const e = email();
  await browser()("POST", "/auth/register", { name: "Ravi", email: e, password: "ravi-password" });
  const b = browser();
  const wrong = await b("POST", "/auth/login", { email: e, password: "nope-nope" });
  const unknown = await b("POST", "/auth/login", { email: email(), password: "nope-nope" });
  assert.equal(wrong.status, 401);
  assert.deepEqual(wrong.body.error.message, unknown.body.error.message);

  assert.equal((await b("POST", "/auth/login", { email: e, password: "ravi-password" })).status, 200);
  assert.equal((await b("GET", "/auth/me")).body.data.name, "Ravi");

  const forged = await realFetch(base + "/auth/me", { headers: { cookie: "session=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.bad" } });
  assert.equal(((await forged.json()) as any).data, null);
});

test("signed-in host & member: host without key, notes from any device, My meetings", async () => {
  const host = browser();
  await host("POST", "/auth/register", { name: "Host", email: email(), password: "host-password" });
  const member = browser();
  await member("POST", "/auth/register", { name: "Member", email: email(), password: "member-password" });
  const other = browser();
  await other("POST", "/auth/register", { name: "Other", email: email(), password: "other-password" });

  const created = await host("POST", "/meetings", { title: "Weekly sync" });
  const { roomCode } = created.body.data;
  await member("POST", `/meetings/${roomCode}/token`, { name: "Member" });

  // host ends it with no host key — recognised by the session
  assert.equal((await host("POST", `/meetings/${roomCode}/end`, {})).status, 200);
  assert.equal((await member("POST", `/meetings/${roomCode}/end`, {})).body.error.code, "HOST_ONLY");

  // member reads notes with only the session (as if on another device: no participant header)
  const notes = await member("GET", `/meetings/${roomCode}/notes`);
  assert.equal(notes.status, 200);
  assert.equal(notes.body.data.isHost, false);
  assert.equal((await other("GET", `/meetings/${roomCode}/notes`)).status, 403);

  const hostList = (await host("GET", "/meetings/mine")).body.data;
  const memberList = (await member("GET", "/meetings/mine")).body.data;
  assert.equal(hostList[0].roomCode, roomCode);
  assert.equal(hostList[0].isHost, true);
  assert.equal(memberList[0].roomCode, roomCode);
  assert.equal(memberList[0].isHost, false);
  assert.equal((await other("GET", "/meetings/mine")).body.data.length, 0);
  assert.equal((await browser()("GET", "/meetings/mine")).status, 401);
});
