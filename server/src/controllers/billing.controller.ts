import type { Request, Response } from "express";
import * as billing from "../services/billing.service.js";

const ok = (res: Response, data: unknown) => res.json({ success: true, data });

export const overview = async (req: Request, res: Response) => {
  res.set("cache-control", "no-store");
  ok(res, await billing.overview(req.user!.id));
};
export const checkout = async (req: Request, res: Response) => ok(res, await billing.startCheckout(req.user!.id, req.body.plan, req.body.interval));
/** Public: plans, limits and prices for the landing page. */
export const plans = async (_req: Request, res: Response) => {
  res.set("cache-control", "public, max-age=300");
  ok(res, await billing.publicPlans());
};
export const portal = async (req: Request, res: Response) => ok(res, await billing.openPortal(req.user!.id));
/** Raw body (Stripe signs the exact bytes). */
export const webhook = async (req: Request, res: Response) => ok(res, await billing.handleWebhook(req.body as Buffer, req.headers["stripe-signature"] as string | undefined));
