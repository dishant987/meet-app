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
  // Shared rate-limit counts (needed on Vercel, where many copies of the server run). Optional locally.
  UPSTASH_REDIS_REST_URL: z.string().trim().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().trim().optional(),
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
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("❌ Invalid environment variables:\n" + z.prettifyError(parsed.error));
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === "production";
