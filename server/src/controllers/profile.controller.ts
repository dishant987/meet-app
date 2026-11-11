import type { Request, Response } from "express";
import * as profile from "../services/profile.service.js";
import * as calendarFeed from "../services/calendarFeed.service.js";
import { AppError } from "../utils/AppError.js";
import { createSessionToken } from "../services/auth.service.js";
import { SESSION_COOKIE, sessionCookie } from "../middlewares/auth.js";

export async function updateName(req: Request, res: Response) {
  res.json({ success: true, data: await profile.updateName(req.user!.id, req.body.name) });
}
export async function uploadAvatar(req: Request, res: Response) {
  res.json({ success: true, data: await profile.setAvatar(req.user!.id, req.body) });
}
export async function removeAvatar(req: Request, res: Response) {
  res.json({ success: true, data: await profile.removeAvatar(req.user!.id) });
}
export async function changePassword(req: Request, res: Response) {
  const user = await profile.changePassword(req.user!.id, req.body.currentPassword, req.body.newPassword);
  // Other devices are now signed out; give THIS device a fresh session so it stays signed in.
  res.cookie(SESSION_COOKIE, await createSessionToken(user.id), sessionCookie);
  res.json({ success: true, data: user });
}

/** Public photo. The URL has ?v=<version>, so it can be cached for a year; a new photo gets a new URL. */
export async function avatar(req: Request<{ id: string }>, res: Response) {
  const { bytes, type } = await profile.getAvatar(req.params.id);
  res.set({
    "content-type": type,
    "cache-control": "public, max-age=31536000, immutable",
    "cross-origin-resource-policy": "cross-origin", // the app runs on another origin (port/site)
  });
  res.send(bytes);
}

export async function calendar(req: Request, res: Response) {
  res.json({ success: true, data: await calendarFeed.myFeed(req.user!.id) });
}

export async function resetCalendar(req: Request, res: Response) {
  res.json({ success: true, data: await calendarFeed.resetFeed(req.user!.id) });
}

/** Public (the token is the secret): calendar apps fetch this every hour or so. */
export async function calendarFeedFile(req: Request<{ file: string }>, res: Response) {
  const token = req.params.file.replace(/\.ics$/, "");
  if (!/^[\w-]{20,60}$/.test(token)) throw new AppError(404, "CALENDAR_NOT_FOUND", "This calendar link doesn't work any more.");
  res.set({ "content-type": "text/calendar; charset=utf-8", "cache-control": "private, max-age=300" });
  res.send(await calendarFeed.feedFor(token));
}
