import { useCallback, useEffect, useRef, useState } from "react";
import { useDataChannel, useLocalParticipant, useParticipants, useRoomContext } from "@livekit/components-react";
import { setMyAttribute } from "@/lib/attributes";
import { toast } from "sonner";
import { saveTranscript, type TranscriptLine } from "@/lib/api";
import { getSpeechRecognition, speechErrorMessage, type SpeechRecognitionLike } from "@/lib/speech";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const LANG_KEY = "meetapp-caption-lang";
const SHOW_FOR_MS = 6000; // a speaker's caption fades out after this much silence
const MAX_QUEUE = 500; // unsaved lines kept in memory while the server is unreachable

/** `previous` = last finished sentence (shown dimmed), `current` = words being spoken now. */
export type CaptionEntry = { identity: string; name: string; previous: string; current: string; at: number };
type CaptionMsg = { id: number; text: string; final: boolean };

function readLang() {
  try {
    return localStorage.getItem(LANG_KEY) || navigator.language || "en-US";
  } catch {
    return "en-US";
  }
}

/** Batches finished lines and saves them; failed batches stay queued and are retried. */
function useTranscriptSaver(roomCode: string, participantId: string) {
  const queue = useRef<TranscriptLine[]>([]);
  const saving = useRef(false);

  const flush = useCallback(async () => {
    if (saving.current || queue.current.length === 0) return;
    saving.current = true;
    const batch = queue.current.slice(0, 20);
    try {
      await saveTranscript(roomCode, participantId, batch);
      queue.current = queue.current.slice(batch.length);
    } catch {
      /* keep the batch; the timer retries */
    } finally {
      saving.current = false;
    }
  }, [roomCode, participantId]);

  useEffect(() => {
    const timer = setInterval(flush, 4000);
    const onHide = () => void flush(); // keepalive fetch survives the page closing
    window.addEventListener("pagehide", onHide);
    return () => {
      clearInterval(timer);
      window.removeEventListener("pagehide", onHide);
      void flush(); // leaving the call
    };
  }, [flush]);

  return useCallback(
    (line: TranscriptLine) => {
      queue.current.push(line);
      if (queue.current.length > MAX_QUEUE) queue.current.shift();
      if (queue.current.length >= 10) void flush();
    },
    [flush],
  );
}

/**
 * Live captions.
 * - Each person's browser captions only their own mic, and only while their mic is on.
 * - Speech is transcribed while anyone in the call has captions on (participant attribute `captions=on`).
 * - Words are shared live with everyone; finished lines are saved for the meeting notes.
 */
export function useCaptions(roomCode: string, participantId: string) {
  const room = useRoomContext();
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant();
  const participants = useParticipants();
  const [enabled, setEnabled] = useState(false);
  const [lang, setLangState] = useState(readLang);
  const [entries, setEntries] = useState<Record<string, CaptionEntry>>({});
  const supported = getSpeechRecognition() !== null;
  // participantId comes from our server at join time; localParticipant.identity is empty until connected.
  const addLine = useTranscriptSaver(roomCode, participantId);

  const anyoneWatching = participants.some((p) => p.attributes?.captions === "on");
  const shouldTranscribe = supported && anyoneWatching && isMicrophoneEnabled;

  // ---- show a caption (mine or someone else's) ----
  const upsert = useCallback((identity: string, name: string, text: string, final: boolean) => {
    setEntries((all) => {
      const prev = all[identity];
      const entry = final
        ? { identity, name, previous: text, current: "", at: Date.now() }
        : { identity, name, previous: prev?.previous ?? "", current: text, at: Date.now() };
      return { ...all, [identity]: entry };
    });
  }, []);

  // ---- receive others' captions ----
  const onMessage = useCallback(
    (msg: { payload: Uint8Array; from?: { identity: string; name?: string } }) => {
      if (!msg.from) return;
      try {
        const { text, final } = JSON.parse(decoder.decode(msg.payload)) as CaptionMsg;
        if (typeof text === "string" && text) upsert(msg.from.identity, msg.from.name || "Someone", text.slice(-500), !!final);
      } catch {
        /* ignore malformed messages */
      }
    },
    [upsert],
  );
  const { send } = useDataChannel("caption", onMessage);

  // ---- my speech → text ----
  const sendRef = useRef(send);
  const addLineRef = useRef(addLine);
  useEffect(() => {
    sendRef.current = send;
    addLineRef.current = addLine;
  }, [send, addLine]);

  useEffect(() => {
    if (!shouldTranscribe) return;
    const SR = getSpeechRecognition()!;
    let stopped = false;
    let rec: SpeechRecognitionLike | null = null;
    let segment = 0;
    let lastInterimSent = 0;
    let restarts: number[] = [];
    const me = { identity: localParticipant.identity, name: localParticipant.name || "You" };

    const share = (text: string, final: boolean) => {
      const payload = encoder.encode(JSON.stringify({ id: segment, text, final } satisfies CaptionMsg));
      sendRef.current(payload, { reliable: final, topic: "caption" }).catch(() => {});
    };

    const start = () => {
      rec = new SR();
      rec.lang = lang;
      rec.continuous = true;
      rec.interimResults = true;
      rec.onresult = (e) => {
        let interim = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i]!;
          const text = r[0].transcript.trim();
          if (!text) continue;
          if (r.isFinal) {
            upsert(me.identity, me.name, text, true);
            share(text, true);
            addLineRef.current({ text, spokenAt: new Date().toISOString() });
            segment++;
          } else interim += (interim ? " " : "") + text;
        }
        if (interim) {
          upsert(me.identity, me.name, interim, false);
          const now = Date.now();
          if (now - lastInterimSent > 250) {
            lastInterimSent = now;
            share(interim, false);
          }
        }
      };
      rec.onerror = (e) => {
        const msg = speechErrorMessage(e.error);
        if (!msg) return; // harmless; onend restarts
        stopped = true;
        toast.error(msg, { id: "captions-error" });
        if (e.error !== "language-not-supported") setEnabled(false);
      };
      rec.onend = () => {
        if (stopped) return;
        // Browsers end recognition every so often; restart, but give up if it keeps failing fast.
        const now = Date.now();
        restarts = [...restarts.filter((t) => now - t < 10_000), now];
        if (restarts.length > 6) {
          toast.error("Captions keep stopping. Check your mic and try again.", { id: "captions-error" });
          return;
        }
        setTimeout(() => !stopped && start(), 300);
      };
      try {
        rec.start();
      } catch {
        /* already started */
      }
    };
    start();

    return () => {
      stopped = true;
      rec?.abort();
    };
  }, [shouldTranscribe, lang, localParticipant, upsert]);

  // ---- fade old captions ----
  useEffect(() => {
    const t = setInterval(() => {
      const now = Date.now();
      setEntries((all) => {
        const kept = Object.values(all).filter((c) => now - c.at < SHOW_FOR_MS);
        return kept.length === Object.keys(all).length ? all : Object.fromEntries(kept.map((c) => [c.identity, c]));
      });
    }, 1000);
    return () => clearInterval(t);
  }, []);

  // ---- my CC switch: tell everyone I'm watching captions ----
  const toggle = useCallback(() => {
    const next = !enabled;
    if (next && !supported)
      toast("Your browser can't turn your speech into captions (use Chrome or Edge). You'll still see others' captions.", {
        id: "captions-unsupported",
      });
    setEnabled(next);
    setMyAttribute(room, "captions", next ? "on" : "").catch(() => {
      setEnabled(!next); // others never heard about it, so undo
      toast.error("Couldn't change captions. Check your connection and try again.", { id: "captions-error" });
    });
  }, [enabled, supported, room]);

  const setLang = useCallback((code: string) => {
    setLangState(code);
    try {
      localStorage.setItem(LANG_KEY, code);
    } catch {
      /* optional */
    }
  }, []);

  const visible = Object.values(entries)
    .sort((a, b) => a.at - b.at)
    .slice(-3);

  return { enabled, toggle, lang, setLang, captions: visible, anyoneWatching, transcribing: shouldTranscribe };
}
