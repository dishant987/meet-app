import { Router } from "express";
import * as meeting from "../controllers/meeting.controller.js";
import { validate } from "../middlewares/validate.js";
import { limit } from "../middlewares/rateLimit.js";
import { requireUser } from "../middlewares/auth.js";
import {
  createMeetingBody,
  hostBody,
  joinTokenBody,
  recordingParams,
  roomCodeParams,
  startRecordingBody,
  transcriptBody,
} from "../validators/meeting.validator.js";
import { notesContent } from "../services/notes.service.js";

export const meetingRoutes = Router();

meetingRoutes.post("/", limit(20), validate({ body: createMeetingBody }), meeting.create);
meetingRoutes.get("/mine", requireUser, meeting.mine); // before "/:roomCode" so "mine" isn't read as a code
meetingRoutes.get("/:roomCode", validate({ params: roomCodeParams }), meeting.getByCode);
meetingRoutes.post(
  "/:roomCode/token",
  limit(30),
  validate({ params: roomCodeParams, body: joinTokenBody }),
  meeting.joinToken,
);
meetingRoutes.post(
  "/:roomCode/transcript",
  limit(120),
  validate({ params: roomCodeParams, body: transcriptBody }),
  meeting.saveTranscript,
);
meetingRoutes.post("/:roomCode/end", limit(20), validate({ params: roomCodeParams, body: hostBody }), meeting.end);
meetingRoutes.get("/:roomCode/notes", limit(60), validate({ params: roomCodeParams }), meeting.getNotes);
meetingRoutes.post(
  "/:roomCode/notes/regenerate",
  limit(5),
  validate({ params: roomCodeParams, body: hostBody }),
  meeting.regenerateNotes,
);
meetingRoutes.patch(
  "/:roomCode/notes",
  limit(30),
  validate({ params: roomCodeParams, body: hostBody.extend({ notes: notesContent }) }),
  meeting.updateNotes,
);
meetingRoutes.get("/:roomCode/transcript", limit(30), validate({ params: roomCodeParams }), meeting.getTranscript);
meetingRoutes.post("/:roomCode/recordings", limit(10), validate({ params: roomCodeParams, body: startRecordingBody }), meeting.startRecording);
meetingRoutes.post(
  "/:roomCode/recordings/:id/complete",
  limit(10),
  validate({ params: recordingParams, body: hostBody }),
  meeting.completeRecording,
);
meetingRoutes.get("/:roomCode/recordings", limit(30), validate({ params: roomCodeParams }), meeting.listRecordings);
meetingRoutes.post("/:roomCode/notes/email", limit(3, 15 * 60_000), validate({ params: roomCodeParams, body: hostBody }), meeting.emailNotes);
