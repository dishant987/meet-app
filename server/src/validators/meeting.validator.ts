import { z } from "zod";

export const roomCodeParams = z.object({
  roomCode: z.string().regex(/^[a-z]{3}-[a-z]{4}-[a-z]{3}$/, "Invalid meeting code"),
});

export const createMeetingBody = z.object({
  title: z.string().trim().max(100).optional(),
});

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
