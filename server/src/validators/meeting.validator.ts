import { z } from "zod";

export const roomCodeParams = z.object({
  roomCode: z.string().regex(/^[a-z]{3}-[a-z]{4}-[a-z]{3}$/, "Invalid meeting code"),
});

export const createMeetingBody = z
  .object({
    title: z.string().trim().max(100).optional(),
    // scheduling (optional): start time with its UTC offset, e.g. 2026-11-12T10:00:00.000Z
    scheduledFor: z.iso.datetime({ offset: true }).optional(),
    durationMin: z.number().int().min(5).max(480).optional(),
    invitees: z.array(z.string().trim().toLowerCase().pipe(z.email("Enter valid email addresses"))).max(20, "Invite up to 20 people").optional(),
    timeZone: z.string().max(60).optional(), // host's zone, only for writing the time in the email
  })
  .refine((b) => !b.invitees?.length || b.scheduledFor, { path: ["invitees"], message: "Pick a date and time to send invites" })
  .refine((b) => !b.scheduledFor || b.title, { path: ["title"], message: "Give the meeting a title" })
  .refine((b) => !b.scheduledFor || new Date(b.scheduledFor).getTime() > Date.now() - 5 * 60_000, {
    path: ["scheduledFor"],
    message: "Pick a time in the future",
  })
  .refine((b) => !b.scheduledFor || new Date(b.scheduledFor).getTime() < Date.now() + 366 * 86_400_000, {
    path: ["scheduledFor"],
    message: "Pick a date within the next year",
  });

/** My meetings list: search, filters, sort and page (all done in the database). */
export const myMeetingsQuery = z.object({
  q: z.string().trim().max(100).default(""),
  status: z.enum(["all", "live", "upcoming", "ended"]).default("all"),
  role: z.enum(["all", "hosted", "joined", "invited"]).default("all"),
  sort: z.enum(["newest", "oldest", "soonest"]).default("newest"),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});
export type MyMeetingsQuery = z.infer<typeof myMeetingsQuery>;

export const joinTokenBody = z.object({
  name: z.string().trim().min(1, "Name is required").max(50),
  hostKey: z.string().max(100).optional(), // the creator's browser: skips the waiting room
});
export const idParams = roomCodeParams.extend({ id: z.string().min(1).max(40) });
export const joinRequestBody = z.object({ ticket: z.string().min(1).max(100) });

export const transcriptBody = z.object({
  participantId: z.string().min(1).max(40),
  lines: z
    .array(
      z.object({
        text: z.string().trim().min(1).max(1000),
        spokenAt: z.iso.datetime(),
      }),
    )
    .min(1)
    .max(50),
});

// Optional: a signed-in host is recognised by their session instead.
export const hostBody = z.object({ hostKey: z.string().max(100).optional() });

export const startRecordingBody = hostBody.extend({
  mimeType: z.string().regex(/^video\/(webm|mp4)(;.*)?$/, "Only WebM or MP4 video"),
  durationSec: z.number().int().min(0).max(24 * 3600),
});
export const recordingParams = roomCodeParams.extend({ id: z.string().min(1).max(40) });

export const answerBody = hostBody.extend({ admit: z.boolean() });
export const settingsBody = hostBody
  .extend({ waitingRoom: z.boolean().optional(), locked: z.boolean().optional() })
  .refine((b) => b.waitingRoom !== undefined || b.locked !== undefined, "Nothing to change");

const futureTime = z.iso.datetime({ offset: true }).refine((t) => new Date(t).getTime() > Date.now() - 5 * 60_000, "Pick a time in the future");

/** Host changes a meeting that hasn't started. `invitees` is the whole new guest list. */
export const updateScheduleBody = hostBody
  .extend({
    title: z.string().trim().min(1, "Give the meeting a title").max(100).optional(),
    scheduledFor: futureTime.optional(),
    durationMin: z.number().int().min(5).max(480).optional(),
    invitees: z.array(z.string().trim().toLowerCase().pipe(z.email("Enter valid email addresses"))).max(20, "Invite up to 20 people").optional(),
    timeZone: z.string().max(60).optional(),
  })
  .refine((b) => b.title !== undefined || b.scheduledFor !== undefined || b.durationMin !== undefined || b.invitees !== undefined, "Nothing to change");

export const cancelBody = hostBody.extend({ timeZone: z.string().max(60).optional() });
