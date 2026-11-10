import { useSyncExternalStore } from "react";
import { toast } from "sonner";
import { ApiError, meetingsApi } from "@/lib/api";

export type RecorderState =
  | { phase: "idle" }
  | { phase: "recording"; startedAt: number }
  | { phase: "uploading"; progress: number }
  | { phase: "done" }
  | { phase: "saved-locally" };

// Lives outside React so an upload keeps going after the call screen closes (leave / end meeting).
let state: RecorderState = { phase: "idle" };
const listeners = new Set<() => void>();
function set(next: RecorderState) {
  state = next;
  listeners.forEach((l) => l());
}
export function useRecorderState() {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => state,
  );
}

let recorder: MediaRecorder | null = null;
let chunks: Blob[] = [];
let cleanup: (() => void) | null = null;
let ctx: { roomCode: string; hostKey?: string; title: string; onStop?: () => void } | null = null;

export const canRecord = () =>
  typeof MediaRecorder !== "undefined" && typeof navigator.mediaDevices?.getDisplayMedia === "function";

function pickMimeType() {
  for (const t of ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"])
    if (MediaRecorder.isTypeSupported(t)) return t;
  return "";
}

/**
 * Records this tab (everyone's video + audio) plus my own microphone, which the tab doesn't play back.
 * shortcut: the whole recording is kept in memory (~300–600 MB per hour); switch to chunked multipart
 * uploads if people record meetings longer than ~2 hours.
 */
export async function startRecording(opts: {
  roomCode: string;
  hostKey?: string;
  title: string;
  mic?: MediaStreamTrack;
  onStop?: () => void;
}) {
  if (state.phase === "recording" || state.phase === "uploading") return;
  const display = await navigator.mediaDevices.getDisplayMedia({
    video: { frameRate: 30 },
    audio: true,
    // Chrome/Edge: offer "this tab" first and keep the picker simple
    preferCurrentTab: true,
    selfBrowserSurface: "include",
    surfaceSwitching: "exclude",
  } as DisplayMediaStreamOptions);

  // Mix tab audio (other people) + my mic into one track.
  const audioCtx = new AudioContext();
  const out = audioCtx.createMediaStreamDestination();
  if (display.getAudioTracks().length) audioCtx.createMediaStreamSource(new MediaStream(display.getAudioTracks())).connect(out);
  if (opts.mic && opts.mic.readyState === "live") audioCtx.createMediaStreamSource(new MediaStream([opts.mic])).connect(out);

  const stream = new MediaStream([...display.getVideoTracks(), ...out.stream.getAudioTracks()]);
  const mimeType = pickMimeType();
  recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2_500_000 });
  chunks = [];
  ctx = { roomCode: opts.roomCode, hostKey: opts.hostKey, title: opts.title, onStop: opts.onStop };
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  recorder.onstop = () => void finish();
  // The browser's own "Stop sharing" bar also ends the recording.
  display.getVideoTracks()[0]?.addEventListener("ended", () => stopRecording());
  cleanup = () => {
    display.getTracks().forEach((t) => t.stop());
    void audioCtx.close();
  };
  recorder.start(1000); // a chunk every second, so a crash loses at most a second
  set({ phase: "recording", startedAt: Date.now() });
}

export function stopRecording() {
  if (recorder && recorder.state !== "inactive") recorder.stop();
}

function saveLocally(blob: Blob, title: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${title.replace(/[^\w\- ]+/g, "").trim() || "meeting"} recording.${blob.type.includes("mp4") ? "mp4" : "webm"}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
}

/** PUT with progress (fetch can't report upload progress). */
function upload(url: string, blob: Blob, contentType: string) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("content-type", contentType);
    xhr.upload.onprogress = (e) => e.lengthComputable && set({ phase: "uploading", progress: e.loaded / e.total });
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status})`)));
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(blob);
  });
}

async function finish() {
  cleanup?.();
  const c = ctx!;
  c.onStop?.();
  const startedAt = state.phase === "recording" ? state.startedAt : Date.now();
  const contentType = (recorder?.mimeType || "video/webm").split(";")[0]!;
  const blob = new Blob(chunks, { type: contentType });
  chunks = [];
  recorder = null;
  if (blob.size === 0) return set({ phase: "idle" });

  const warnBeforeClose = (e: BeforeUnloadEvent) => e.preventDefault();
  window.addEventListener("beforeunload", warnBeforeClose);
  set({ phase: "uploading", progress: 0 });
  try {
    const durationSec = Math.round((Date.now() - startedAt) / 1000);
    const { id, uploadUrl } = await meetingsApi.startRecording(c.roomCode, c.hostKey, contentType, durationSec);
    await upload(uploadUrl, blob, contentType);
    await meetingsApi.completeRecording(c.roomCode, c.hostKey, id);
    set({ phase: "done" });
    toast.success("Recording saved. You'll find it on the meeting notes page.");
  } catch (err) {
    saveLocally(blob, c.title); // never lose a recording
    set({ phase: "saved-locally" });
    const reason = err instanceof ApiError ? err.message : (err as Error).message;
    toast.error(`Couldn't upload the recording (${reason}). A copy was downloaded to your computer.`, { duration: 10_000 });
  } finally {
    window.removeEventListener("beforeunload", warnBeforeClose);
  }
}
