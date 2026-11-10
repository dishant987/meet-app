import { Hand, MicOff, Pin, PinOff } from "lucide-react";
import { Track, type Participant } from "livekit-client";
import {
  VideoTrack,
  isTrackReference,
  useIsMuted,
  useIsSpeaking,
  useParticipantAttributes,
  useTrackVolume,
  type TrackReferenceOrPlaceholder,
} from "@livekit/components-react";
import { cn } from "cn";
import { Avatar } from "./Avatar";

export const displayName = (p: Participant) => p.name || p.identity;

/** Small live waveform next to the name; bars follow the voice volume. */
function Waveform({ participant }: { participant: Participant }) {
  const level = useVoiceLevel(participant);
  return (
    <span className="flex h-3.5 items-center gap-[2px]" aria-hidden>
      {[0.5, 0.9, 1, 0.7, 0.4].map((w, i) => (
        <span
          key={i}
          className="w-[2.5px] rounded-full bg-brand transition-[height] duration-75"
          style={{ height: `${Math.max(3, level * w * 14)}px` }}
        />
      ))}
    </span>
  );
}

/** 0..1 loudness of a participant's mic, updated every frame. */
function useVoiceLevel(participant: Participant) {
  const mic = participant.getTrackPublication(Track.Source.Microphone);
  const volume = useTrackVolume(mic ? { participant, publication: mic, source: Track.Source.Microphone } : undefined);
  return Math.min(1, volume * 5);
}

/** Rings behind the avatar that grow and fade with the voice: louder = bigger. */
function VoiceRings({ participant, compact }: { participant: Participant; compact?: boolean }) {
  const level = useVoiceLevel(participant);
  const base = compact ? "size-14 rounded-2xl" : "size-20 rounded-[1.75rem] sm:size-28 sm:rounded-[2.25rem]";
  return (
    <>
      {[0.35, 0.7, 1.05].map((grow, i) => (
        <span
          key={i}
          aria-hidden
          className={cn("absolute bg-brand transition-[transform,opacity] duration-100 ease-out", base)}
          style={{ transform: `scale(${1 + level * grow})`, opacity: level > 0.04 ? 0.32 - i * 0.09 : 0 }}
        />
      ))}
    </>
  );
}

/** Thin lime border while speaking; it gets a little brighter with louder voice. No glow over the video. */
function SpeakingBorder({ participant }: { participant: Participant }) {
  const level = useVoiceLevel(participant);
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-0 rounded-[inherit] border-2 border-brand transition-opacity duration-150"
      style={{ opacity: 0.55 + level * 0.45 }}
    />
  );
}

type Props = {
  trackRef: TrackReferenceOrPlaceholder;
  pinned?: boolean;
  onTogglePin?: () => void;
  compact?: boolean;
};

export function ParticipantTile({ trackRef, pinned, onTogglePin, compact }: Props) {
  const { participant, source } = trackRef;
  const name = displayName(participant);
  const isScreen = source === Track.Source.ScreenShare;
  const speaking = useIsSpeaking(participant) && !isScreen;
  const micMuted = useIsMuted({ participant, source: Track.Source.Microphone });
  const { attributes } = useParticipantAttributes({ participant });
  const handUp = attributes?.hand === "up";
  const hasVideo = isTrackReference(trackRef) && !trackRef.publication.isMuted;

  return (
    <div
      className={cn(
        "group relative h-full w-full overflow-hidden bg-ink-900 shadow-[0_0_0_1px_rgb(255_255_255/0.06)]",
        compact ? "rounded-2xl" : "rounded-3xl",
      )}
    >
      {hasVideo ? (
        <VideoTrack
          trackRef={trackRef}
          className={cn(
            "h-full w-full",
            isScreen ? "bg-black object-contain" : "object-cover",
            participant.isLocal && !isScreen && "-scale-x-100", // mirror yourself
          )}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_50%_40%,rgb(255_255_255/0.05),transparent_65%)]">
          <div className="relative flex items-center justify-center">
            {!micMuted && <VoiceRings participant={participant} compact={compact} />}
            <div className="relative">
              <Avatar name={name} size={compact ? "md" : "lg"} />
            </div>
          </div>
        </div>
      )}
      {speaking && <SpeakingBorder participant={participant} />}

      {handUp && (
        <div className="animate-pop-in absolute top-3 left-3 flex items-center gap-1.5 rounded-xl bg-amber-300 px-2.5 py-1 text-xs font-semibold text-ink-950 shadow-lg">
          <Hand className="animate-hand size-3.5" aria-hidden /> Hand raised
        </div>
      )}

      {onTogglePin && (
        <button
          type="button"
          onClick={onTogglePin}
          aria-label={pinned ? `Unpin ${name}` : `Pin ${name}`}
          className="absolute top-3 right-3 flex size-9 items-center justify-center rounded-xl bg-ink-950/60 text-white opacity-0 backdrop-blur transition-opacity group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
        >
          {pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
        </button>
      )}

      {/* name label: mic state + name, glass pill */}
      <div
        className={cn(
          "absolute bottom-2.5 left-2.5 flex max-w-[85%] items-center gap-2 rounded-xl bg-ink-950/60 py-1 pr-2.5 pl-2 text-xs text-white backdrop-blur-md sm:text-sm",
          compact && "bottom-1.5 left-1.5 text-xs",
        )}
      >
        {isScreen ? null : micMuted ? (
          <MicOff className="size-3.5 shrink-0 text-red-300" aria-label="Microphone off" />
        ) : speaking ? (
          <Waveform participant={participant} />
        ) : (
          <span className="size-1.5 shrink-0 rounded-full bg-ink-300" aria-hidden />
        )}
        <span className="truncate">
          {isScreen ? `${name} is presenting` : name}
          {participant.isLocal && !isScreen && <span className="text-ink-300"> · you</span>}
        </span>
      </div>
    </div>
  );
}
