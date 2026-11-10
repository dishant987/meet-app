// Updates the LIVE (Neon) database tables to match prisma/migrations.
// Usage: npm run db:deploy:prod   (reads PROD_DIRECT_DATABASE_URL from server/.env)
import { spawnSync } from "node:child_process";

const url = process.env.PROD_DIRECT_DATABASE_URL;
if (!url) {
  console.error("PROD_DIRECT_DATABASE_URL is not set in server/.env (Neon's direct, non-pooled connection string).");
  process.exit(1);
}
const host = url.replace(/^[a-z]+:\/\/[^@]*@/, "").split("/")[0];
console.log(`Updating the LIVE database at ${host} …`);
const r = spawnSync("npx", ["prisma", "migrate", "deploy"], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: { ...process.env, DIRECT_DATABASE_URL: url, DATABASE_URL: url },
});
process.exit(r.status ?? 1);
