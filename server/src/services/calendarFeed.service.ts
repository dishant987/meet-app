// Personal calendar link: /api/calendar/<token>.ics lists my scheduled meetings (hosted, invited, team).
import { randomBytes } from "node:crypto";
import { prisma } from "../config/db.js";
import { env, isProd } from "../config/env.js";
import { AppError } from "../utils/AppError.js";
import { feedIcs } from "./calendar.service.js";
import { whereMine } from "./meeting.service.js";

// In production the app and the API share one address; locally the API has its own port.
const feedUrl = (token: string) => `${isProd ? env.CLIENT_URL : `http://localhost:${env.PORT}`}/api/calendar/${token}.ics`;
const newToken = () => randomBytes(24).toString("base64url");

/** My feed link (made the first time it's asked for). */
export async function myFeed(userId: string) {
  const u = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { calendarToken: true } });
  const token = u.calendarToken ?? (await prisma.user.update({ where: { id: userId }, data: { calendarToken: newToken() } })).calendarToken!;
  return { url: feedUrl(token) };
}

/** New link; the old one stops working (if it was shared by mistake). */
export async function resetFeed(userId: string) {
  const { calendarToken } = await prisma.user.update({ where: { id: userId }, data: { calendarToken: newToken() }, select: { calendarToken: true } });
  return { url: feedUrl(calendarToken!) };
}

export async function feedFor(token: string) {
  const user = await prisma.user.findUnique({ where: { calendarToken: token }, select: { id: true, name: true } });
  if (!user) throw new AppError(404, "CALENDAR_NOT_FOUND", "This calendar link doesn't work any more.");
  const mine = await whereMine(user.id);
  // cancelled ones too (shown as cancelled), so calendars remove them instead of keeping a stale copy
  const meetings = await prisma.meeting.findMany({
    where: { AND: [{ OR: [mine, { cancelledAt: { not: null }, hostId: user.id }] }], scheduledFor: { gte: new Date(Date.now() - 60 * 86_400_000) } },
    orderBy: { scheduledFor: "asc" },
    take: 500,
    select: { id: true, title: true, roomCode: true, scheduledFor: true, durationMin: true, cancelledAt: true },
  });
  return feedIcs(
    "MeetApp",
    meetings.map((m) => ({
      id: m.id,
      title: m.title,
      start: m.scheduledFor!,
      minutes: m.durationMin ?? 30,
      url: `${env.CLIENT_URL}/m/${m.roomCode}`,
      cancelled: !!m.cancelledAt,
    })),
  );
}
