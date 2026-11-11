// "Ask AI" about one meeting: answers only from that meeting's transcript, chat and notes.
import { z } from "zod";
import { prisma } from "../config/db.js";
import { AppError } from "../utils/AppError.js";
import { askAI } from "./ai.service.js";
import { authorize } from "./meeting.service.js";
import { assertCanAsk } from "./plan.service.js";

const SYSTEM = `You answer questions about ONE meeting, using only the transcript, chat and notes given.
Rules:
- If the meeting doesn't contain the answer, say so plainly ("This wasn't discussed in the meeting."). Never guess or use outside knowledge.
- Be short: 1-4 sentences, or a few bullet lines starting with "- " for lists.
- Mention who said it and the time like [10:42] when it helps.
- Plain text only: no markdown, no ** or # characters.
- Reply as JSON: {"answer": "..."}`;

const reply = z.object({ answer: z.string().trim().min(1).max(4000) });
// models sometimes add **bold** anyway: keep the plain words
const plain = (s: string) => s.replace(/\*\*(.+?)\*\*/g, "$1").replace(/__(.+?)__/g, "$1").replace(/^#+\s*/gm, "");
const parse = (text: string) => plain(reply.parse(JSON.parse(text)).answer);
/** 10:42 in the asker's time zone (UTC if unknown). */
function clock(timeZone?: string) {
  let f: Intl.DateTimeFormat;
  try {
    f = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: timeZone || "UTC" });
  } catch {
    f = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC" });
  }
  return (d: Date) => f.format(d);
}

export async function askAboutMeeting(roomCode: string, userId: string, question: string, timeZone?: string) {
  const hhmm = clock(timeZone);
  const { meeting } = await authorize(roomCode, { userId }, "member");
  await assertCanAsk(userId);
  const [lines, chat, notes] = await Promise.all([
    prisma.transcript.findMany({ where: { meetingId: meeting.id }, orderBy: { spokenAt: "asc" }, select: { speakerName: true, text: true, spokenAt: true } }),
    prisma.chatMessage.findMany({ where: { meetingId: meeting.id }, orderBy: { sentAt: "asc" }, select: { senderName: true, text: true, sentAt: true } }),
    prisma.notes.findUnique({ where: { meetingId: meeting.id }, select: { status: true, summary: true, decisions: true, actionItems: true } }),
  ]);
  if (!lines.length && !chat.length)
    throw new AppError(409, "NOTHING_TO_ASK", "There's no transcript or chat in this meeting to answer from.");

  const context = [
    `Meeting: ${meeting.title}`,
    notes?.status === "READY" ? `Notes summary: ${notes.summary}\nDecisions: ${JSON.stringify(notes.decisions)}\nAction items: ${JSON.stringify(notes.actionItems)}` : "",
    lines.length ? `Transcript:\n${lines.map((l) => `[${hhmm(l.spokenAt)}] ${l.speakerName}: ${l.text}`).join("\n")}` : "",
    chat.length ? `Chat:\n${chat.map((c) => `[${hhmm(c.sentAt)}] ${c.senderName}: ${c.text}`).join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  let result: { provider: string; result: string };
  try {
    result = await askAI(
      [
        { role: "system", content: SYSTEM },
        { role: "user", content: `${context}\n\nQuestion: ${question}` },
      ],
      parse,
    );
  } catch {
    throw new AppError(503, "AI_UNAVAILABLE", "The AI didn't answer right now. Try again in a minute.");
  }
  return prisma.aiQuestion.create({
    data: { meetingId: meeting.id, userId, question, answer: result.result, provider: result.provider },
    select: { id: true, question: true, answer: true, createdAt: true },
  });
}

/** The asker's earlier questions about this meeting (oldest first). */
export async function myQuestions(roomCode: string, userId: string) {
  const { meeting } = await authorize(roomCode, { userId }, "member");
  return prisma.aiQuestion.findMany({
    where: { meetingId: meeting.id, userId },
    orderBy: { createdAt: "asc" },
    select: { id: true, question: true, answer: true, createdAt: true },
  });
}
