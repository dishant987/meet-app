import axios, { AxiosError } from "axios";

export const api = axios.create({
  // Production (Vercel): the API lives on the same address under /api. Local dev: the API runs on :4000.
  baseURL: `${import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? "" : "http://localhost:4000")}/api`,
  withCredentials: true,
  timeout: 15_000,
});

/** Every failed request becomes an ApiError with a code and a human message. */
export class ApiError extends Error {
  code: string;
  status?: number;
  details?: Record<string, string[]>;
  constructor(code: string, message: string, status?: number, details?: Record<string, string[]>) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

type ErrorBody = { error?: { code: string; message: string; details?: Record<string, string[]> } };

api.interceptors.response.use(
  (res) => res,
  (err: AxiosError<ErrorBody>) => {
    if (err.response?.data?.error) {
      const { code, message, details } = err.response.data.error;
      return Promise.reject(new ApiError(code, message, err.response.status, details));
    }
    if (err.code === "ECONNABORTED") {
      return Promise.reject(new ApiError("TIMEOUT", "The server is taking too long. It may be waking up, try again."));
    }
    if (!err.response) {
      return Promise.reject(new ApiError("NETWORK_ERROR", "Can't reach the server. Check your internet and try again."));
    }
    return Promise.reject(new ApiError("UNKNOWN", "Something went wrong. Please try again.", err.response.status));
  },
);

/** Photo paths from our API ("/api/users/…") need the API's address in front; Google photo URLs are already full. */
export const assetUrl = (path: string | null | undefined) =>
  !path ? undefined : path.startsWith("/") ? `${api.defaults.baseURL!.replace(/\/api$/, "")}${path}` : path;

/** Per-field form errors ({ field: [message] }) if this error has them, else null (e.g. rate limits carry other details). */
export function fieldErrors(err: unknown): Record<string, string[]> | null {
  if (!(err instanceof ApiError) || !err.details) return null;
  const entries = Object.entries(err.details).filter(([, v]) => Array.isArray(v) && typeof v[0] === "string");
  return entries.length ? Object.fromEntries(entries) : null;
}

export const errorMessage = (err: unknown) =>
  err instanceof ApiError ? err.message : "Something went wrong. Please try again.";

// ---- typed calls ----
export type Meeting = {
  id: string;
  title: string;
  roomCode: string;
  status: "SCHEDULED" | "LIVE" | "ENDED";
  createdAt?: string;
  startedAt?: string | null;
  endedAt?: string | null;
};
export type ActionItem = { task: string; owner: string | null; dueDate: string | null };
export type NotesContent = {
  title: string;
  summary: string;
  keyPoints: string[];
  decisions: string[];
  actionItems: ActionItem[];
  openQuestions: string[];
};
export type Notes = NotesContent & {
  status: "PENDING" | "READY" | "FAILED" | "EMPTY";
  provider: string | null;
  error: string | null;
  edited: boolean;
  emailedAt: string | null;
  updatedAt: string;
};
export type NotesResponse = { meeting: Meeting; isHost: boolean; attendees: string[]; lineCount: number; chatCount: number; notes: Notes | null };
export type ChatRow = { id: string; senderName: string; text: string; sentAt: string };
export type TranscriptRow = { id: string; speakerName: string; text: string; spokenAt: string };
export type MyMeeting = Meeting & {
  isHost: boolean;
  scheduledFor: string | null;
  durationMin: number | null;
  invitedCount: number;
  lineCount: number;
  attendees: string[];
  notes: { status: Notes["status"]; title: string; summary: string } | null;
  /** Recurring: every occurrence is its own meeting sharing a seriesId. */
  recurrence: "DAILY" | "WEEKLY" | null;
  seriesId: string | null;
  /** Guests' answers (host only). */
  replies: { yes: number; maybe: number; no: number } | null;
  team: { id: string; name: string } | null;
};
export type Answer = "YES" | "MAYBE" | "NO";
export type InviteReply = { title: string; hostName: string | null; scheduledFor: string | null; durationMin: number | null; recurrence: string | null; answer: Answer | null; link: string };
export type RecordingInfo = { id: string; mimeType: string; sizeBytes: number; durationSec: number; createdAt: string; playUrl: string; downloadUrl: string };
/** Starting a meeting now, or scheduling one (with emailed calendar invites). */
export type NewMeeting = {
  title?: string;
  scheduledFor?: string;
  durationMin?: number;
  invitees?: string[];
  timeZone?: string;
  repeat?: "DAILY" | "WEEKLY";
  repeatCount?: number;
  teamId?: string;
};
export type MeetingsQuery = {
  q: string;
  status: "all" | "live" | "upcoming" | "ended";
  role: "all" | "hosted" | "joined" | "invited" | "team";
  sort: "newest" | "oldest" | "soonest";
  page: number;
  pageSize: number;
};
export type MeetingsPage = {
  items: MyMeeting[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  counts: { all: number; live: number; upcoming: number; ended: number };
};
export type MyStats = { meetings: number; minutes: number; notesReady: number; peopleMet: number; live: MyMeeting[]; upcoming: MyMeeting[] };
export type JoinData = { waiting: false; token: string; livekitUrl: string; participantId: string; meeting: Meeting; isHost: boolean };
/** "Ask to join" is on: wait with this ticket until the host lets you in. */
export type JoinWaiting = { waiting: true; requestId: string; ticket: string; meeting: Meeting };
export type WaitingPerson = { id: string; name: string; joinedAt: string; avatarUrl: string | null };
export type HostState = { waitingRoom: boolean; locked: boolean; waiting: WaitingPerson[] };
const hostHeaders = (hostKey?: string): Record<string, string> => (hostKey ? { "x-host-key": hostKey } : {});

export const meetingsApi = {
  create: (body: NewMeeting = {}) =>
    api.post<{ data: Meeting & { hostKey: string; invited: number; occurrences: number } }>("/meetings", body).then((r) => r.data.data),
  get: (roomCode: string) => api.get<{ data: Meeting }>(`/meetings/${roomCode}`).then((r) => r.data.data),
  join: (roomCode: string, name: string, hostKey?: string) =>
    api.post<{ data: JoinData | JoinWaiting }>(`/meetings/${roomCode}/token`, { name, hostKey }).then((r) => r.data.data),
  checkRequest: (roomCode: string, requestId: string, ticket: string) =>
    api
      .post<{ data: JoinData | { waiting: true } }>(`/meetings/${roomCode}/requests/${requestId}`, { ticket })
      .then((r) => r.data.data),
  hostState: (roomCode: string, hostKey?: string) =>
    api.get<{ data: HostState }>(`/meetings/${roomCode}/waiting`, { headers: hostHeaders(hostKey) }).then((r) => r.data.data),
  answerRequest: (roomCode: string, requestId: string, admit: boolean, hostKey?: string) =>
    api.post(`/meetings/${roomCode}/waiting/${requestId}`, { admit, hostKey }),
  updateSettings: (roomCode: string, settings: { waitingRoom?: boolean; locked?: boolean }, hostKey?: string) =>
    api.patch(`/meetings/${roomCode}/settings`, { ...settings, hostKey }),
  muteParticipant: (roomCode: string, participantId: string, hostKey?: string) =>
    api.post(`/meetings/${roomCode}/participants/${participantId}/mute`, { hostKey }),
  removeParticipant: (roomCode: string, participantId: string, hostKey?: string) =>
    api.post(`/meetings/${roomCode}/participants/${participantId}/remove`, { hostKey }),
  end: (roomCode: string, hostKey?: string) => api.post(`/meetings/${roomCode}/end`, { hostKey }),
  notes: (roomCode: string, headers: Record<string, string>) =>
    api.get<{ data: NotesResponse }>(`/meetings/${roomCode}/notes`, { headers }).then((r) => r.data.data),
  emailNotes: (roomCode: string, hostKey?: string) =>
    api.post<{ data: { sent: number } }>(`/meetings/${roomCode}/notes/email`, { hostKey }).then((r) => r.data.data),
  regenerateNotes: (roomCode: string, hostKey?: string) => api.post(`/meetings/${roomCode}/notes/regenerate`, { hostKey }),
  updateNotes: (roomCode: string, hostKey: string | undefined, notes: NotesContent) =>
    api.patch<{ data: Notes }>(`/meetings/${roomCode}/notes`, { hostKey, notes }).then((r) => r.data.data),
  mine: (query: Partial<MeetingsQuery> = {}, signal?: AbortSignal) =>
    api.get<{ data: MeetingsPage }>("/meetings/mine", { params: query, signal }).then((r) => r.data.data),
  /** Calendar page: my meetings between two moments (at most ~2 months). */
  calendar: (from: Date, to: Date, signal?: AbortSignal) =>
    api
      .get<{ data: MyMeeting[] }>("/meetings/calendar", { params: { from: from.toISOString(), to: to.toISOString() }, signal })
      .then((r) => r.data.data),
  stats: () => api.get<{ data: MyStats }>("/meetings/stats").then((r) => r.data.data),
  /** Edit form data (host only). */
  getSchedule: (roomCode: string, hostKey?: string) =>
    api
      .get<{
        data: {
          title: string;
          scheduledFor: string | null;
          durationMin: number | null;
          invitees: string[];
          replies: { email: string; response: Answer | null }[];
          recurrence: "DAILY" | "WEEKLY" | null;
          seriesLeft: number;
          editable: boolean;
        };
      }>(
        `/meetings/${roomCode}/schedule`,
        { headers: hostHeaders(hostKey) },
      )
      .then((r) => r.data.data),
  /** Host changes a meeting that hasn't started; `invitees` is the whole new guest list. */
  updateSchedule: (roomCode: string, change: Omit<NewMeeting, "title"> & { title?: string }, hostKey?: string) =>
    api
      .patch<{ data: Meeting & { invited: number; updated: number; removed: number; occurrences: number } }>(`/meetings/${roomCode}/schedule`, { ...change, hostKey })
      .then((r) => r.data.data),
  /** Host cancels a meeting that hasn't started; guests get a cancellation. */
  cancelMeeting: (roomCode: string, hostKey?: string, scope: "one" | "series" = "one") =>
    api
      .post<{ data: { cancelled: true; notified: number } }>(`/meetings/${roomCode}/cancel`, {
        hostKey,
        scope,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      })
      .then((r) => r.data.data),
  recordings: (roomCode: string, headers: Record<string, string>) =>
    api.get<{ data: RecordingInfo[] }>(`/meetings/${roomCode}/recordings`, { headers }).then((r) => r.data.data),
  startRecording: (roomCode: string, hostKey: string | undefined, mimeType: string, durationSec: number) =>
    api
      .post<{ data: { id: string; uploadUrl: string } }>(`/meetings/${roomCode}/recordings`, { hostKey, mimeType, durationSec })
      .then((r) => r.data.data),
  completeRecording: (roomCode: string, hostKey: string | undefined, id: string) =>
    api.post(`/meetings/${roomCode}/recordings/${id}/complete`, { hostKey }),
  transcript: (roomCode: string, headers: Record<string, string>) =>
    api.get<{ data: TranscriptRow[] }>(`/meetings/${roomCode}/transcript`, { headers }).then((r) => r.data.data),
  /** Guest's Yes / Maybe / No from the invite email link (no sign-in). Leave out `answer` to just read it. */
  reply: (token: string, answer?: Answer) => api.post<{ data: InviteReply }>("/meetings/rsvp", { token, answer }).then((r) => r.data.data),
  seriesCurrent: (seriesId: string) =>
    api.get<{ data: { roomCode: string } }>(`/meetings/series/${seriesId}/current`).then((r) => r.data.data),
  chat: (roomCode: string, headers: Record<string, string>) =>
    api.get<{ data: ChatRow[] }>(`/meetings/${roomCode}/chat`, { headers }).then((r) => r.data.data),
  /** Keeps a sent chat message with the meeting (best effort: the call itself already delivered it). */
  saveChat: (roomCode: string, participantId: string, text: string) => api.post(`/meetings/${roomCode}/chat`, { participantId, text }),
};

export { parseRoomCode } from "./validation";

export type TranscriptLine = { text: string; spokenAt: string };

/**
 * Saves caption lines. Uses fetch with keepalive so a save started while the page is closing still finishes.
 * Throws on failure so the caller keeps the lines and retries.
 */
export async function saveTranscript(roomCode: string, participantId: string, lines: TranscriptLine[]) {
  const res = await fetch(`${api.defaults.baseURL}/meetings/${roomCode}/transcript`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    keepalive: true,
    body: JSON.stringify({ participantId, lines }),
  });
  if (!res.ok) throw new ApiError("TRANSCRIPT_SAVE_FAILED", "Couldn't save captions", res.status);
}

// ---------- search ----------
export type SearchHit = { kind: "title" | "notes" | "transcript" | "chat"; id?: string; who?: string; at?: string; snippet: string };
export type SearchResult = {
  roomCode: string;
  title: string;
  status: Meeting["status"];
  startedAt: string | null;
  scheduledFor: string | null;
  createdAt: string;
  teamName: string | null;
  hits: SearchHit[];
};
export const searchApi = {
  search: (q: string, signal?: AbortSignal) =>
    api.get<{ data: { meetings: SearchResult[] } }>("/meetings/search", { params: { q }, signal }).then((r) => r.data.data.meetings),
};

// ---------- ask AI ----------
export type AiAnswer = { id: string; question: string; answer: string; createdAt: string };
export const askApi = {
  history: (roomCode: string) => api.get<{ data: AiAnswer[] }>(`/meetings/${roomCode}/ask`).then((r) => r.data.data),
  // the time zone lets the answer quote times the way the page shows them
  ask: (roomCode: string, question: string) =>
    api
      .post<{ data: AiAnswer }>(`/meetings/${roomCode}/ask`, { question, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone })
      .then((r) => r.data.data),
};

// ---------- teams ----------
export type TeamRole = "OWNER" | "ADMIN" | "MEMBER";
export type TeamSummary = { id: string; name: string; role: TeamRole; members: number; meetings: number };
export type TeamInviteForMe = { id: string; role: TeamRole; teamId: string; teamName: string; members: number };
export type TeamSettings = { askToJoin: boolean; allowedDomains: string[]; recording: "HOST" | "OFF" };
export type TeamDetail = {
  id: string;
  name: string;
  myRole: TeamRole;
  settings: TeamSettings;
  maxPeople: number;
  members: { id: string; name: string; email: string; avatarUrl: string | null; role: TeamRole; joinedAt: string }[];
  invites: { id: string; email: string; role: TeamRole; createdAt: string }[];
};
export const teamsApi = {
  mine: () => api.get<{ data: { teams: TeamSummary[]; invites: TeamInviteForMe[] } }>("/teams").then((r) => r.data.data),
  create: (name: string) => api.post<{ data: { id: string; name: string } }>("/teams", { name }).then((r) => r.data.data),
  get: (id: string) => api.get<{ data: TeamDetail }>(`/teams/${id}`).then((r) => r.data.data),
  update: (id: string, change: Partial<TeamSettings> & { name?: string }) =>
    api.patch<{ data: TeamSettings & { name: string } }>(`/teams/${id}`, change).then((r) => r.data.data),
  remove: (id: string) => api.delete(`/teams/${id}`),
  invite: (id: string, emails: string[], role: "ADMIN" | "MEMBER") =>
    api.post<{ data: { invited: number; skipped: number } }>(`/teams/${id}/invites`, { emails, role }).then((r) => r.data.data),
  cancelInvite: (id: string, inviteId: string) => api.delete(`/teams/${id}/invites/${inviteId}`),
  answer: (inviteId: string, accept: boolean) =>
    api.post<{ data: { joined: boolean; teamId: string } }>(`/teams/invites/${inviteId}`, { accept }).then((r) => r.data.data),
  setRole: (id: string, userId: string, role: "ADMIN" | "MEMBER") => api.patch(`/teams/${id}/members/${userId}`, { role }),
  removeMember: (id: string, userId: string) => api.delete(`/teams/${id}/members/${userId}`),
};

// ---------- plan, billing, calendar ----------
export type PlanLimits = { name: string; people: number; recordingsPerMonth: number | null; aiPerDay: number; teamsOwned: number; teamMembers: number };
export type Invoice = {
  id: string;
  number: string | null;
  date: string;
  amount: number;
  currency: string;
  status: string | null;
  description: string;
  hostedUrl: string | null;
  pdfUrl: string | null;
};
export type PlanId = "FREE" | "PRO" | "BUSINESS";
export type PaidPlan = Exclude<PlanId, "FREE">;
export type Money = { amount: number; currency: string };
export type PublicPlan = PlanLimits & { id: PlanId; prices: { month: Money; year: Money } | null };
export type BillingOverview = {
  plan: PlanId;
  limits: PlanLimits;
  used: { recordingsThisMonth: number; aiQuestionsToday: number; teamsOwned: number };
  billing: null | {
    testMode: boolean;
    status: string | null;
    interval: "month" | "year" | null;
    renewsAt: string | null;
    cancelAtPeriodEnd: boolean;
    canManage: boolean;
    prices: Partial<Record<PaidPlan, { month: Money; year: Money }>>;
    invoices: Invoice[];
  };
};
export const billingApi = {
  overview: () => api.get<{ data: BillingOverview }>("/billing").then((r) => r.data.data),
  checkout: (plan: PaidPlan, interval: "month" | "year") =>
    api.post<{ data: { url: string } }>("/billing/checkout", { plan, interval }).then((r) => r.data.data.url),
  /** Public: every plan's limits and prices (landing page). */
  plans: () => api.get<{ data: PublicPlan[] }>("/billing/plans").then((r) => r.data.data),
  portal: () => api.post<{ data: { url: string } }>("/billing/portal").then((r) => r.data.data.url),
};
export const calendarApi = {
  link: () => api.get<{ data: { url: string } }>("/me/calendar").then((r) => r.data.data.url),
  reset: () => api.post<{ data: { url: string } }>("/me/calendar/reset").then((r) => r.data.data.url),
};
