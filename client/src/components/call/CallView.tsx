import { useEffect, useMemo, useRef, useState } from "react";
import { ConnectionState, RoomEvent, Track, type Participant } from "livekit-client";
import {
  RoomAudioRenderer,
  StartAudio,
  isTrackReference,
  useChat,
  useConnectionState,
  useParticipants,
  useRoomContext,
  useTracks,
  type TrackReferenceOrPlaceholder,
} from "@livekit/components-react";
import { Captions as CaptionsIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ParticipantTile, displayName } from "./ParticipantTile";
import { ControlBar, type Panel } from "./ControlBar";
import { SidePanel } from "./SidePanel";
import { FloatingReactions, useReactions } from "./Reactions";
import { useCaptions } from "./useCaptions";
import { CaptionsOverlay, LanguagePicker } from "./CaptionsOverlay";
import { stopRecording } from "@/lib/recorder";

const keyOf = (t: TrackReferenceOrPlaceholder) => `${t.participant.identity}:${t.source}`;

/** Grid columns by number of tiles; phones get fewer columns. */
function gridClass(n: number) {
  if (n <= 1) return "grid-cols-1";
  if (n === 2) return "grid-cols-1 sm:grid-cols-2";
  if (n <= 4) return "grid-cols-2";
  if (n <= 6) return "grid-cols-2 lg:grid-cols-3";
  if (n <= 9) return "grid-cols-2 sm:grid-cols-3";
  return "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 auto-rows-[minmax(140px,1fr)] overflow-y-auto";
}

/** Toasts for people joining/leaving, raised hands and new chat messages. */
function useRoomNotifications(chatOpen: boolean, messages: { id: string; message: string; from?: Participant }[]) {
  const room = useRoomContext();
  useEffect(() => {
    const joined = (p: Participant) => toast(`${displayName(p)} joined`);
    const left = (p: Participant) => toast(`${displayName(p)} left`);
    const attrs = (changed: Record<string, string>, p: Participant) => {
      if (!p.isLocal && changed.hand === "up") toast(`✋ ${displayName(p)} raised a hand`);
    };
    room.on(RoomEvent.ParticipantConnected, joined).on(RoomEvent.ParticipantDisconnected, left).on(RoomEvent.ParticipantAttributesChanged, attrs);
    return () => {
      room.off(RoomEvent.ParticipantConnected, joined).off(RoomEvent.ParticipantDisconnected, left).off(RoomEvent.ParticipantAttributesChanged, attrs);
    };
  }, [room]);

  const seen = useRef(messages.length);
  useEffect(() => {
    const fresh = messages.slice(seen.current);
    seen.current = messages.length;
    if (chatOpen) return;
    for (const m of fresh) {
      if (m.from?.isLocal) continue;
      toast(`${m.from ? displayName(m.from) : "Someone"}: ${m.message.slice(0, 80)}`);
    }
  }, [messages, chatOpen]);
}

export function CallView({
  roomCode,
  title,
  participantId,
  isHost,
}: {
  roomCode: string;
  title: string;
  participantId: string;
  isHost: boolean;
}) {
  // Leaving the call (or the meeting ending) stops a running recording so it uploads.
  useEffect(() => () => stopRecording(), []);
  const connection = useConnectionState();
  const participants = useParticipants();
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );
  const { chatMessages, send, isSending } = useChat();
  const { floating, react } = useReactions();
  const captions = useCaptions(roomCode, participantId);
  const recording = participants.some((p) => p.attributes?.recording === "on");
  const [panel, setPanelState] = useState<Panel>(null);
  const [pinned, setPinned] = useState<string | null>(null);

  // Unread chat badge: messages from others that arrived after the chat panel was last open.
  const [readCount, setReadCount] = useState(0);
  const setPanel = (p: Panel) => {
    if (panel === "chat" || p === "chat") setReadCount(chatMessages.length);
    setPanelState(p);
  };
  const unread = panel === "chat" ? 0 : chatMessages.slice(readCount).filter((m) => !m.from?.isLocal).length;

  useRoomNotifications(panel === "chat", chatMessages);

  // Focus: a pinned tile (ignored once that person leaves), otherwise anyone presenting their screen.
  const focus = useMemo(() => {
    const pinnedTrack = pinned ? tracks.find((t) => keyOf(t) === pinned) : undefined;
    return pinnedTrack ?? tracks.find((t) => t.source === Track.Source.ScreenShare && isTrackReference(t));
  }, [tracks, pinned]);

  const others = focus ? tracks.filter((t) => keyOf(t) !== keyOf(focus)) : tracks;
  const pinToggle = (t: TrackReferenceOrPlaceholder) => () => setPinned((p) => (p === keyOf(t) ? null : keyOf(t)));

  return (
    <TooltipProvider delayDuration={400}>
      <div className="dark flex h-dvh flex-col bg-ink-950 bg-[radial-gradient(ellipse_at_top,oklch(0.9_0.19_125/0.05),transparent_55%)] text-white">
        {connection === ConnectionState.Reconnecting && (
          <div role="status" className="flex items-center justify-center gap-2 bg-amber-300 px-3 py-1.5 text-sm font-medium text-ink-950">
            <Loader2 className="size-4 animate-spin" /> Connection lost. Reconnecting…
          </div>
        )}

        <div className="relative flex min-h-0 flex-1 p-2 sm:p-3">
          <main className="relative min-h-0 min-w-0 flex-1" aria-label="Meeting">
            {focus ? (
              <div className="flex h-full flex-col gap-3 md:flex-row">
                <div className="min-h-0 flex-1">
                  <ParticipantTile trackRef={focus} pinned={pinned === keyOf(focus)} onTogglePin={pinToggle(focus)} />
                </div>
                {others.length > 0 && (
                  <div className="flex h-28 shrink-0 gap-3 overflow-x-auto md:h-auto md:w-56 md:flex-col md:overflow-x-visible md:overflow-y-auto">
                    {others.map((t) => (
                      <div key={keyOf(t)} className="aspect-video h-full shrink-0 md:h-auto md:w-full">
                        <ParticipantTile trackRef={t} compact pinned={false} onTogglePin={pinToggle(t)} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className={cn("grid h-full auto-rows-fr gap-3", gridClass(others.length))}>
                {others.map((t) => (
                  <ParticipantTile key={keyOf(t)} trackRef={t} onTogglePin={others.length > 1 ? pinToggle(t) : undefined} />
                ))}
              </div>
            )}
            <FloatingReactions items={floating} />
            {/* Everyone sees this while speech is being turned into text (consent). */}
            {/* Everyone sees when the meeting is being recorded (consent). */}
            {recording && (
              <div className="pointer-events-none absolute top-3 left-3 z-10 flex items-center gap-1.5 rounded-xl bg-red-500/90 px-2.5 py-1 text-xs font-semibold text-white">
                <span className="size-2 animate-pulse rounded-full bg-white" aria-hidden /> Recording
              </div>
            )}
            {captions.anyoneWatching && (
              <div className="absolute top-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2">
                <div className="flex items-center gap-1.5 rounded-xl bg-ink-950/70 px-2.5 py-1 text-xs font-medium whitespace-nowrap text-white backdrop-blur">
                  <CaptionsIcon className="size-3.5 text-brand" aria-hidden /> Captions on
                  <span className="hidden text-ink-300 sm:inline">· speech is being transcribed</span>
                </div>
                {captions.enabled && <LanguagePicker lang={captions.lang} setLang={captions.setLang} />}
              </div>
            )}
            {captions.enabled && <CaptionsOverlay captions={captions.captions} />}
          </main>

          {panel && (
            <SidePanel
              panel={panel}
              setPanel={setPanel}
              unreadChat={unread}
              participants={participants}
              chat={{ messages: chatMessages, send, isSending }}
            />
          )}
        </div>

        <ControlBar
          title={title}
          roomCode={roomCode}
          isHost={isHost}
          panel={panel}
          setPanel={setPanel}
          unreadChat={unread}
          participantCount={participants.length}
          onReact={react}
          captionsOn={captions.enabled}
          onToggleCaptions={captions.toggle}
        />

        <RoomAudioRenderer />
        {/* Browsers block sound until the user clicks once; this button appears only when needed. */}
        <StartAudio
          label="Click to turn on sound"
          className="fixed top-4 left-1/2 z-30 -translate-x-1/2 rounded-2xl bg-brand px-4 py-2 text-sm font-semibold text-ink-950 shadow-lg"
        />
      </div>
    </TooltipProvider>
  );
}
