import { env } from "./config/env.js";
import { prisma } from "./config/db.js";
import { logger } from "./utils/logger.js";
import { app } from "./app.js";
import { sendDueReminders } from "./services/reminder.service.js";

try {
  await prisma.$connect();
  await prisma.$queryRaw`SELECT 1`;
} catch (err) {
  logger.fatal({ err }, "Cannot connect to the database. Is DATABASE_URL correct and the database running?");
  process.exit(1);
}

const server = app.listen(env.PORT, () => logger.info(`API running on http://localhost:${env.PORT}`));

// Local dev: send due meeting reminders every minute (on Vercel an outside scheduler calls /api/cron/reminders).
const reminders = setInterval(() => {
  sendDueReminders().catch((err) => logger.error({ err }, "Reminder run failed"));
}, 60_000);
reminders.unref();

// Graceful shutdown: finish in-flight requests, then close the database.
const shutdown = (signal: string) => {
  logger.info(`${signal} received, shutting down`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// Errors nobody caught: log, then exit so the host restarts a clean process.
process.on("unhandledRejection", (err) => {
  logger.fatal({ err }, "Unhandled promise rejection");
  shutdown("unhandledRejection");
});
process.on("uncaughtException", (err) => {
  logger.fatal({ err }, "Uncaught exception");
  process.exit(1);
});
