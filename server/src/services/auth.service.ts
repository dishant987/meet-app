import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { SignJWT, createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { prisma } from "../config/db.js";
import { env } from "../config/env.js";
import { AppError } from "../utils/AppError.js";
import { resetPasswordEmail, sendEmail } from "./email.service.js";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;
const secret = new TextEncoder().encode(env.JWT_SECRET);
export const SESSION_DAYS = 30;

export type PublicUser = { id: string; name: string; email: string; avatarUrl: string | null; hasPassword: boolean; google: boolean };

// Fields needed to build a PublicUser (never the password hash or the photo bytes).
export const USER_FIELDS = {
  id: true,
  name: true,
  email: true,
  passwordHash: true,
  googleId: true,
  avatarType: true,
  avatarVersion: true,
  pictureUrl: true,
} as const;
type UserRow = {
  id: string;
  name: string;
  email: string;
  passwordHash: string | null;
  googleId: string | null;
  avatarType: string | null;
  avatarVersion: number;
  pictureUrl: string | null;
};
/** Uploaded photo (served by our API, versioned so browsers can cache it forever), else Google's, else none. */
export const avatarUrl = (u: Pick<UserRow, "id" | "avatarType" | "avatarVersion" | "pictureUrl">) =>
  u.avatarType ? `/api/users/${u.id}/avatar?v=${u.avatarVersion}` : u.pictureUrl;
export const publicUser = (u: UserRow): PublicUser => ({
  id: u.id,
  name: u.name,
  email: u.email,
  avatarUrl: avatarUrl(u),
  hasPassword: !!u.passwordHash,
  google: !!u.googleId,
});

// Stored as "scrypt$<salt>$<hash>" (base64url).
export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}
export async function verifyPassword(password: string, stored: string) {
  // (Google-only accounts have no password; login() compares against a dummy hash for them.)
  const [, salt, hash] = stored.split("$");
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const actual = await scrypt(password, Buffer.from(salt, "base64url"), expected.length);
  return timingSafeEqual(actual, expected);
}

export async function register(name: string, email: string, password: string) {
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) throw new AppError(409, "EMAIL_TAKEN", "An account with this email already exists. Sign in instead.");
  const user = await prisma.user.create({ data: { name, email, passwordHash: await hashPassword(password) }, select: USER_FIELDS });
  return publicUser(user);
}

// A dummy hash so a wrong email takes as long as a wrong password (no hint which emails exist).
const DUMMY_HASH = `scrypt$${randomBytes(16).toString("base64url")}$${randomBytes(64).toString("base64url")}`;

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email }, select: USER_FIELDS });
  const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  if (user && !user.passwordHash && user.googleId)
    throw new AppError(401, "USE_GOOGLE", "This account uses Google sign-in. Click \"Continue with Google\".");
  if (!user || !ok) throw new AppError(401, "INVALID_LOGIN", "Wrong email or password");
  return publicUser(user);
}

/** Session token. It carries the account's sessionVersion; bumping that (password change/reset) ends older sessions. */
export async function createSessionToken(userId: string) {
  const { sessionVersion } = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { sessionVersion: true } });
  return new SignJWT({ v: sessionVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secret);
}

/** Returns the user for a valid session token, or null (expired, tampered, deleted user, or ended by a password change). */
export async function userFromToken(token: string): Promise<PublicUser | null> {
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });
    if (!payload.sub) return null;
    const user = await prisma.user.findUnique({ where: { id: payload.sub }, select: { ...USER_FIELDS, sessionVersion: true } });
    if (!user || (payload.v ?? 0) !== user.sessionVersion) return null;
    return publicUser(user);
  } catch {
    return null;
  }
}

// Google's public signing keys (cached and refreshed by jose).
const googleKeys = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

/**
 * "Sign in with Google": the browser sends Google's ID token. We check Google signed it, for OUR client ID,
 * that it isn't expired and the email is verified; then sign in, create, or link the account by email.
 */
export async function loginWithGoogle(credential: string, keys: JWTVerifyGetKey = googleKeys) {
  if (!env.GOOGLE_CLIENT_ID) throw new AppError(503, "GOOGLE_NOT_CONFIGURED", "Google sign-in isn't set up yet");
  let claims: { sub?: string; email?: string; email_verified?: boolean; name?: string; picture?: string };
  try {
    ({ payload: claims } = await jwtVerify(credential, keys, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: env.GOOGLE_CLIENT_ID,
    }));
  } catch {
    throw new AppError(401, "GOOGLE_TOKEN_INVALID", "Google sign-in failed. Please try again.");
  }
  if (!claims.sub || !claims.email || claims.email_verified !== true)
    throw new AppError(401, "GOOGLE_EMAIL_UNVERIFIED", "Your Google email isn't verified");

  const email = claims.email.toLowerCase();
  const name = (claims.name || email.split("@")[0]!).slice(0, 50);
  // Google's photo is kept fresh on every sign-in; only https URLs from Google are trusted.
  const pictureUrl = claims.picture?.startsWith("https://") ? claims.picture.slice(0, 500) : null;
  const byGoogle = await prisma.user.findUnique({ where: { googleId: claims.sub }, select: { id: true } });
  if (byGoogle)
    return publicUser(await prisma.user.update({ where: { id: byGoogle.id }, data: { pictureUrl }, select: USER_FIELDS }));
  // Same verified email as an existing password account → link them (Google proved they own the email).
  const byEmail = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (byEmail)
    return publicUser(
      await prisma.user.update({ where: { id: byEmail.id }, data: { googleId: claims.sub, pictureUrl }, select: USER_FIELDS }),
    );
  return publicUser(await prisma.user.create({ data: { name, email, googleId: claims.sub, pictureUrl }, select: USER_FIELDS }));
}

// ---------- forgot password ----------

const RESET_MINUTES = 30;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/**
 * Emails a one-time reset link if the account exists. Always behaves the same for unknown emails,
 * so nobody can use this to find out which emails have accounts.
 */
export async function requestPasswordReset(email: string) {
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, name: true, email: true } });
  if (!user) return;
  const token = randomBytes(32).toString("base64url");
  await prisma.$transaction([
    // only the newest link works
    prisma.passwordReset.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } }),
    prisma.passwordReset.create({
      data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + RESET_MINUTES * 60_000) },
    }),
  ]);
  const link = `${env.CLIENT_URL}/reset-password?token=${token}`;
  await sendEmail({ to: user.email, ...resetPasswordEmail(user.name, link, RESET_MINUTES) });
}

/** Sets a new password from a reset link; the link is used up and all other sessions end. */
export async function resetPassword(token: string, password: string) {
  const reset = await prisma.passwordReset.findUnique({ where: { tokenHash: sha256(token) } });
  if (!reset || reset.usedAt || reset.expiresAt < new Date())
    throw new AppError(400, "RESET_LINK_INVALID", "This reset link is invalid or has expired. Ask for a new one.");
  const [, user] = await prisma.$transaction([
    prisma.passwordReset.update({ where: { id: reset.id }, data: { usedAt: new Date() } }),
    prisma.user.update({
      where: { id: reset.userId },
      data: { passwordHash: await hashPassword(password), sessionVersion: { increment: 1 } },
      select: USER_FIELDS,
    }),
  ]);
  return publicUser(user);
}
