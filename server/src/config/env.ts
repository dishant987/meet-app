import "dotenv/config";
import { z } from "zod";

// The server refuses to start if any key is missing or malformed.
const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  CLIENT_URL: z.string().url(),
  DATABASE_URL: z.string().startsWith("postgres"),
  LIVEKIT_URL: z.string().regex(/^wss?:\/\//, "must start with ws:// or wss://"),
  LIVEKIT_API_KEY: z.string().min(1),
  LIVEKIT_API_SECRET: z.string().min(1),
  JWT_SECRET: z.string().min(32, "must be at least 32 characters (see .env.example)"),
  // Google sign-in (optional). OAuth client ID from Google Cloud Console; same value as the client's VITE_GOOGLE_CLIENT_ID.
  GOOGLE_CLIENT_ID: z.string().trim().optional(),
  // Email over SMTP (Nodemailer). Optional locally: without them, emails go to a dev outbox in the server log.
  SMTP_HOST: z.string().trim().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().trim().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().trim().optional(), // e.g. "MeetApp <you@gmail.com>"; defaults to SMTP_USER
  // Shared rate-limit counts (needed on Vercel, where many copies of the server run). Optional locally.
  UPSTASH_REDIS_REST_URL: z.string().trim().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().trim().optional(),
  // Same thing under the names Vercel's Upstash integration creates.
  KV_REST_API_URL: z.string().trim().url().optional(),
  KV_REST_API_TOKEN: z.string().trim().optional(),
  // AI notes: all optional; at least one is needed for notes (checked when notes are made).
  MISTRAL_API_KEY: z.string().trim().optional(),
  GEMINI_API_KEY: z.string().trim().optional(),
  GROQ_API_KEY: z.string().trim().optional(),
  OPENROUTER_API_KEY: z.string().trim().optional(),
  // Recordings (Backblaze B2, S3-compatible). Optional: without them the recording is saved to the host's computer.
  B2_KEY_ID: z.string().trim().optional(),
  B2_APPLICATION_KEY: z.string().trim().optional(),
  B2_BUCKET: z.string().trim().optional(),
  B2_ENDPOINT: z.string().trim().optional(),
  B2_REGION: z.string().trim().optional(),
  // Reminder emails: the scheduler (cron-job.org / Vercel cron) calls /api/cron/reminders with "Authorization: Bearer <this>".
  CRON_SECRET: z.string().trim().min(16).optional(),
  // Payments (Stripe; test keys sk_test_... for now). Prices come from `npm run stripe:setup`.
  STRIPE_SECRET_KEY: z.string().trim().startsWith("sk_", "must be a Stripe secret key (sk_test_...)").optional(),
  STRIPE_WEBHOOK_SECRET: z.string().trim().startsWith("whsec_").optional(),
  STRIPE_PRICE_MONTHLY: z.string().trim().startsWith("price_").optional(),
  STRIPE_PRICE_YEARLY: z.string().trim().startsWith("price_").optional(),
  STRIPE_PRICE_BUSINESS_MONTHLY: z.string().trim().startsWith("price_").optional(),
  STRIPE_PRICE_BUSINESS_YEARLY: z.string().trim().startsWith("price_").optional(),
});

// Trim stray spaces / Windows line endings and surrounding quotes (easy to paste into a hosting dashboard
// by accident, e.g. SMTP_PASS="abcd" copied from .env); an empty value like "UPSTASH_REDIS_REST_URL=" means "not set".
const cleaned = Object.entries(process.env)
  .map(([k, v]) => [k, v?.trim().replace(/^(["'])(.*)\1$/s, "$2").trim()] as const)
  .filter(([, v]) => v !== undefined && v !== "");
const parsed = schema.safeParse(Object.fromEntries(cleaned));
if (!parsed.success) {
  console.error("❌ Invalid environment variables:\n" + z.prettifyError(parsed.error));
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === "production";
