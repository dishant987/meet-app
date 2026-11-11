import type { RequestHandler } from "express";
import type { ZodType } from "zod";

// Validates and replaces req.body / req.params / req.query; a ZodError goes to errorHandler as a 400.
export const validate =
  (schemas: { body?: ZodType; params?: ZodType; query?: ZodType }): RequestHandler =>
  (req, _res, next) => {
    if (schemas.body) req.body = schemas.body.parse(req.body ?? {});
    if (schemas.params) Object.assign(req.params, schemas.params.parse(req.params));
    // Express 5 makes req.query a getter, so replace the property itself
    if (schemas.query) Object.defineProperty(req, "query", { value: schemas.query.parse(req.query), writable: true, configurable: true });
    next();
  };
