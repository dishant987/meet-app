import { timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import { env } from "../config/env.js";
import { AppError } from "../utils/AppError.js";
import { sendDueReminders } from "../services/reminder.service.js";

/** Only the scheduler may call this: "Authorization: Bearer <CRON_SECRET>". */
export async function reminders(req: Request, res: Response) {
  if (!env.CRON_SECRET) throw new AppError(503, "CRON_NOT_CONFIGURED", "CRON_SECRET isn't set");
  const given = Buffer.from(req.headers.authorization ?? "");
  const wanted = Buffer.from(`Bearer ${env.CRON_SECRET}`);
  if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) throw new AppError(401, "UNAUTHORIZED", "Wrong cron secret");
  res.json({ success: true, data: await sendDueReminders() });
}
