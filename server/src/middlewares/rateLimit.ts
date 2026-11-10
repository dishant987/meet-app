import rateLimit from "express-rate-limit";
import { AppError } from "../utils/AppError.js";

export const limit = (perMinute: number) =>
  rateLimit({
    windowMs: 60_000,
    limit: perMinute,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_req, _res, next) => next(new AppError(429, "TOO_MANY_REQUESTS", "Too many requests, wait a minute")),
  });
