// Profile: name, photo, password. Needs the local database. Run: npm test
import { test, after } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
const { app } = await import("./app.js");
const { prisma } = await import("./config/db.js");
const server = app.listen(0);
const origin = `http://localhost:${(server.address() as AddressInfo).port}`;
const base = `${origin}/api`;
after(async () => {
  server.close();
  await prisma.$disconnect();
});

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");

function browser() {
  let cookie = "";
  const ip = `10.6.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
  return async (method: string, path: string, body?: unknown, type = "application/json") => {
    const res = await fetch(base + path, {
      method,
      headers: { "content-type": type, "x-forwarded-for": ip, ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : Buffer.isBuffer(body) ? new Uint8Array(body) : JSON.stringify(body),
    });
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0]!;
    // test accounts confirm their email straight away (the confirmation flow has its own test)
    if (path === "/auth/register" && res.status === 201)
      await prisma.user.update({ where: { email: String((body as { email: string }).email).trim().toLowerCase() }, data: { emailVerifiedAt: new Date() } });
    return { status: res.status, body: (await res.json().catch(() => null)) as any };
  };
}

test("name and photo: update, serve, reject fakes and big files, remove", async () => {
  const b = browser();
  await b("POST", "/auth/register", { name: "Old Name", email: `p${Date.now()}@example.com`, password: "password-123" });
  assert.equal((await b("PATCH", "/me", { name: "  New Name  " })).body.data.name, "New Name");
  assert.equal((await b("PATCH", "/me", { name: "" })).status, 400);

  const up = await b("PUT", "/me/avatar", PNG, "image/png");
  assert.equal(up.status, 200);
  const url: string = up.body.data.avatarUrl;
  assert.match(url, /^\/api\/users\/.+\/avatar\?v=1$/);

  const img = await fetch(origin + url);
  assert.equal(img.headers.get("content-type"), "image/png");
  assert.match(img.headers.get("cache-control")!, /immutable/);
  assert.equal(img.headers.get("cross-origin-resource-policy"), "cross-origin");
  assert.deepEqual(Buffer.from(await img.arrayBuffer()), PNG);

  assert.equal((await b("PUT", "/me/avatar", Buffer.from("<script>alert(1)</script>"), "image/png")).status, 415); // not really a PNG
  assert.equal((await b("PUT", "/me/avatar", Buffer.alloc(300 * 1024, 1), "image/png")).status, 413); // too big
  assert.equal((await b("PUT", "/me/avatar", PNG, "text/plain")).status, 400); // wrong type: no image body

  const removed = await b("DELETE", "/me/avatar");
  assert.equal(removed.body.data.avatarUrl, null);
  assert.equal((await fetch(origin + url)).status, 404);
});

test("password: wrong current refused; new one works; signed-out can't touch /me", async () => {
  const email = `pw${Date.now()}@example.com`;
  const b = browser();
  await b("POST", "/auth/register", { name: "P", email, password: "first-password" });
  const wrong = await b("POST", "/me/password", { currentPassword: "nope", newPassword: "second-password" });
  assert.equal(wrong.status, 400);
  assert.equal(wrong.body.error.code, "WRONG_PASSWORD");
  assert.equal((await b("POST", "/me/password", { currentPassword: "first-password", newPassword: "second-password" })).status, 200);
  assert.equal((await browser()("POST", "/auth/login", { email, password: "second-password" })).status, 200);
  assert.equal((await browser()("POST", "/auth/login", { email, password: "first-password" })).status, 401);
  assert.equal((await browser()("PATCH", "/me", { name: "X" })).status, 401);
});

test("photo travels into the call: join token carries the avatar attribute", async () => {
  const b = browser();
  await b("POST", "/auth/register", { name: "Cam", email: `c${Date.now()}@example.com`, password: "password-123" });
  const { body } = await b("PUT", "/me/avatar", PNG, "image/png");
  const { roomCode } = (await b("POST", "/meetings", {})).body.data;
  const { token } = (await b("POST", `/meetings/${roomCode}/token`, { name: "Cam" })).body.data;
  const claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
  assert.equal(claims.attributes.avatar, body.data.avatarUrl);
});
