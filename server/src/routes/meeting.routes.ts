import { Router } from "express";
import * as meeting from "../controllers/meeting.controller.js";
import { validate } from "../middlewares/validate.js";
import { limit } from "../middlewares/rateLimit.js";
import { requireUser } from "../middlewares/auth.js";
import {
  createMeetingBody,
  answerBody,
  hostBody,
  idParams,
  joinRequestBody,
  joinTokenBody,
  settingsBody,
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

// Host controls. The waiting person's browser polls /requests/:id every ~2 s; the host's polls /waiting every ~3 s.
meetingRoutes.post("/:roomCode/requests/:id", limit(90), validate({ params: idParams, body: joinRequestBody }), meeting.checkJoinRequest);
meetingRoutes.get("/:roomCode/waiting", limit(90), validate({ params: roomCodeParams }), meeting.listWaiting);
meetingRoutes.post("/:roomCode/waiting/:id", limit(60), validate({ params: idParams, body: answerBody }), meeting.answerJoinRequest);
meetingRoutes.patch("/:roomCode/settings", limit(30), validate({ params: roomCodeParams, body: settingsBody }), meeting.updateSettings);
meetingRoutes.post("/:roomCode/participants/:id/mute", limit(60), validate({ params: idParams, body: hostBody }), meeting.muteParticipant);
meetingRoutes.post("/:roomCode/participants/:id/remove", limit(30), validate({ params: idParams, body: hostBody }), meeting.removeParticipant);
