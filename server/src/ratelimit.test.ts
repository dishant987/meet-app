// Rate limits (fresh process = fresh counters). Needs the local database. Run: npm test
import { test, after } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
const { app } = await import("./app.js");
const { prisma } = await import("./config/db.js");
const server = app.listen(0);
const base = `http://localhost:${(server.address() as AddressInfo).port}/api`;
after(async () => {
  server.close();
  await prisma.$disconnect();
});
const post = (path: string, body: unknown, ip: string) =>
  fetch(base + path, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify(body) });

test("login: 5 wrong passwords for one email (even from different IPs) → locked with a wait time; others unaffected", async () => {
  const email = `rl${Date.now()}@example.com`;
  assert.equal((await post("/auth/register", { name: "R", email, password: "right-password" }, "10.9.0.1")).status, 201);

  // successful logins don't count toward the limit
  for (let i = 0; i < 6; i++) assert.equal((await post("/auth/login", { email, password: "right-password" }, "10.9.0.2")).status, 200);

  for (let i = 0; i < 5; i++) assert.equal((await post("/auth/login", { email, password: "wrong" }, `10.9.1.${i}`)).status, 401);
  const blocked = await post("/auth/login", { email, password: "right-password" }, "10.9.2.1"); // new IP, right password
  assert.equal(blocked.status, 429);
  const body = (await blocked.json()) as any;
  assert.match(body.error.message, /wait \d+ (seconds|minutes)/);
  assert.ok(body.error.details.retryAfterSeconds > 0);
  assert.ok(blocked.headers.get("retry-after"));

  // a different account is not affected
  const other = `rl2${Date.now()}@example.com`;
  await post("/auth/register", { name: "S", email: other, password: "other-password" }, "10.9.3.1");
  assert.equal((await post("/auth/login", { email: other, password: "other-password" }, "10.9.3.1")).status, 200);
});

test("sign-up: 6th new account from one IP within an hour is blocked", async () => {
  const ip = "10.8.0.1";
  for (let i = 0; i < 5; i++)
    assert.equal((await post("/auth/register", { name: "N", email: `su${Date.now()}${i}@example.com`, password: "password-123" }, ip)).status, 201);
  assert.equal((await post("/auth/register", { name: "N", email: `su${Date.now()}x@example.com`, password: "password-123" }, ip)).status, 429);
});

test("health check is never limited", async () => {
  for (let i = 0; i < 310; i++) {
    const r = await fetch(base + "/health", { headers: { "x-forwarded-for": "10.7.0.1" } });
    assert.notEqual(r.status, 429);
  }
});
