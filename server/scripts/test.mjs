// Runs the API tests against a separate local test database (TEST_DATABASE_URL in server/.env).
// Never the live (Neon) database, never the database you develop with.
import { spawnSync } from "node:child_process";

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  console.error("Set TEST_DATABASE_URL in server/.env, e.g. postgresql://postgres:PASSWORD@localhost:5432/meetapp_test?schema=public");
  process.exit(1);
}
if (/neon\.tech/.test(url) || url === process.env.DATABASE_URL || url === process.env.PROD_DATABASE_URL) {
  console.error("TEST_DATABASE_URL must be a separate local test database (not Neon, not your dev database). Tests create and change data.");
  process.exit(1);
}

// Test-only settings: the test database, no shared Redis, no live-database settings.
const env = { ...process.env, DATABASE_URL: url, DIRECT_DATABASE_URL: "" };
for (const k of ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_URL", "KV_REST_API_TOKEN", "PROD_DATABASE_URL", "PROD_DIRECT_DATABASE_URL"])
  delete env[k];

const run = (cmd, args) => spawnSync(cmd, args, { stdio: "inherit", env, shell: process.platform === "win32" }).status ?? 1;

if (run("npx", ["prisma", "migrate", "deploy"]) !== 0) process.exit(1); // keep the test database's tables up to date
process.exit(run("node", ["--import", "tsx", "--test", "src/**/*.test.ts"]));
