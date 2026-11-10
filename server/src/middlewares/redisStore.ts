import { Redis } from "@upstash/redis";
import type { IncrementResponse, Options, Store } from "express-rate-limit";
import { env } from "../config/env.js";

// One client for all limiters; null when Upstash isn't configured (local development → memory store).
const redis =
  env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({ url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN })
    : null;

// Atomic: add 1, start the window's timer on the first hit, return [hits, ms left].
const INCREMENT = `
local hits = redis.call('INCR', KEYS[1])
if hits == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
return { hits, redis.call('PTTL', KEYS[1]) }`;
const DECREMENT = `if redis.call('EXISTS', KEYS[1]) == 1 then return redis.call('DECR', KEYS[1]) end return 0`;

/** express-rate-limit store backed by Upstash Redis, so counts are shared by every server instance (Vercel). */
class UpstashStore implements Store {
  windowMs = 60_000;
  constructor(
    private client: Redis,
    public prefix: string,
  ) {}
  init(options: Options) {
    this.windowMs = options.windowMs;
  }
  async increment(key: string): Promise<IncrementResponse> {
    const [hits, ttl] = await this.client.eval<[string], [number, number]>(INCREMENT, [this.prefix + key], [String(this.windowMs)]);
    return { totalHits: hits, resetTime: new Date(Date.now() + (ttl > 0 ? ttl : this.windowMs)) };
  }
  async decrement(key: string) {
    await this.client.eval(DECREMENT, [this.prefix + key], []);
  }
  async resetKey(key: string) {
    await this.client.del(this.prefix + key);
  }
}

/** A Redis store for one limiter (its own key prefix), or undefined to use the default in-memory store. */
export const sharedStore = (name: string) => (redis ? new UpstashStore(redis, `rl:${name}:`) : undefined);
