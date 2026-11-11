import express, { Router } from "express";
import { z } from "zod";
import * as billing from "../controllers/billing.controller.js";
import { requireConfirmed } from "../middlewares/auth.js";
import { validate } from "../middlewares/validate.js";
import { limit } from "../middlewares/rateLimit.js";

// Stripe calls this; mounted before express.json() so the signature can be checked against the raw bytes
export const billingWebhook = Router();
billingWebhook.post("/", express.raw({ type: "application/json", limit: "1mb" }), billing.webhook);

// /api/billing — the plans list is public (landing page); everything else needs a confirmed account
export const billingRoutes = Router();
billingRoutes.get("/plans", limit(60), billing.plans);
billingRoutes.use(requireConfirmed);
billingRoutes.get("/", limit(30), billing.overview);
billingRoutes.post("/checkout", limit(10), validate({ body: z.object({ plan: z.enum(["PRO", "BUSINESS"]).default("PRO"), interval: z.enum(["month", "year"]) }) }), billing.checkout);
billingRoutes.post("/portal", limit(10), billing.portal);
