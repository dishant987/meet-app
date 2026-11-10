import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { SignJWT, createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { prisma } from "../config/db.js";
import { env } from "../config/env.js";
import { AppError } from "../utils/AppError.js";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;
const secret = new TextEncoder().encode(env.JWT_SECRET);
export const SESSION_DAYS = 30;

export type PublicUser = { id: string; name: string; email: string };
const publicUser = (u: PublicUser): PublicUser => ({ id: u.id, name: u.name, email: u.email });

// Stored as "scrypt$<salt>$<hash>" (base64url).
async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}
async function verifyPassword(password: string, stored: string) {
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
  const user = await prisma.user.create({ data: { name, email, passwordHash: await hashPassword(password) } });
  return publicUser(user);
}

// A dummy hash so a wrong email takes as long as a wrong password (no hint which emails exist).
const DUMMY_HASH = `scrypt$${randomBytes(16).toString("base64url")}$${randomBytes(64).toString("base64url")}`;

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  if (user && !user.passwordHash && user.googleId)
    throw new AppError(401, "USE_GOOGLE", "This account uses Google sign-in. Click \"Continue with Google\".");
  if (!user || !ok) throw new AppError(401, "INVALID_LOGIN", "Wrong email or password");
  return publicUser(user);
}

export async function createSessionToken(userId: string) {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secret);
}

/** Returns the user for a valid session token, or null (expired, tampered, deleted user). */
export async function userFromToken(token: string): Promise<PublicUser | null> {
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });
    if (!payload.sub) return null;
    const user = await prisma.user.findUnique({ where: { id: payload.sub }, select: { id: true, name: true, email: true } });
    return user;
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
  let claims: { sub?: string; email?: string; email_verified?: boolean; name?: string };
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
  const byGoogle = await prisma.user.findUnique({ where: { googleId: claims.sub } });
  if (byGoogle) return publicUser(byGoogle);
  // Same verified email as an existing password account → link them (Google proved they own the email).
  const byEmail = await prisma.user.findUnique({ where: { email } });
  if (byEmail) return publicUser(await prisma.user.update({ where: { id: byEmail.id }, data: { googleId: claims.sub } }));
  return publicUser(await prisma.user.create({ data: { name, email, googleId: claims.sub } }));
}
