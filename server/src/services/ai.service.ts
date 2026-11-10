import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

type Message = { role: "system" | "user"; content: string };

// All four speak the OpenAI chat-completions format, so one function talks to any of them.
// maxChars: rough prompt size the free plan accepts (Groq free = 8K tokens/minute).
const PROVIDERS = [
  { name: "mistral", url: "https://api.mistral.ai/v1/chat/completions", model: "ministral-14b-latest" /* this account can't use mistral-small/medium (always rate-limited) */, key: () => env.MISTRAL_API_KEY, maxChars: 300_000 },
  { name: "gemini", url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", model: "gemini-3.5-flash", key: () => env.GEMINI_API_KEY, maxChars: 600_000 },
  { name: "groq", url: "https://api.groq.com/openai/v1/chat/completions", model: "openai/gpt-oss-120b", key: () => env.GROQ_API_KEY, maxChars: 20_000 },
  { name: "openrouter", url: "https://openrouter.ai/api/v1/chat/completions", model: "google/gemma-4-31b-it:free", key: () => env.OPENROUTER_API_KEY, maxChars: 200_000 },
];


class RetryableError extends Error {}

async function callOnce(p: (typeof PROVIDERS)[number], messages: Message[]) {
  const res = await fetch(p.url, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${p.key()}` },
    body: JSON.stringify({ model: p.model, messages, temperature: 0.2, response_format: { type: "json_object" } }),
    signal: AbortSignal.timeout(90_000),
  });
  if (res.status === 429 || res.status >= 500) throw new RetryableError(`${p.name} HTTP ${res.status}`);
  if (!res.ok) throw new Error(`${p.name} HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = body.choices?.[0]?.message?.content;
  if (!text) throw new Error(`${p.name} returned an empty answer`);
  return text;
}

/**
 * Asks the providers in order (Mistral → Gemini → Groq → OpenRouter) until one returns text that `parse`
 * accepts. Each gets up to 3 tries for rate limits / server errors. Throws if all fail.
 */
export async function askAI<T>(messages: Message[], parse: (text: string) => T): Promise<{ provider: string; result: T }> {
  const size = messages.reduce((n, m) => n + m.content.length, 0);
  const errors: string[] = [];
  for (const p of PROVIDERS) {
    if (!p.key()) continue;
    if (size > p.maxChars) {
      errors.push(`${p.name}: transcript too long for its free plan`);
      continue;
    }
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const result = parse(await callOnce(p, messages));
        return { provider: p.name, result };
      } catch (err) {
        const msg = (err as Error).message;
        logger.warn({ provider: p.name, attempt, err: msg }, "AI call failed");
        if (!(err instanceof RetryableError) || attempt === 3) {
          errors.push(`${p.name}: ${msg}`);
          break;
        }
        await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt)); // 2s, 4s
      }
    }
  }
  throw new Error(errors.length ? errors.join(" | ") : "No AI key is set (MISTRAL/GEMINI/GROQ/OPENROUTER_API_KEY)");
}
