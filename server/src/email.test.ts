// Forgot password, session ending, and emailed notes. Emails land in the dev outbox (no SMTP settings in tests).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";

// pretend AI + LiveKit (no real network)
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  if (url.hostname === "localhost") return realFetch(input, init);
  if (url.hostname.endsWith("livekit.cloud")) return new Response(JSON.stringify({ participants: [] }), { status: 200 });
  const notes = { title: "Sprint review", summary: "We shipped login.", keyPoints: [], decisions: ["Ship Friday"], actionItems: [{ task: "Write docs", owner: "Asha", dueDate: "Mon" }], openQuestions: [] };
  return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(notes) } }] }), { status: 200 });
}) as typeof fetch;

process.env.SMTP_HOST = ""; // never send real emails from tests (empty = not set; .env can't refill it)
const { app } = await import("./app.js");
const { prisma } = await import("./config/db.js");
const { devOutbox } = await import("./services/email.service.js");
const server = app.listen(0);
const base = `http://localhost:${(server.address() as AddressInfo).port}/api`;
after(async () => {
  server.close();
  await prisma.$disconnect();
});

function browser() {
  let cookie = "";
  const ip = `10.5.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
  const call = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
    const res = await realFetch(base + path, {
      method,
      headers: { "content-type": "application/json", "x-forwarded-for": ip, ...(cookie ? { cookie } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0]!;
    return { status: res.status, body: (await res.json().catch(() => null)) as any };
  };
  return Object.assign(call, { getCookie: () => cookie, setCookie: (c: string) => (cookie = c) });
}
const unique = () => `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
const tokenFrom = (text: string) => text.match(/reset-password\?token=([\w-]+)/)?.[1];

test("forgot password: same answer for unknown emails; link works once; newest link only; sessions end", async () => {
  const email = `fp${unique()}@example.com`;
  const laptop = browser();
  await laptop("POST", "/auth/register", { name: "Fay", email, password: "old-password" });
  const phone = browser();
  await phone("POST", "/auth/login", { email, password: "old-password" });
  assert.equal((await phone("GET", "/auth/me")).body.data.email, email);

  const before = devOutbox.length;
  const unknown = await browser()("POST", "/auth/forgot-password", { email: `nobody${unique()}@example.com` });
  const known = await browser()("POST", "/auth/forgot-password", { email });
  assert.equal(unknown.status, 200);
  assert.deepEqual(unknown.body, known.body); // can't tell which emails exist
  assert.equal(devOutbox.length, before + 1);
  const firstToken = tokenFrom(devOutbox.at(-1)!.text)!;
  assert.equal(devOutbox.at(-1)!.to, email);

  await browser()("POST", "/auth/forgot-password", { email }); // a newer link replaces the older one
  const token = tokenFrom(devOutbox.at(-1)!.text)!;
  assert.equal((await browser()("POST", "/auth/reset-password", { token: firstToken, password: "new-password" })).body.error.code, "RESET_LINK_INVALID");

  const resetter = browser();
  const ok = await resetter("POST", "/auth/reset-password", { token, password: "new-password" });
  assert.equal(ok.status, 200);
  assert.equal((await resetter("GET", "/auth/me")).body.data.email, email); // signed in right away
  assert.equal((await resetter("POST", "/auth/reset-password", { token, password: "again-password" })).status, 400); // used up

  assert.equal((await phone("GET", "/auth/me")).body.data, null); // old sessions ended
  assert.equal((await laptop("GET", "/auth/me")).body.data, null);
  assert.equal((await browser()("POST", "/auth/login", { email, password: "new-password" })).status, 200);
  assert.equal((await browser()("POST", "/auth/login", { email, password: "old-password" })).status, 401);
});

test("expired reset link is refused", async () => {
  const email = `exp${unique()}@example.com`;
  await browser()("POST", "/auth/register", { name: "E", email, password: "password-1" });
  await browser()("POST", "/auth/forgot-password", { email });
  const token = tokenFrom(devOutbox.at(-1)!.text)!;
  await prisma.passwordReset.updateMany({ where: { user: { email } }, data: { expiresAt: new Date(Date.now() - 1000) } });
  assert.equal((await browser()("POST", "/auth/reset-password", { token, password: "password-2" })).body.error.code, "RESET_LINK_INVALID");
});

test("changing password keeps this device signed in and signs out the others", async () => {
  const email = `cp${unique()}@example.com`;
  const here = browser();
  await here("POST", "/auth/register", { name: "C", email, password: "password-1" });
  const there = browser();
  there.setCookie(here.getCookie()); // same session on another device
  assert.equal((await here("POST", "/me/password", { currentPassword: "password-1", newPassword: "password-2" })).status, 200);
  assert.equal((await here("GET", "/auth/me")).body.data.email, email);
  assert.equal((await there("GET", "/auth/me")).body.data, null);
});

test("notes are emailed once, one email per signed-in attendee (not guests); host can resend, others can't", async () => {
  const host = browser();
  const hostEmail = `host${unique()}@example.com`;
  await host("POST", "/auth/register", { name: "Host", email: hostEmail, password: "password-1" });
  const member = browser();
  const memberEmail = `mem${unique()}@example.com`;
  await member("POST", "/auth/register", { name: "Member", email: memberEmail, password: "password-1" });

  const { roomCode } = (await host("POST", "/meetings", { title: "Sprint" })).body.data;
  const h = (await host("POST", `/meetings/${roomCode}/token`, { name: "Host" })).body.data;
  await member("POST", `/meetings/${roomCode}/token`, { name: "Member" });
  await browser()("POST", `/meetings/${roomCode}/token`, { name: "Guest" });
  await host("POST", `/meetings/${roomCode}/transcript`, { participantId: h.participantId, lines: [{ text: "We ship Friday", spokenAt: new Date().toISOString() }] });

  const before = devOutbox.length;
  await host("POST", `/meetings/${roomCode}/end`, {});
  for (let i = 0; i < 50 && devOutbox.length < before + 2; i++) await new Promise((r) => setTimeout(r, 100));
  const sent = devOutbox.slice(before);
  assert.deepEqual(sent.map((e) => e.to).sort(), [hostEmail, memberEmail].sort()); // individually, no guest
  assert.match(sent[0]!.subject, /^Notes: Sprint review/);
  assert.match(sent[0]!.text, new RegExp(`/m/${roomCode}/notes`));
  assert.match(sent[0]!.html, /Write docs/);

  // opening the notes later doesn't email again
  await member("GET", `/meetings/${roomCode}/notes`);
  assert.equal(devOutbox.length, before + 2);

  assert.equal((await host("POST", `/meetings/${roomCode}/notes/email`, {})).body.data.sent, 2);
  assert.equal((await member("POST", `/meetings/${roomCode}/notes/email`, {})).status, 403);
});
