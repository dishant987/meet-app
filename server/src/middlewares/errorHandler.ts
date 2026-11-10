import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError, z } from "zod";
import { Prisma } from "../generated/prisma/client.js";
import { AppError } from "../utils/AppError.js";
import { isProd } from "../config/env.js";

export const notFound: RequestHandler = (req, _res, next) =>
  next(new AppError(404, "ROUTE_NOT_FOUND", `Route ${req.method} ${req.path} not found`));

// Turns any error into one response shape: { success:false, error:{code,message,details?}, requestId }
function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (err instanceof ZodError) {
    return new AppError(400, "VALIDATION_ERROR", "Some fields are invalid", z.flattenError(err).fieldErrors);
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") return new AppError(409, "ALREADY_EXISTS", "This already exists");
    if (err.code === "P2025") return new AppError(404, "NOT_FOUND", "Not found");
    if (err.code === "P2003") return new AppError(400, "INVALID_REFERENCE", "A linked record does not exist");
  }
  if (err instanceof Prisma.PrismaClientInitializationError) {
    return new AppError(503, "DATABASE_UNAVAILABLE", "Database is not reachable, try again shortly");
  }
  // body-parser: malformed JSON or too large body
  const e = err as { type?: string; status?: number };
  if (e?.type === "entity.parse.failed") return new AppError(400, "INVALID_JSON", "Request body is not valid JSON");
  if (e?.type === "entity.too.large") return new AppError(413, "BODY_TOO_LARGE", "Request body is too large");
  return new AppError(500, "INTERNAL_ERROR", "Something went wrong on our side");
}

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const appErr = toAppError(err);
  if (appErr.status >= 500) req.log.error({ err }, "Unhandled error");
  else req.log.warn({ code: appErr.code }, appErr.message);

  res.status(appErr.status).json({
    success: false,
    error: {
      code: appErr.code,
      message: appErr.message,
      ...(appErr.details ? { details: appErr.details } : {}),
      ...(!isProd && appErr.status >= 500 ? { stack: (err as Error)?.stack } : {}),
    },
    requestId: req.id,
  });
};
