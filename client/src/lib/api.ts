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
export type NotesResponse = { meeting: Meeting; isHost: boolean; attendees: string[]; lineCount: number; notes: Notes | null };
export type TranscriptRow = { id: string; speakerName: string; text: string; spokenAt: string };
export type MyMeeting = Meeting & {
  isHost: boolean;
  lineCount: number;
  attendees: string[];
  notes: { status: Notes["status"]; title: string; summary: string } | null;
};
export type RecordingInfo = { id: string; mimeType: string; sizeBytes: number; durationSec: number; createdAt: string; playUrl: string; downloadUrl: string };
export type JoinData = { token: string; livekitUrl: string; participantId: string; meeting: Meeting; isHost: boolean };

export const meetingsApi = {
  create: (title?: string) =>
    api.post<{ data: Meeting & { hostKey: string } }>("/meetings", { title }).then((r) => r.data.data),
  get: (roomCode: string) => api.get<{ data: Meeting }>(`/meetings/${roomCode}`).then((r) => r.data.data),
  join: (roomCode: string, name: string) =>
    api.post<{ data: JoinData }>(`/meetings/${roomCode}/token`, { name }).then((r) => r.data.data),
  end: (roomCode: string, hostKey?: string) => api.post(`/meetings/${roomCode}/end`, { hostKey }),
  notes: (roomCode: string, headers: Record<string, string>) =>
    api.get<{ data: NotesResponse }>(`/meetings/${roomCode}/notes`, { headers }).then((r) => r.data.data),
  emailNotes: (roomCode: string, hostKey?: string) =>
    api.post<{ data: { sent: number } }>(`/meetings/${roomCode}/notes/email`, { hostKey }).then((r) => r.data.data),
  regenerateNotes: (roomCode: string, hostKey?: string) => api.post(`/meetings/${roomCode}/notes/regenerate`, { hostKey }),
  updateNotes: (roomCode: string, hostKey: string | undefined, notes: NotesContent) =>
    api.patch<{ data: Notes }>(`/meetings/${roomCode}/notes`, { hostKey, notes }).then((r) => r.data.data),
  mine: () => api.get<{ data: MyMeeting[] }>("/meetings/mine").then((r) => r.data.data),
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
};

/** Accepts a code ("abc-defg-hij") or a full meeting link and returns the code, or null. */
export function parseRoomCode(input: string): string | null {
  const match = input.trim().toLowerCase().match(/([a-z]{3}-[a-z]{4}-[a-z]{3})\/?$/);
  return match ? match[1] : null;
}

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
