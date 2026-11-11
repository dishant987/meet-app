import type { Request, Response } from "express";
import { waitUntil } from "@vercel/functions";
import * as auth from "../services/auth.service.js";
import { SESSION_COOKIE, sessionCookie } from "../middlewares/auth.js";

async function signIn(res: Response, user: auth.PublicUser, status = 200) {
  res.cookie(SESSION_COOKIE, await auth.createSessionToken(user.id), sessionCookie);
  res.status(status).json({ success: true, data: user });
}

export async function register(req: Request, res: Response) {
  const { name, email, password } = req.body;
  const user = await auth.register(name, email, password);
  await signIn(res, user, 201);
  // the confirmation email goes out after we answer (sign-up stays fast); a failure is logged, the banner can resend
  waitUntil(auth.sendVerificationEmail(user).catch((err) => req.log.error({ err }, "Confirmation email failed")));
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


/** Same answer whether or not the email has an account (no account probing). */
export async function forgotPassword(req: Request, res: Response) {
  await auth.requestPasswordReset(req.body.email).catch((err) => req.log.error({ err }, "Password reset email failed"));
  res.json({ success: true, data: { message: "If an account exists for that email, we've sent a reset link." } });
}

export async function resetPassword(req: Request, res: Response) {
  await signIn(res, await auth.resetPassword(req.body.token, req.body.password));
}

export async function verifyEmail(req: Request, res: Response) {
  res.json({ success: true, data: await auth.verifyEmail(req.body.token) });
}

export async function resendVerification(req: Request, res: Response) {
  res.json({ success: true, data: await auth.resendVerification(req.user!.id) });
}
