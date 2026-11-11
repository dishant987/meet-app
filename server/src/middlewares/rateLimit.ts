import type { Request } from "express";
import rateLimit, { ipKeyGenerator, type Options } from "express-rate-limit";
import { AppError } from "../utils/AppError.js";
import { sharedStore } from "./redisStore.js";

// Counts are kept in Upstash Redis when it's configured (shared by all server copies on Vercel), otherwise
// in this process's memory (fine on one machine). If Redis is unreachable we let requests through
// (passOnStoreError) rather than lock everyone out.

/** Signed-in people are counted per account (so an office sharing one IP isn't blocked together); guests per IP. */
const byUserOrIp = (req: Request) => (req.user ? `user:${req.user.id}` : `ip:${ipKeyGenerator(req.ip ?? "unknown")}`);

function tooMany(req: Request) {
  const reset = (req as Request & { rateLimit?: { resetTime?: Date } }).rateLimit?.resetTime;
  const seconds = reset ? Math.max(1, Math.ceil((reset.getTime() - Date.now()) / 1000)) : 60;
  const wait = seconds >= 120 ? `${Math.ceil(seconds / 60)} minutes` : `${seconds} seconds`;
  return new AppError(429, "TOO_MANY_REQUESTS", `Too many attempts. Please wait ${wait} and try again.`, { retryAfterSeconds: seconds });
}

let limiterCount = 0;
const base = (o: Partial<Options>) =>
  rateLimit({
    store: sharedStore(`l${limiterCount++}`), // each limiter keeps its own counts
    passOnStoreError: true,
    standardHeaders: "draft-8", // RateLimit + Retry-After headers
    legacyHeaders: false,
    keyGenerator: byUserOrIp,
    handler: (req, _res, next) => next(tooMany(req)),
    ...o,
  });

/** Per-route limit: `max` requests per window (default 1 minute). */
export const limit = (max: number, windowMs = 60_000) => base({ limit: max, windowMs });

/** Safety net for the whole API. Health checks are free. */
export const apiLimiter = base({ limit: 300, windowMs: 60_000, skip: (req) => req.path === "/health" });

/** Password guessing: only FAILED logins count, per IP and per email (stops one account being attacked from many IPs). */
export const loginLimiters = [
  base({ limit: 10, windowMs: 15 * 60_000, skipSuccessfulRequests: true, keyGenerator: (req) => `ip:${ipKeyGenerator(req.ip ?? "unknown")}` }),
  base({
    limit: 5,
    windowMs: 15 * 60_000,
    skipSuccessfulRequests: true,
    keyGenerator: (req) => `email:${String(req.body?.email ?? "").trim().toLowerCase()}`,
  }),
];

/** New accounts per IP. */
export const registerLimiter = base({ limit: 5, windowMs: 60 * 60_000, keyGenerator: (req) => `ip:${ipKeyGenerator(req.ip ?? "unknown")}` });

/** "Forgot password" emails: per IP and per email address, so nobody can flood someone's inbox. */
export const forgotLimiters = [
  base({ limit: 5, windowMs: 15 * 60_000, keyGenerator: (req) => `ip:${ipKeyGenerator(req.ip ?? "unknown")}` }),
  base({ limit: 3, windowMs: 15 * 60_000, keyGenerator: (req) => `email:${String(req.body?.email ?? "").trim().toLowerCase()}` }),
];
