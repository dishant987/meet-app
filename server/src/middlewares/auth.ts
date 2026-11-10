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

// httpOnly: page scripts can't read it. In production the app and API are on different sites, so the cookie
// must be SameSite=None + Secure to be sent at all.
export const sessionCookie: CookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? "none" : "lax",
  path: "/",
  maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
};

/** Adds req.user when a valid session cookie is present. Never blocks: guests can still use meetings. */
export const loadUser: RequestHandler = async (req, _res, next) => {
  const token = req.cookies?.[SESSION_COOKIE];
  if (typeof token === "string" && token) req.user = (await userFromToken(token)) ?? undefined;
  next();
};

export const requireUser: RequestHandler = (req, _res, next) =>
  next(req.user ? undefined : new AppError(401, "UNAUTHORIZED", "Please sign in"));
