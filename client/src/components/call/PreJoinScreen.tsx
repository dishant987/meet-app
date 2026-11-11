import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useBackgroundEffect } from "@/lib/background";
import { BackgroundPicker } from "./BackgroundPicker";
import { check, displayNameForm } from "@/lib/validation";
import { MediaDeviceFailure, Track, type LocalAudioTrack, type LocalVideoTrack } from "livekit-client";
import { useMediaDevices, usePreviewTracks, type LocalUserChoices } from "@livekit/components-react";
import { useAudioLevel } from "@/lib/audioLevel";
import { ArrowRight, Camera, Loader2, Mic, MicOff, Video, VideoOff } from "lucide-react";
import { cn } from "cn";
import { TooltipProvider } from "@/components/ui/tooltip";
import { deviceErrorToast } from "@/lib/deviceErrors";
import { useAuth } from "@/lib/auth";
import { assetUrl, type Meeting } from "@/lib/api";
import { Avatar } from "./Avatar";
import { DockButton } from "./DockButton";

const STORAGE_KEY = "meetapp-prejoin";
const DEFAULTS: LocalUserChoices = { username: "", videoEnabled: true, audioEnabled: true, videoDeviceId: "", audioDeviceId: "" };

function loadChoices(): LocalUserChoices {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") };
  } catch {
    return DEFAULTS;
  }
}
function saveChoices(c: LocalUserChoices) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
  } catch {
    /* private mode etc. — remembering is optional */
  }
}

/** Live input level so people can check their mic before joining. */
function MicMeter({ track }: { track?: LocalAudioTrack }) {
  const level = useAudioLevel(track?.mediaStreamTrack);
  return (
    <div className="flex items-center gap-2 rounded-xl bg-ink-950/60 px-2.5 py-1.5 backdrop-blur" aria-hidden>
      <Mic className="size-3.5 text-ink-300" />
      <div className="flex h-3 items-end gap-[2px]">
        {Array.from({ length: 10 }, (_, i) => (
          <span
            key={i}
            className={cn("w-1 rounded-full transition-colors duration-75", level * 10 > i ? "bg-brand" : "bg-white/15")}
            style={{ height: `${5 + i * 0.7}px` }}
          />
        ))}
      </div>
    </div>
  );
}

function DeviceSelect({
  kind,
  value,
  onChange,
  disabled,
}: {
  kind: "audioinput" | "videoinput";
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const devices = useMediaDevices({ kind });
  const Icon = kind === "audioinput" ? Mic : Camera;
  const label = kind === "audioinput" ? "Microphone" : "Camera";
  return (
    <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-ink-900 px-3 focus-within:border-brand/60">
      <Icon className="size-4 shrink-0 text-ink-300" aria-hidden />
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled || devices.length === 0}
        className="h-11 min-w-0 flex-1 truncate bg-transparent text-sm text-white focus:outline-none disabled:text-ink-500 [&>option]:bg-ink-900"
      >
        {devices.length === 0 && <option value="">No {label.toLowerCase()} found</option>}
        {devices.map((d, i) => (
          <option key={d.deviceId || i} value={d.deviceId}>
            {d.label || `${label} ${i + 1}`}
          </option>
        ))}
      </select>
    </label>
  );
}

type Props = { meeting: Meeting; joining: boolean; onJoin: (choices: LocalUserChoices) => void };

export function PreJoinScreen({ meeting, joining, onJoin }: Props) {
  const { user } = useAuth();
  // Signed in → always start with the profile name (still editable). Guests get the name they used last time.
  const [choices, setChoices] = useState(() => {
    const c = loadChoices();
    return user ? { ...c, username: user.name } : c;
  });
  const [nameError, setNameError] = useState("");
  const set = (patch: Partial<LocalUserChoices>) => setChoices((c) => ({ ...c, ...patch }));

  const options = useMemo(
    () => ({
      audio: choices.audioEnabled ? { deviceId: choices.audioDeviceId || undefined } : false,
      video: choices.videoEnabled ? { deviceId: choices.videoDeviceId || undefined } : false,
    }),
    [choices.audioEnabled, choices.audioDeviceId, choices.videoEnabled, choices.videoDeviceId],
  );
  const [deviceError, setDeviceError] = useState<MediaDeviceFailure | "other" | null>(null);
  // Must be stable: usePreviewTracks restarts the camera and mic whenever this function changes.
  const onDeviceError = useCallback((err: Error) => {
    setDeviceError(MediaDeviceFailure.getFailure(err) ?? "other");
    deviceErrorToast(err);
  }, []);
  const tracks = usePreviewTracks(options, onDeviceError);
  const videoTrack = tracks?.find((t) => t.kind === Track.Kind.Video) as LocalVideoTrack | undefined;
  const audioTrack = tracks?.find((t) => t.kind === Track.Kind.Audio) as LocalAudioTrack | undefined;

  useBackgroundEffect(videoTrack); // preview shows the blur before joining
  const videoEl = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (!videoTrack || !videoEl.current) return;
    videoTrack.attach(videoEl.current);
    return () => {
      videoTrack.detach();
    };
  }, [videoTrack]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const result = check(displayNameForm, { name: choices.username });
    if (result.errors) return setNameError(result.errors.name!);
    const username = result.data.name;
    const final = { ...choices, username };
    saveChoices(final);
    onJoin(final);
  }

  const showVideo = choices.videoEnabled && !!videoTrack;

  return (
    <TooltipProvider delayDuration={400}>
      <main className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[1.5fr_1fr] lg:gap-10">
        {/* preview */}
        <section aria-label="Camera preview" className="relative aspect-[4/3] overflow-hidden rounded-3xl border border-white/[0.08] bg-ink-900 sm:aspect-video">
          <video
            ref={videoEl}
            muted
            playsInline
            className={cn("h-full w-full -scale-x-100 object-cover", !showVideo && "hidden")}
          />
          {!showVideo && (
            <div className="flex h-full flex-col items-center justify-center gap-3 bg-[radial-gradient(circle_at_50%_40%,rgb(255_255_255/0.05),transparent_65%)]">
              <Avatar name={choices.username || "?"} src={user ? assetUrl(user.avatarUrl) : undefined} />
              <p className="px-4 text-center text-sm text-ink-300">
                {!choices.videoEnabled
                  ? "Camera is off"
                  : deviceError === MediaDeviceFailure.PermissionDenied
                    ? "Camera is blocked. Allow it in your browser's address bar."
                    : deviceError
                      ? "Camera unavailable. You can still join."
                      : "Starting camera…"}
              </p>
            </div>
          )}
          <span className="absolute top-3 left-3 rounded-lg bg-ink-950/60 px-2 py-1 text-xs font-medium text-ink-300 backdrop-blur">
            Preview · only you see this
          </span>
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-ink-950/80 to-transparent p-3">
            {choices.audioEnabled ? <MicMeter track={audioTrack} /> : <span />}
            <div className="flex gap-2">
              <DockButton
                label={choices.audioEnabled ? "Turn microphone off" : "Turn microphone on"}
                tone={choices.audioEnabled ? "default" : "off"}
                onClick={() => set({ audioEnabled: !choices.audioEnabled })}
                className="backdrop-blur"
              >
                {choices.audioEnabled ? <Mic /> : <MicOff />}
              </DockButton>
              <DockButton
                label={choices.videoEnabled ? "Turn camera off" : "Turn camera on"}
                tone={choices.videoEnabled ? "default" : "off"}
                onClick={() => set({ videoEnabled: !choices.videoEnabled })}
                className="backdrop-blur"
              >
                {choices.videoEnabled ? <Video /> : <VideoOff />}
              </DockButton>
              {choices.videoEnabled && <BackgroundPicker className="backdrop-blur" />}
            </div>
          </div>
        </section>

        {/* details */}
        <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
          <div>
            <p className="mb-2 flex items-center gap-2 text-xs font-medium tracking-wider text-brand uppercase">
              <span className="size-1.5 rounded-full bg-brand" aria-hidden /> Ready to join
            </p>
            <h1 className="text-2xl font-semibold tracking-tight text-balance text-white sm:text-3xl">{meeting.title}</h1>
            <p className="mt-1 font-mono text-sm text-ink-500">{meeting.roomCode}</p>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="display-name" className="text-sm font-medium text-ink-300">
              Your name
            </label>
            <input
              id="display-name"
              autoFocus
              autoComplete="name"
              maxLength={50}
              placeholder="How should others see you?"
              value={choices.username}
              aria-invalid={!!nameError}
              aria-describedby={nameError ? "name-error" : undefined}
              onChange={(e) => {
                set({ username: e.target.value });
                setNameError("");
              }}
              className="h-12 w-full rounded-2xl border border-white/10 bg-ink-900 px-4 text-white placeholder:text-ink-500 focus-visible:border-brand/60 focus-visible:outline-none aria-invalid:border-red-400/60"
            />
            {nameError && (
              <p id="name-error" role="alert" className="text-sm text-red-300">
                {nameError}
              </p>
            )}
          </div>

          <div className="grid gap-2">
            <DeviceSelect
              kind="audioinput"
              value={choices.audioDeviceId}
              onChange={(audioDeviceId) => set({ audioDeviceId })}
              disabled={!choices.audioEnabled}
            />
            <DeviceSelect
              kind="videoinput"
              value={choices.videoDeviceId}
              onChange={(videoDeviceId) => set({ videoDeviceId })}
              disabled={!choices.videoEnabled}
            />
          </div>

          <button
            type="submit"
            disabled={joining}
            className="group flex h-13 items-center justify-center gap-2 rounded-2xl bg-brand px-6 py-3.5 text-base font-semibold text-ink-950 transition hover:brightness-95 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-ink-950 focus-visible:outline-none active:scale-[0.98] disabled:opacity-60"
          >
            {joining ? <Loader2 className="size-5 animate-spin" /> : null}
            {joining ? "Joining…" : "Join meeting"}
            {!joining && <ArrowRight className="size-5 transition-transform group-hover:translate-x-0.5" />}
          </button>
          <p className="text-center text-xs text-ink-500">You can change your mic and camera any time during the call.</p>
        </form>
      </main>
    </TooltipProvider>
  );
}
