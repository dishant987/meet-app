import type { CookieOptions, RequestHandler } from "express";
import { isProd } from "../config/env.js";
import { AppError } from "../utils/AppError.js";
import { SESSION_DAYS, userFromToken, type PublicUser } from "../services/auth.service.js";

declare module "express-serve-static-core" {
  interface Request {
    user?: PublicUser;
  }
}

export const SESSION_COOKIE = "session";

// httpOnly: page scripts can't read it. The app and API share one address (Vercel), so SameSite=Lax works and
// also stops other sites from sending it with their forms (CSRF). Secure (HTTPS only) in production.
export const sessionCookie: CookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: "lax",
  path: "/",
  maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
};

/** Adds req.user when a valid session cookie is present (and renews it while in use). Never blocks: guests can still use meetings. */
export const loadUser: RequestHandler = async (req, res, next) => {
  const token = req.cookies?.[SESSION_COOKIE];
  if (typeof token === "string" && token) {
    const session = await userFromToken(token);
    req.user = session?.user;
    if (session?.renewed) res.cookie(SESSION_COOKIE, session.renewed, sessionCookie);
  }
  next();
};

export const requireUser: RequestHandler = (req, _res, next) =>
  next(req.user ? undefined : new AppError(401, "UNAUTHORIZED", "Please sign in"));

/** Signed in AND email confirmed: the dashboard, meeting lists and profile. */
export const requireConfirmed: RequestHandler = (req, _res, next) =>
  next(
    !req.user
      ? new AppError(401, "UNAUTHORIZED", "Please sign in")
      : !req.user.emailVerified
        ? new AppError(403, "EMAIL_NOT_VERIFIED", "Confirm your email first. Check your inbox for our link.")
        : undefined,
  );
