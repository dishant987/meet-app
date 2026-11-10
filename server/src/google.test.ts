// Google sign-in, with a pretend Google (our own signing key). Needs the local database. Run: npm test
process.env.GOOGLE_CLIENT_ID = "test-client.apps.googleusercontent.com"; // before the app reads env
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from "jose";

const { loginWithGoogle, login } = await import("./services/auth.service.js");
const { prisma } = await import("./config/db.js");
after(() => prisma.$disconnect());

const google = await generateKeyPair("RS256");
const stranger = await generateKeyPair("RS256");
const keys = createLocalJWKSet({ keys: [{ ...(await exportJWK(google.publicKey)), kid: "g1", alg: "RS256" }] });

const token = (claims: Record<string, unknown>, opts: { key?: CryptoKey; aud?: string; exp?: string } = {}) =>
  new SignJWT({ email_verified: true, name: "Gita Rao", ...claims })
    .setProtectedHeader({ alg: "RS256", kid: "g1" })
    .setIssuer("https://accounts.google.com")
    .setAudience(opts.aud ?? "test-client.apps.googleusercontent.com")
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? "1h")
    .sign(opts.key ?? google.privateKey);
const uniq = () => `${Date.now()}${Math.random().toString(36).slice(2, 7)}`;

test("valid Google token → creates the account once, then signs in the same account", async () => {
  const sub = `g-${uniq()}`;
  const email = `Gita.${uniq()}@Example.com`;
  const first = await loginWithGoogle(await token({ sub, email }), keys);
  const again = await loginWithGoogle(await token({ sub, email }), keys);
  assert.equal(first.id, again.id);
  assert.equal(first.email, email.toLowerCase());
  assert.equal(first.name, "Gita Rao");
  // Google-only account can't use the password form, with a helpful message
  await assert.rejects(login(email.toLowerCase(), "anything-123"), (e: any) => e.code === "USE_GOOGLE");
});

test("links to an existing password account with the same verified email", async () => {
  const email = `link.${uniq()}@example.com`;
  const existing = await prisma.user.create({ data: { name: "Old", email, passwordHash: "scrypt$x$y" } });
  const u = await loginWithGoogle(await token({ sub: `g-${uniq()}`, email }), keys);
  assert.equal(u.id, existing.id);
});

test("rejects: other app's token, expired, forged signature, unverified email", async () => {
  const base = { sub: `g-${uniq()}`, email: `x.${uniq()}@example.com` };
  const code = async (t: string) => loginWithGoogle(t, keys).then(() => "ACCEPTED", (e: any) => e.code);
  assert.equal(await code(await token(base, { aud: "someone-else.apps.googleusercontent.com" })), "GOOGLE_TOKEN_INVALID");
  assert.equal(await code(await token(base, { exp: "-1m" })), "GOOGLE_TOKEN_INVALID");
  assert.equal(await code(await token(base, { key: stranger.privateKey })), "GOOGLE_TOKEN_INVALID");
  assert.equal(await code(await token({ ...base, email_verified: false })), "GOOGLE_EMAIL_UNVERIFIED");
  assert.equal(await code("not-a-jwt-at-all-xxxxxxxxxxxx"), "GOOGLE_TOKEN_INVALID");
});
