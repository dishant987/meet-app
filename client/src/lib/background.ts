import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import type { LocalVideoTrack } from "livekit-client";
import type { BackgroundProcessorWrapper } from "@livekit/track-processors";

// Background blur runs on this device (MediaPipe in the browser): the video is never sent anywhere to be processed.
// The library and its model only download the first time someone turns blur on.

export type BackgroundMode = "off" | "blur-light" | "blur-strong";
export const BACKGROUND_OPTIONS: { value: BackgroundMode; label: string; hint: string }[] = [
  { value: "off", label: "No effect", hint: "Your camera as it is" },
  { value: "blur-light", label: "Slight blur", hint: "Softens what's behind you" },
  { value: "blur-strong", label: "Strong blur", hint: "Hides what's behind you" },
];
const RADIUS: Record<Exclude<BackgroundMode, "off">, number> = { "blur-light": 6, "blur-strong": 18 };
const KEY = "meetapp-background";

const listeners = new Set<() => void>();
function read(): BackgroundMode {
  try {
    const v = localStorage.getItem(KEY);
    return BACKGROUND_OPTIONS.some((o) => o.value === v) ? (v as BackgroundMode) : "off";
  } catch {
    return "off";
  }
}
let current = read();

/** Remembered across meetings on this device. */
export function setBackground(mode: BackgroundMode) {
  current = mode;
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    /* private mode: this visit only */
  }
  listeners.forEach((l) => l());
}
export const useBackgroundMode = () =>
  useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => current,
  );

const lib = () => import("@livekit/track-processors");

/** null while checking; false on browsers that can't do it (then the option isn't offered). */
export function useBackgroundSupported() {
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    lib()
      .then((m) => alive && setOk(m.supportsBackgroundProcessors()))
      .catch(() => alive && setOk(false));
    return () => {
      alive = false;
    };
  }, []);
  return ok;
}

/** Applies the chosen effect to a camera track (preview or call), and follows changes to the choice. */
export function useBackgroundEffect(track: LocalVideoTrack | undefined) {
  const mode = useBackgroundMode();
  const processor = useRef<{ track: LocalVideoTrack; p: BackgroundProcessorWrapper } | null>(null);

  useEffect(() => {
    if (!track) return;
    let cancelled = false;
    (async () => {
      try {
        const mine = processor.current?.track === track && track.getProcessor() === processor.current.p;
        if (mode === "off") {
          if (track.getProcessor()) await track.stopProcessor();
          processor.current = null;
          return;
        }
        const options = { mode: "background-blur" as const, blurRadius: RADIUS[mode] };
        if (mine) return void (await processor.current!.p.switchTo(options)); // change strength without a flicker
        const m = await lib();
        if (cancelled || !m.supportsBackgroundProcessors()) return;
        const p = m.BackgroundProcessor(options);
        await track.setProcessor(p);
        processor.current = { track, p };
      } catch {
        if (cancelled) return;
        toast.error("Couldn't blur your background on this device. Your camera works as normal.");
        setBackground("off");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [track, mode]);
}
