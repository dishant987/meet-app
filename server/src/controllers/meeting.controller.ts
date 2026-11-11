import type { Request, Response } from "express";
import * as meetingService from "../services/meeting.service.js";
import { AppError } from "../utils/AppError.js";
import type { MyMeetingsQuery } from "../validators/meeting.validator.js";

// Express 5 forwards rejected promises to errorHandler, so no try/catch here.
export async function create(req: Request, res: Response) {
  const { title, scheduledFor, durationMin, invitees, timeZone } = req.body;
  // scheduling and invites need an account (so emails can't be sent anonymously)
  if ((scheduledFor || invitees?.length) && !req.user)
    throw new AppError(401, "SIGN_IN_TO_SCHEDULE", "Sign in to schedule meetings and send invites");
  const meeting = await meetingService.createMeeting({ title, scheduledFor, durationMin, invitees, timeZone }, req.user?.id);
  res.status(201).json({ success: true, data: meeting });
}

export async function getByCode(req: Request<{ roomCode: string }>, res: Response) {
  const meeting = await meetingService.getMeeting(req.params.roomCode);
  res.json({ success: true, data: meeting });
}

export async function joinToken(req: Request<{ roomCode: string }>, res: Response) {
  const data = await meetingService.joinMeeting(req.params.roomCode, req.body.name, req.user?.id, req.body.hostKey);
  res.json({ success: true, data });
}

export async function saveTranscript(req: Request<{ roomCode: string }>, res: Response) {
  const data = await meetingService.saveTranscript(req.params.roomCode, req.body.participantId, req.body.lines);
  res.status(201).json({ success: true, data });
}

// Who is asking: the host key (body or header) or a participant id (header) saved by the browser at join time.
const access = (req: Request): meetingService.Access => ({
  hostKey: (req.body?.hostKey as string | undefined) ?? req.get("x-host-key") ?? undefined,
  participantId: req.get("x-participant-id") ?? undefined,
  userId: req.user?.id,
});

export async function end(req: Request<{ roomCode: string }>, res: Response) {
  res.json({ success: true, data: await meetingService.endMeeting(req.params.roomCode, access(req)) });
}

export async function getNotes(req: Request<{ roomCode: string }>, res: Response) {
  res.set("cache-control", "no-store");
  res.json({ success: true, data: await meetingService.getNotes(req.params.roomCode, access(req)) });
}

export async function regenerateNotes(req: Request<{ roomCode: string }>, res: Response) {
  res.status(202).json({ success: true, data: await meetingService.regenerateNotes(req.params.roomCode, access(req)) });
}

export async function updateNotes(req: Request<{ roomCode: string }>, res: Response) {
  res.json({ success: true, data: await meetingService.updateNotes(req.params.roomCode, access(req), req.body.notes) });
}

export async function getTranscript(req: Request<{ roomCode: string }>, res: Response) {
  res.set("cache-control", "no-store");
  res.json({ success: true, data: await meetingService.getTranscript(req.params.roomCode, access(req)) });
}

export async function mine(req: Request, res: Response) {
  res.set("cache-control", "no-store");
  res.json({ success: true, data: await meetingService.listMyMeetings(req.user!.id, req.query as unknown as MyMeetingsQuery) });
}

export async function stats(req: Request, res: Response) {
  res.set("cache-control", "no-store");
  res.json({ success: true, data: await meetingService.myStats(req.user!.id) });
}

export async function startRecording(req: Request<{ roomCode: string }>, res: Response) {
  const { mimeType, durationSec } = req.body;
  res.status(201).json({ success: true, data: await meetingService.startRecordingUpload(req.params.roomCode, access(req), { mimeType, durationSec }) });
}

export async function completeRecording(req: Request<{ roomCode: string; id: string }>, res: Response) {
  res.json({ success: true, data: await meetingService.completeRecordingUpload(req.params.roomCode, access(req), req.params.id) });
}

export async function listRecordings(req: Request<{ roomCode: string }>, res: Response) {
  res.set("cache-control", "no-store");
  res.json({ success: true, data: await meetingService.listRecordings(req.params.roomCode, access(req)) });
}

export async function emailNotes(req: Request<{ roomCode: string }>, res: Response) {
  res.json({ success: true, data: await meetingService.emailNotesAgain(req.params.roomCode, access(req)) });
}

export async function checkJoinRequest(req: Request<{ roomCode: string; id: string }>, res: Response) {
  res.set("cache-control", "no-store");
  res.json({ success: true, data: await meetingService.checkJoinRequest(req.params.roomCode, req.params.id, req.body.ticket) });
}

export async function listWaiting(req: Request<{ roomCode: string }>, res: Response) {
  res.set("cache-control", "no-store");
  res.json({ success: true, data: await meetingService.listWaiting(req.params.roomCode, access(req)) });
}

export async function answerJoinRequest(req: Request<{ roomCode: string; id: string }>, res: Response) {
  res.json({ success: true, data: await meetingService.answerJoinRequest(req.params.roomCode, access(req), req.params.id, req.body.admit) });
}

export async function updateSettings(req: Request<{ roomCode: string }>, res: Response) {
  const { waitingRoom, locked } = req.body;
  res.json({ success: true, data: await meetingService.updateSettings(req.params.roomCode, access(req), { waitingRoom, locked }) });
}

export async function muteParticipant(req: Request<{ roomCode: string; id: string }>, res: Response) {
  res.json({ success: true, data: await meetingService.muteParticipant(req.params.roomCode, access(req), req.params.id) });
}

export async function removeParticipant(req: Request<{ roomCode: string; id: string }>, res: Response) {
  res.json({ success: true, data: await meetingService.removeParticipant(req.params.roomCode, access(req), req.params.id) });
}
