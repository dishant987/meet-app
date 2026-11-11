import { randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { prisma } from "../config/db.js";
import { Prisma } from "../generated/prisma/client.js";
import { AppError } from "../utils/AppError.js";
import { env } from "../config/env.js";
import { closeRoom, createJoinToken, isRoomEmpty, muteMicrophone, removeFromRoom } from "./livekit.service.js";
import { emailNotes, startNotes, type NotesContent } from "./notes.service.js";
import { downloadUrl, storedSize, uploadUrl } from "./storage.service.js";
import { inviteEmail, sendEmails } from "./email.service.js";
import { formatWhen, inviteIcs } from "./calendar.service.js";
import { logger } from "../utils/logger.js";
import { waitUntil } from "@vercel/functions";
import type { MyMeetingsQuery } from "../validators/meeting.validator.js";
import { avatarUrl } from "./auth.service.js";

const letters = (n: number) => Array.from({ length: n }, () => String.fromCharCode(97 + randomInt(26))).join("");
const newRoomCode = () => `${letters(3)}-${letters(4)}-${letters(3)}`; // e.g. abc-defg-hij

export type NewMeeting = { title?: string; scheduledFor?: string; durationMin?: number; invitees?: string[]; timeZone?: string };

export async function createMeeting(input: NewMeeting, hostId?: string) {
  const invitees = [...new Set(input.invitees ?? [])];
  const scheduledFor = input.scheduledFor ? new Date(input.scheduledFor) : null;
  // 26^10 codes, so a clash is near impossible; retry a few times just in case.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      // hostKey goes back only in this response; the creator's browser keeps it to end the meeting later.
      const meeting = await prisma.meeting.create({
        data: {
          title: input.title || (scheduledFor ? "Scheduled meeting" : "Quick meeting"),
          roomCode: newRoomCode(),
          hostKey: randomBytes(24).toString("base64url"),
          hostId,
          scheduledFor,
          durationMin: scheduledFor ? (input.durationMin ?? 30) : null,
          invites: invitees.length ? { create: invitees.map((email) => ({ email })) } : undefined,
        },
        select: { id: true, title: true, roomCode: true, status: true, createdAt: true, hostKey: true, scheduledFor: true, durationMin: true },
      });
      // emails go out after we answer (Vercel keeps the function alive for waitUntil)
      if (invitees.length) waitUntil(sendInvites(meeting.id, input.timeZone).catch((err) => logger.error({ err }, "Invites failed")));
      return { ...meeting, invited: invitees.length };
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
    }
  }
  throw new AppError(500, "ROOM_CODE_FAILED", "Could not create a meeting code, try again");
}

/** One email with a calendar invite per guest (nobody sees the other guests' addresses). */
export async function sendInvites(meetingId: string, timeZone?: string) {
  const m = await prisma.meeting.findUniqueOrThrow({
    where: { id: meetingId },
    select: { id: true, title: true, roomCode: true, scheduledFor: true, durationMin: true, host: { select: { name: true, email: true } }, invites: { select: { email: true } } },
  });
  if (!m.scheduledFor || !m.invites.length) return { sent: 0 };
  const link = `${env.CLIENT_URL}/m/${m.roomCode}`;
  const hostName = m.host?.name ?? "Someone";
  const minutes = m.durationMin ?? 30;
  const when = formatWhen(m.scheduledFor, timeZone);
  const base = inviteEmail(hostName, m.title, when, minutes, link);
  await sendEmails(
    m.invites.map(({ email }) => ({
      ...base,
      to: email,
      replyTo: m.host?.email,
      icalEvent: {
        method: "REQUEST" as const,
        content: inviteIcs({
          uid: `${m.id}@meetapp`,
          start: m.scheduledFor!,
          minutes,
          title: m.title,
          description: `Join: ${link}`,
          url: link,
          organizer: { name: `${hostName} (MeetApp)`, email: env.SMTP_USER || "noreply@meetapp.invalid" },
          attendee: email,
        }),
      },
    })),
  );
  return { sent: m.invites.length };
}

export async function getMeeting(roomCode: string) {
  const meeting = await prisma.meeting.findUnique({
    where: { roomCode },
    select: { id: true, title: true, roomCode: true, status: true, createdAt: true },
  });
  if (!meeting) throw new AppError(404, "MEETING_NOT_FOUND", "This meeting does not exist. Check the link.");
  return meeting;
}

/** Join a meeting. With "Ask to join" on, non-hosts get a waiting ticket instead of a token. */
export async function joinMeeting(roomCode: string, name: string, userId?: string, hostKey?: string) {
  const m = await prisma.meeting.findUnique({ where: { roomCode } });
  if (!m) throw new AppError(404, "MEETING_NOT_FOUND", "This meeting does not exist. Check the link.");
  if (m.status === "ENDED") throw new AppError(410, "MEETING_ENDED", "This meeting has ended.");
  const isHost = (!!hostKey && sameSecret(hostKey, m.hostKey)) || (!!userId && userId === m.hostId);

  if (!isHost) {
    if (m.locked) throw new AppError(423, "MEETING_LOCKED", "The host has locked this meeting. Ask them to unlock it.");
    // shortcut: only stops signed-in people; a removed guest can come back from a new browser (host can lock or use "Ask to join")
    if (userId && (await prisma.participant.count({ where: { meetingId: m.id, userId, status: "REMOVED" } })))
      throw new AppError(403, "REMOVED_FROM_MEETING", "The host removed you from this meeting.");
  }

  const waiting = !isHost && m.waitingRoom;
  const participant = await prisma.$transaction(async (tx) => {
    if (m.status === "SCHEDULED" && !waiting) {
      await tx.meeting.update({ where: { id: m.id }, data: { status: "LIVE", startedAt: new Date() } });
    }
    return tx.participant.create({
      data: {
        meetingId: m.id,
        name,
        userId,
        isHost,
        status: waiting ? "WAITING" : "ADMITTED",
        ticket: waiting ? randomBytes(24).toString("base64url") : null,
        seenAt: new Date(),
      },
      select: { id: true, ticket: true },
    });
  });

  const meeting = publicMeeting(m);
  if (waiting) return { waiting: true as const, requestId: participant.id, ticket: participant.ticket!, meeting };
  return admitted(meeting, participant.id, name, userId, isHost);
}

const publicMeeting = (m: { id: string; title: string; roomCode: string; status: string; createdAt: Date }) => ({
  id: m.id,
  title: m.title,
  roomCode: m.roomCode,
  status: m.status,
  createdAt: m.createdAt,
});

/** Everything the browser needs to connect to the call. */
async function admitted(
  meeting: ReturnType<typeof publicMeeting>,
  participantId: string,
  name: string,
  userId: string | null | undefined,
  isHost: boolean,
) {
  // Signed-in people bring their profile photo into the call (shown when their camera is off).
  const me = userId
    ? await prisma.user.findUnique({ where: { id: userId }, select: { id: true, avatarType: true, avatarVersion: true, pictureUrl: true } })
    : null;
  const photo = me ? avatarUrl(me) : null;
  const attributes: Record<string, string> = {};
  if (photo) attributes.avatar = photo;
  if (isHost) attributes.role = "host"; // everyone sees a Host badge; mute/remove buttons hide for hosts
  const token = await createJoinToken(meeting.roomCode, participantId, name, attributes);
  return { waiting: false as const, token, livekitUrl: env.LIVEKIT_URL, participantId, meeting, isHost };
}

/** The waiting person's browser asks every few seconds: still waiting, let in (gets a token), or turned away. */
export async function checkJoinRequest(roomCode: string, requestId: string, ticket: string) {
  const p = await prisma.participant.findFirst({ where: { id: requestId, meeting: { roomCode } }, include: { meeting: true } });
  if (!p || !p.ticket || !sameSecret(ticket, p.ticket)) throw new AppError(404, "REQUEST_NOT_FOUND", "Ask to join again.");
  if (p.meeting.status === "ENDED") throw new AppError(410, "MEETING_ENDED", "This meeting has ended.");
  if (p.status === "DENIED") throw new AppError(403, "JOIN_DENIED", "The host didn't let you in.");
  if (p.status === "REMOVED") throw new AppError(403, "REMOVED_FROM_MEETING", "The host removed you from this meeting.");
  if (p.status === "WAITING") {
    await prisma.participant.update({ where: { id: p.id }, data: { seenAt: new Date() } });
    return { waiting: true as const };
  }
  if (p.meeting.status === "SCHEDULED")
    await prisma.meeting.update({ where: { id: p.meetingId }, data: { status: "LIVE", startedAt: new Date() } });
  return admitted(publicMeeting(p.meeting), p.id, p.name, p.userId, false);
}

/** Saves finished caption lines. Only a participant of this meeting can write, and only as themselves. */
export async function saveTranscript(roomCode: string, participantId: string, lines: { text: string; spokenAt: string }[]) {
  const participant = await prisma.participant.findFirst({
    where: { id: participantId, meeting: { roomCode }, status: "ADMITTED" },
    select: { id: true, name: true, meetingId: true },
  });
  if (!participant) throw new AppError(403, "NOT_IN_MEETING", "You are not a participant of this meeting");

  const now = Date.now();
  const { count } = await prisma.transcript.createMany({
    data: lines.map((l) => ({
      meetingId: participant.meetingId,
      participantId: participant.id,
      speakerName: participant.name, // from our records, not the client
      text: l.text,
      // a wrong client clock can't put lines in the future
      spokenAt: new Date(Math.min(new Date(l.spokenAt).getTime(), now)),
    })),
  });
  return { saved: count };
}

// ---------- ending, notes, transcript ----------

export type Access = { participantId?: string; hostKey?: string; userId?: string };

function sameSecret(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}

/** Host = has the meeting's host key. Member = joined it (has a participant id) or is the host. */
async function authorize(roomCode: string, access: Access, need: "member" | "host") {
  const meeting = await prisma.meeting.findUnique({ where: { roomCode } });
  if (!meeting) throw new AppError(404, "MEETING_NOT_FOUND", "This meeting does not exist. Check the link.");
  // Host: the creator's host key (any browser it was saved in) or the signed-in account that created it.
  const isHost =
    (!!access.hostKey && sameSecret(access.hostKey, meeting.hostKey)) || (!!access.userId && access.userId === meeting.hostId);
  if (need === "host" && !isHost) throw new AppError(403, "HOST_ONLY", "Only the person who started the meeting can do this");
  if (!isHost) {
    // Member: joined from this browser (participant id) or joined while signed in (any device).
    const or = [
      ...(access.participantId ? [{ id: access.participantId }] : []),
      ...(access.userId ? [{ userId: access.userId }] : []),
    ];
    const member = or.length
      ? await prisma.participant.findFirst({ where: { meetingId: meeting.id, status: "ADMITTED", OR: or }, select: { id: true } })
      : null;
    if (!member) throw new AppError(403, "NOT_IN_MEETING", "Only people who joined this meeting can see its notes");
  }
  return { meeting, isHost };
}

async function endAndStartNotes(meeting: { id: string; roomCode: string; status: string }) {
  if (meeting.status !== "ENDED") {
    await prisma.meeting.update({ where: { id: meeting.id }, data: { status: "ENDED", endedAt: new Date() } });
  }
  // Notes row (PENDING) must exist before people are disconnected, or their notes page could find none.
  await startNotes(meeting.id);
  await closeRoom(meeting.roomCode);
}

/** Host ends the meeting for everyone; notes start being written. */
export async function endMeeting(roomCode: string, access: Access) {
  const { meeting } = await authorize(roomCode, access, "host");
  if (meeting.status === "ENDED") return { status: "ENDED" as const };
  await endAndStartNotes(meeting);
  return { status: "ENDED" as const };
}

export async function getNotes(roomCode: string, access: Access) {
  const { meeting, isHost } = await authorize(roomCode, access, "member");
  let notes = await prisma.notes.findUnique({ where: { meetingId: meeting.id } });

  // No notes yet and either the meeting already ended (e.g. server restarted mid-way) or everyone just left
  // without pressing "End meeting": treat it as over and write the notes.
  if (!notes && (meeting.status === "ENDED" || (await isRoomEmpty(roomCode)))) {
    await endAndStartNotes(meeting);
    notes = await prisma.notes.findUnique({ where: { meetingId: meeting.id } });
    meeting.status = "ENDED";
  }

  const [attendees, lineCount] = await Promise.all([
    prisma.participant.findMany({ where: { meetingId: meeting.id, status: { in: ["ADMITTED", "REMOVED"] } }, distinct: ["name"], select: { name: true }, orderBy: { joinedAt: "asc" } }),
    prisma.transcript.count({ where: { meetingId: meeting.id } }),
  ]);
  const { hostKey: _secret, ...publicMeeting } = meeting;
  return { meeting: publicMeeting, isHost, attendees: attendees.map((a) => a.name), lineCount, notes };
}

export async function regenerateNotes(roomCode: string, access: Access) {
  const { meeting } = await authorize(roomCode, access, "host");
  if (meeting.status !== "ENDED") throw new AppError(409, "MEETING_LIVE", "End the meeting first");
  await startNotes(meeting.id);
  return { status: "PENDING" as const };
}

export async function updateNotes(roomCode: string, access: Access, content: NotesContent) {
  const { meeting } = await authorize(roomCode, access, "host");
  const notes = await prisma.notes.findUnique({ where: { meetingId: meeting.id } });
  if (!notes || notes.status !== "READY") throw new AppError(409, "NOTES_NOT_READY", "Notes aren't ready to edit yet");
  return prisma.notes.update({ where: { meetingId: meeting.id }, data: { ...content, edited: true } });
}

export async function getTranscript(roomCode: string, access: Access) {
  const { meeting } = await authorize(roomCode, access, "member");
  return prisma.transcript.findMany({
    where: { meetingId: meeting.id },
    orderBy: { spokenAt: "asc" },
    select: { id: true, speakerName: true, text: true, spokenAt: true },
  });
}

// ---------- my meetings (paged, searched and filtered in the database) ----------

const ATTENDED = { in: ["ADMITTED", "REMOVED"] as ("ADMITTED" | "REMOVED")[] };

/** Meetings I host, joined while signed in, or was invited to by email. */
async function whereMine(userId: string, role: MyMeetingsQuery["role"] = "all"): Promise<Prisma.MeetingWhereInput> {
  const me = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } });
  const hosted = { hostId: userId };
  const joined = { participants: { some: { userId, status: ATTENDED } } };
  const invited = { invites: { some: { email: me.email } }, NOT: { hostId: userId } };
  return role === "hosted" ? hosted : role === "joined" ? joined : role === "invited" ? invited : { OR: [hosted, joined, invited] };
}

// "upcoming" = has a planned time; a quick meeting nobody opened yet only shows under "all"
const STATUS: Record<Exclude<MyMeetingsQuery["status"], "all">, Prisma.MeetingWhereInput> = {
  live: { status: "LIVE" },
  upcoming: { status: "SCHEDULED", scheduledFor: { not: null } },
  ended: { status: "ENDED" },
};

const listSelect = {
  id: true,
  title: true,
  roomCode: true,
  status: true,
  createdAt: true,
  startedAt: true,
  endedAt: true,
  scheduledFor: true,
  durationMin: true,
  hostId: true,
  notes: { select: { status: true, title: true, summary: true } },
  _count: { select: { transcript: true, invites: true } },
  participants: { where: { status: ATTENDED }, distinct: ["name"], select: { name: true }, take: 8 },
} satisfies Prisma.MeetingSelect;

type ListRow = Prisma.MeetingGetPayload<{ select: typeof listSelect }>;
const toItem = (userId: string) => ({ hostId, _count, participants, notes, ...m }: ListRow) => ({
  ...m,
  isHost: hostId === userId,
  lineCount: _count.transcript,
  invitedCount: _count.invites,
  attendees: participants.map((p) => p.name),
  notes: notes && { status: notes.status, title: notes.title, summary: notes.summary.slice(0, 220) },
});

/**
 * Meetings everyone walked away from (nobody pressed "End") stay "live" forever. Before listing, ask LiveKit
 * whether anyone is still in each "live" room; empty ones (open 2+ minutes) are ended like the host would,
 * which also writes their notes. If LiveKit can't be reached, nothing is ended (isRoomEmpty says "not empty").
 */
async function closeAbandoned(mine: Prisma.MeetingWhereInput) {
  const live = await prisma.meeting.findMany({
    where: { AND: [mine, { status: "LIVE", startedAt: { lt: new Date(Date.now() - 2 * 60_000) } }] },
    select: { id: true, roomCode: true, status: true },
    take: 10,
  });
  await Promise.all(live.map(async (m) => (await isRoomEmpty(m.roomCode)) && endAndStartNotes(m).catch(() => {})));
}

export async function listMyMeetings(userId: string, query: MyMeetingsQuery) {
  const mine = await whereMine(userId, query.role);
  await closeAbandoned(await whereMine(userId));
  const like = { contains: query.q, mode: "insensitive" as const };
  const search: Prisma.MeetingWhereInput = query.q
    ? { OR: [{ title: like }, { notes: { is: { OR: [{ title: like }, { summary: like }] } } }, { participants: { some: { name: like } } }] }
    : {};
  const base: Prisma.MeetingWhereInput = { AND: [mine, search] };
  const where: Prisma.MeetingWhereInput = query.status === "all" ? base : { AND: [base, STATUS[query.status]] };
  const orderBy: Prisma.MeetingOrderByWithRelationInput[] =
    query.sort === "oldest"
      ? [{ createdAt: "asc" }]
      : query.sort === "soonest"
        ? [{ scheduledFor: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }]
        : [{ createdAt: "desc" }];

  const tab = (w: Prisma.MeetingWhereInput) => prisma.meeting.count({ where: { AND: [base, w] } });
  const [total, rows, all, live, upcoming, ended] = await Promise.all([
    prisma.meeting.count({ where }),
    prisma.meeting.findMany({ where, orderBy, skip: (query.page - 1) * query.pageSize, take: query.pageSize, select: listSelect }),
    prisma.meeting.count({ where: base }),
    tab(STATUS.live),
    tab(STATUS.upcoming),
    tab(STATUS.ended),
  ]);
  return {
    items: rows.map(toItem(userId)),
    total,
    page: query.page,
    pageSize: query.pageSize,
    pageCount: Math.max(1, Math.ceil(total / query.pageSize)),
    counts: { all, live, upcoming, ended },
  };
}

/** Dashboard numbers for the last 30 days, plus what's live and coming up. */
export async function myStats(userId: string) {
  const mine = await whereMine(userId);
  await closeAbandoned(mine);
  const since = new Date(Date.now() - 30 * 86_400_000);
  const recent: Prisma.MeetingWhereInput = { AND: [mine, { createdAt: { gte: since } }] };
  const me = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true } });
  const [meetings, timed, notesReady, people, live, upcoming] = await Promise.all([
    prisma.meeting.count({ where: recent }),
    prisma.meeting.findMany({ where: { AND: [recent, { status: "ENDED" }] }, select: { startedAt: true, endedAt: true } }),
    prisma.meeting.count({ where: { AND: [recent, { notes: { is: { status: "READY" } } }] } }),
    prisma.participant.findMany({
      where: { meeting: recent, status: ATTENDED, OR: [{ userId: null }, { userId: { not: userId } }], name: { not: me.name } },
      distinct: ["name"],
      select: { name: true },
    }),
    prisma.meeting.findMany({ where: { AND: [mine, { status: "LIVE" }] }, orderBy: { startedAt: "desc" }, take: 5, select: listSelect }),
    prisma.meeting.findMany({
      where: { AND: [mine, { status: "SCHEDULED", scheduledFor: { gte: new Date(Date.now() - 60 * 60_000) } }] },
      orderBy: { scheduledFor: "asc" },
      take: 5,
      select: listSelect,
    }),
  ]);
  const minutes = timed.reduce(
    (sum, m) => (m.startedAt && m.endedAt ? sum + Math.max(1, Math.round((m.endedAt.getTime() - m.startedAt.getTime()) / 60000)) : sum),
    0,
  );
  return { meetings, minutes, notesReady, peopleMet: people.length, live: live.map(toItem(userId)), upcoming: upcoming.map(toItem(userId)) };
}

// ---------- recordings (host records in the browser, uploads straight to Backblaze B2) ----------

/** Host starts an upload: we create the record and hand back a 1-hour upload link. */
export async function startRecordingUpload(roomCode: string, access: Access, info: { mimeType: string; durationSec: number }) {
  const { meeting } = await authorize(roomCode, access, "host");
  const ext = info.mimeType.includes("mp4") ? "mp4" : "webm";
  const storageKey = `meetings/${meeting.id}/${randomBytes(12).toString("hex")}.${ext}`;
  const url = await uploadUrl(storageKey, info.mimeType); // throws STORAGE_NOT_CONFIGURED before any row is made
  const rec = await prisma.recording.create({
    data: { meetingId: meeting.id, storageKey, mimeType: info.mimeType, durationSec: info.durationSec },
    select: { id: true },
  });
  return { id: rec.id, uploadUrl: url };
}

/** Host says the upload finished: we check the file really is in the bucket. */
export async function completeRecordingUpload(roomCode: string, access: Access, id: string) {
  const { meeting } = await authorize(roomCode, access, "host");
  const rec = await prisma.recording.findFirst({ where: { id, meetingId: meeting.id } });
  if (!rec) throw new AppError(404, "RECORDING_NOT_FOUND", "Recording not found");
  const size = await storedSize(rec.storageKey);
  const ok = size !== null && size > 0;
  await prisma.recording.update({ where: { id }, data: ok ? { status: "READY", sizeBytes: size } : { status: "FAILED" } });
  if (!ok) throw new AppError(422, "UPLOAD_MISSING", "The upload didn't reach storage. Your copy was downloaded instead.");
  return { status: "READY" as const };
}

/** Finished recordings with short-lived play and download links (members only). */
export async function listRecordings(roomCode: string, access: Access) {
  const { meeting } = await authorize(roomCode, access, "member");
  const recs = await prisma.recording.findMany({
    where: { meetingId: meeting.id, status: "READY" },
    orderBy: { createdAt: "asc" },
    select: { id: true, mimeType: true, sizeBytes: true, durationSec: true, createdAt: true, storageKey: true },
  });
  return Promise.all(
    recs.map(async ({ storageKey, ...r }, i) => ({
      ...r,
      playUrl: await downloadUrl(storageKey),
      downloadUrl: await downloadUrl(storageKey, `${meeting.title} recording ${i + 1}.${storageKey.split(".").pop()}`),
    })),
  );
}

/** Host sends the notes email again (e.g. after editing them). */
export async function emailNotesAgain(roomCode: string, access: Access) {
  const { meeting } = await authorize(roomCode, access, "host");
  return emailNotes(meeting.id, { force: true });
}

// ---------- host controls: waiting room, lock, mute, remove ----------

const WAITING_FRESH_MS = 20_000; // someone who stopped asking (closed the tab) drops off the list

/** Host's view: settings + who is waiting right now. */
export async function listWaiting(roomCode: string, access: Access) {
  const { meeting } = await authorize(roomCode, access, "host");
  const waiting = await prisma.participant.findMany({
    where: { meetingId: meeting.id, status: "WAITING", seenAt: { gt: new Date(Date.now() - WAITING_FRESH_MS) } },
    orderBy: { joinedAt: "asc" },
    select: { id: true, name: true, joinedAt: true, user: { select: { id: true, avatarType: true, avatarVersion: true, pictureUrl: true } } },
  });
  return {
    waitingRoom: meeting.waitingRoom,
    locked: meeting.locked,
    waiting: waiting.map(({ user, ...w }) => ({ ...w, avatarUrl: user ? avatarUrl(user) : null })),
  };
}

export async function answerJoinRequest(roomCode: string, access: Access, requestId: string, admit: boolean) {
  const { meeting } = await authorize(roomCode, access, "host");
  const { count } = await prisma.participant.updateMany({
    where: { id: requestId, meetingId: meeting.id, status: "WAITING" },
    data: { status: admit ? "ADMITTED" : "DENIED" },
  });
  if (!count) throw new AppError(404, "REQUEST_NOT_FOUND", "That person is no longer waiting");
  return { admitted: admit };
}

export async function updateSettings(roomCode: string, access: Access, settings: { waitingRoom?: boolean; locked?: boolean }) {
  const { meeting } = await authorize(roomCode, access, "host");
  const updated = await prisma.meeting.update({ where: { id: meeting.id }, data: settings, select: { waitingRoom: true, locked: true } });
  // Turning "Ask to join" off lets everyone who is waiting in.
  if (settings.waitingRoom === false)
    await prisma.participant.updateMany({ where: { meetingId: meeting.id, status: "WAITING" }, data: { status: "ADMITTED" } });
  return updated;
}

/** Someone in the call who isn't a host (hosts can't be muted or removed). */
async function guestInCall(meetingId: string, participantId: string) {
  const p = await prisma.participant.findFirst({ where: { id: participantId, meetingId, status: "ADMITTED" }, select: { id: true, isHost: true } });
  if (!p) throw new AppError(404, "PARTICIPANT_NOT_FOUND", "That person isn't in this meeting");
  if (p.isHost) throw new AppError(403, "CANNOT_TARGET_HOST", "You can't do that to a host");
  return p;
}

export async function muteParticipant(roomCode: string, access: Access, participantId: string) {
  const { meeting } = await authorize(roomCode, access, "host");
  await guestInCall(meeting.id, participantId);
  await muteMicrophone(roomCode, participantId);
  return { muted: true };
}

export async function removeParticipant(roomCode: string, access: Access, participantId: string) {
  const { meeting } = await authorize(roomCode, access, "host");
  await guestInCall(meeting.id, participantId);
  await prisma.participant.update({ where: { id: participantId }, data: { status: "REMOVED", ticket: null } });
  await removeFromRoom(roomCode, participantId);
  return { removed: true };
}
