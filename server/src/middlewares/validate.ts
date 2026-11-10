import type { RequestHandler } from "express";
import type { ZodType } from "zod";

// Validates and replaces req.body / req.params; a ZodError goes to errorHandler as a 400.
export const validate =
  (schemas: { body?: ZodType; params?: ZodType }): RequestHandler =>
  (req, _res, next) => {
    if (schemas.body) req.body = schemas.body.parse(req.body ?? {});
    if (schemas.params) Object.assign(req.params, schemas.params.parse(req.params));
    next();
  };
