// "Starts in 10 minutes" emails. A scheduler calls sendDueReminders every few minutes (cron-job.org or Vercel cron
// in production, a timer in local dev); each meeting is reminded once.
import { prisma } from "../config/db.js";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";
import { reminderEmail, sendEmails } from "./email.service.js";

const AHEAD_MIN = 15; // remind when the start is at most this far away (the scheduler runs every ~5 min)
const LATE_MIN = 5; // still worth it shortly after the planned start

export async function sendDueReminders(now = new Date()) {
  const due = await prisma.meeting.findMany({
    where: {
      status: "SCHEDULED",
      cancelledAt: null,
      reminderSentAt: null,
      scheduledFor: { gte: new Date(now.getTime() - LATE_MIN * 60_000), lte: new Date(now.getTime() + AHEAD_MIN * 60_000) },
    },
    select: {
      id: true,
      title: true,
      roomCode: true,
      scheduledFor: true,
      host: { select: { email: true, emailVerifiedAt: true } },
      invites: { select: { email: true, response: true } },
    },
    take: 50,
  });

  let sent = 0;
  for (const m of due) {
    // claim it first, so two scheduler runs at once can't both send
    const { count } = await prisma.meeting.updateMany({ where: { id: m.id, reminderSentAt: null }, data: { reminderSentAt: now } });
    if (!count) continue;
    const to = [
      ...(m.host?.emailVerifiedAt ? [m.host.email] : []),
      ...m.invites.filter((i) => i.response !== "NO").map((i) => i.email), // not to people who said they won't come
    ];
    const unique = [...new Set(to)];
    if (!unique.length) continue;
    const minutes = Math.max(0, Math.round((m.scheduledFor!.getTime() - now.getTime()) / 60_000));
    const email = reminderEmail(m.title, minutes, `${env.CLIENT_URL}/m/${m.roomCode}`);
    try {
      await sendEmails(unique.map((address) => ({ to: address, ...email })));
      sent += unique.length;
    } catch (err) {
      logger.error({ err, meetingId: m.id }, "Reminder emails failed");
    }
  }
  return { meetings: due.length, emails: sent };
}
