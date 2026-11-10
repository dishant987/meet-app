import { z } from "zod";
import { prisma } from "../config/db.js";
import { logger } from "../utils/logger.js";
import { waitUntil } from "@vercel/functions";
import { askAI } from "./ai.service.js";

// What we ask the AI for, and what we store. Lenient: missing lists become [].
const str = z.string().trim();
export const notesContent = z.object({
  title: str.max(200).default(""),
  summary: str.max(5000).default(""),
  keyPoints: z.array(str.max(1000)).max(50).default([]),
  decisions: z.array(str.max(1000)).max(50).default([]),
  actionItems: z
    .array(
      z.object({
        task: str.max(1000),
        owner: str.max(100).nullish().transform((v) => v || null),
        dueDate: str.max(100).nullish().transform((v) => v || null),
      }),
    )
    .max(50)
    .default([]),
  openQuestions: z.array(str.max(1000)).max(50).default([]),
});
export type NotesContent = z.infer<typeof notesContent>;

const SYSTEM_PROMPT = `You are a precise, professional meeting secretary. You turn a raw meeting transcript into clear,
well-organized meeting notes that a busy person can read in one minute.

Rules:
- Use ONLY facts from the transcript. Never invent names, numbers, dates, owners or decisions.
- The transcript comes from automatic captions: fix obvious recognition mistakes and ignore filler words and repetition.
- Write in the language most used in the meeting.
- Be concise: short sentences, no fluff. Professional, neutral tone.
- "owner" is the person who will do the task, only if the transcript makes that clear, else null.
- "dueDate" only if a date or deadline was said, written as said (e.g. "Friday", "15 Nov"), else null.
- If a section has nothing, return an empty array. Don't pad.
- Plain text only: no markdown (no **bold**, no bullets or numbering inside the strings).

Reply with ONLY a JSON object, no markdown, in exactly this shape:
{
  "title": "short descriptive meeting title (max 8 words)",
  "summary": "2-4 sentence overview of what was discussed and the outcome",
  "keyPoints": ["main discussion points"],
  "decisions": ["decisions that were made"],
  "actionItems": [{ "task": "what needs to be done", "owner": "name or null", "dueDate": "when or null" }],
  "openQuestions": ["questions or issues left unresolved"]
}`;

/** Pulls the JSON object out of the AI's answer (some models wrap it in ```json fences) and validates it. */
export function parseNotes(text: string): NotesContent {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("AI answer had no JSON object");
  // Some models still add **bold** / __bold__; strip it so the page doesn't show raw asterisks.
  const plain = (_k: string, v: unknown) => (typeof v === "string" ? v.replace(/\*\*(.+?)\*\*/g, "$1").replace(/__(.+?)__/g, "$1") : v);
  return notesContent.parse(JSON.parse(text.slice(start, end + 1), plain));
}

const hhmm = (d: Date) => d.toISOString().slice(11, 16);

async function generate(meetingId: string) {
  const [meeting, lines] = await Promise.all([
    prisma.meeting.findUniqueOrThrow({ where: { id: meetingId }, select: { title: true, startedAt: true, createdAt: true } }),
    prisma.transcript.findMany({ where: { meetingId }, orderBy: { spokenAt: "asc" }, select: { speakerName: true, text: true, spokenAt: true } }),
  ]);
  if (lines.length === 0) {
    await prisma.notes.update({ where: { meetingId }, data: { status: "EMPTY", error: null } });
    return;
  }

  const speakers = [...new Set(lines.map((l) => l.speakerName))];
  const transcript = lines.map((l) => `[${hhmm(l.spokenAt)}] ${l.speakerName}: ${l.text}`).join("\n");
  const user = `Meeting: ${meeting.title}\nDate: ${(meeting.startedAt ?? meeting.createdAt).toDateString()}\nSpeakers: ${speakers.join(", ")}\n\nTranscript (UTC times):\n${transcript}`;

  const { provider, result } = await askAI(
    [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: user },
    ],
    parseNotes,
  );
  await prisma.notes.update({
    where: { meetingId },
    data: { ...result, status: "READY", provider, error: null, edited: false },
  });
  logger.info({ meetingId, provider, lines: lines.length }, "Meeting notes ready");
}

/**
 * Marks notes as PENDING and writes them in the background. The transcript is never touched, so a failure
 * can always be retried.
 */
export async function startNotes(meetingId: string) {
  await prisma.notes.upsert({
    where: { meetingId },
    create: { meetingId, status: "PENDING" },
    update: { status: "PENDING", error: null },
  });
  const job = generate(meetingId).catch(async (err) => {
    logger.error({ err, meetingId }, "Meeting notes failed");
    await prisma.notes
      .update({ where: { meetingId }, data: { status: "FAILED", error: String((err as Error).message).slice(0, 1000) } })
      .catch(() => {});
  });
  // On Vercel the function would be frozen once the response is sent; waitUntil keeps it alive until the
  // notes are written (up to the 5-minute limit). Elsewhere it's a no-op and the process just keeps running.
  waitUntil(job);
}
