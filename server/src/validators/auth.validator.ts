import { z } from "zod";

const email = z.string().trim().toLowerCase().pipe(z.email("Enter a valid email")).pipe(z.string().max(200));

export const registerBody = z.object({
  name: z.string().trim().min(1, "Name is required").max(50),
  email,
  password: z.string().min(8, "Use at least 8 characters").max(128),
});

export const loginBody = z.object({
  email,
  password: z.string().min(1, "Password is required").max(128),
});

export const googleBody = z.object({ credential: z.string().min(20).max(5000) });

export const forgotBody = z.object({ email });
export const resetBody = z.object({
  token: z.string().min(20).max(200),
  password: z.string().min(8, "Use at least 8 characters").max(128),
});
