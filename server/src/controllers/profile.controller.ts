import type { Request, Response } from "express";
import * as profile from "../services/profile.service.js";
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
