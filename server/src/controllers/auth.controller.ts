import type { Request, Response } from "express";
import * as auth from "../services/auth.service.js";
import { SESSION_COOKIE, sessionCookie } from "../middlewares/auth.js";

async function signIn(res: Response, user: auth.PublicUser, status = 200) {
  res.cookie(SESSION_COOKIE, await auth.createSessionToken(user.id), sessionCookie);
  res.status(status).json({ success: true, data: user });
}

export async function register(req: Request, res: Response) {
  const { name, email, password } = req.body;
  await signIn(res, await auth.register(name, email, password), 201);
}

export async function login(req: Request, res: Response) {
  await signIn(res, await auth.login(req.body.email, req.body.password));
}

export function logout(_req: Request, res: Response) {
  const { maxAge: _ignore, ...opts } = sessionCookie;
  res.clearCookie(SESSION_COOKIE, opts);
  res.json({ success: true, data: null });
}

/** The signed-in user, or null for guests (not an error: guests can use meetings). */
export function me(req: Request, res: Response) {
  res.json({ success: true, data: req.user ?? null });
}

export async function google(req: Request, res: Response) {
  await signIn(res, await auth.loginWithGoogle(req.body.credential));
}

