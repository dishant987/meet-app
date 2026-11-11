import { useEffect, useState } from "react";
import { Track, type Room } from "livekit-client";
import { useLocalParticipant, useParticipantAttributes, useRoomContext, useTrackToggle } from "@livekit/components-react";
import { Captions, Disc, Hand, Loader2, LogOut, Square, MessageCircle, Mic, MicOff, ScreenShare, SmilePlus, Users, Video, VideoOff } from "lucide-react";
import { cn } from "cn";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { deviceErrorToast } from "@/lib/deviceErrors";
import { getHostKey } from "@/lib/meetingAccess";
import { setMyAttribute } from "@/lib/attributes";
import { canRecord, startRecording, stopRecording, useRecorderState } from "@/lib/recorder";
import { errorMessage, meetingsApi } from "@/lib/api";
import { REACTION_EMOJIS } from "./Reactions";
import { DockButton } from "./DockButton";

export type Panel = "people" | "chat" | null;

// Module-level so it's stable between renders. NotAllowedError = the user cancelled the screen picker.
const screenShareError = (e: Error) => {
  if (e.name !== "NotAllowedError") deviceErrorToast(e);
};

/** Time since you joined, e.g. 04:12 or 1:02:09. */
function Elapsed() {
  const [start] = useState(() => Date.now());
  const [now, setNow] = useState(start);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const s = Math.floor((now - start) / 1000);
  const hh = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return <span className="font-mono tabular-nums">{hh ? `${hh}:${mm}:${ss}` : `${mm}:${ss}`}</span>;
}

const Divider = () => <span className="mx-0.5 hidden h-6 w-px bg-white/10 sm:block" aria-hidden />;

type Props = {
  title: string;
  roomCode: string;
  panel: Panel;
  setPanel: (p: Panel) => void;
  unreadChat: number;
  participantCount: number;
  onReact: (emoji: string) => void;
  captionsOn: boolean;
  onToggleCaptions: () => void;
  isHost: boolean;
  /** Host only: people asking to join. */
  waitingCount?: number;
};

export function ControlBar({ title, roomCode, panel, setPanel, unreadChat, participantCount, onReact, captionsOn, onToggleCaptions, isHost, waitingCount = 0 }: Props) {
  const room = useRoomContext();
  const hostKey = getHostKey(roomCode);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [ending, setEnding] = useState(false);
  async function endForEveryone() {
    setEnding(true);
    stopRecording(); // upload starts now; it keeps going after the call closes
    try {
      await meetingsApi.end(roomCode, hostKey); // hostKey or the signed-in session; server closes the room
    } catch (err) {
      toast.error(errorMessage(err));
      setEnding(false);
    }
  }
  const { localParticipant } = useLocalParticipant();
  const { attributes } = useParticipantAttributes({ participant: localParticipant });
  const handUp = attributes?.hand === "up";
  const [reactionsOpen, setReactionsOpen] = useState(false);

  const mic = useTrackToggle({ source: Track.Source.Microphone, onDeviceError: deviceErrorToast });
  const cam = useTrackToggle({ source: Track.Source.Camera, onDeviceError: deviceErrorToast });
  const screen = useTrackToggle({
    source: Track.Source.ScreenShare,
    captureOptions: { audio: true, selfBrowserSurface: "exclude" },
    onDeviceError: screenShareError,
  });
  const canShareScreen = typeof navigator.mediaDevices?.getDisplayMedia === "function";
  const toggleHand = () =>
    setMyAttribute(room, "hand", handUp ? "" : "up").catch(() =>
      toast.error("Couldn't raise your hand. Check your connection and try again."),
    );

  // Ctrl/⌘+D mic, Ctrl/⌘+E camera.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === "d" || key === "e") {
        e.preventDefault();
        (key === "d" ? mic : cam).toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mic, cam]);

  const togglePanel = (p: Exclude<Panel, null>) => setPanel(panel === p ? null : p);

  return (
    <div className="flex items-center gap-2 px-2 pt-1 sm:gap-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-4">
      {/* left: meeting info (desktop) */}
      <div className="hidden min-w-0 flex-1 lg:block">
        <p className="truncate text-sm font-medium text-white">{title}</p>
        <p className="flex items-center gap-2 text-xs text-ink-300">
          <span className="flex items-center gap-1.5">
            <span className="size-1.5 animate-pulse rounded-full bg-brand" aria-hidden /> Live
          </span>
          <Elapsed />
          <span className="font-mono text-ink-500">{roomCode}</span>
        </p>
      </div>

      {/* center dock */}
      <div className="mx-auto flex min-w-0 items-center gap-1 rounded-[1.4rem] border border-white/[0.08] bg-ink-900/80 p-1.5 shadow-2xl shadow-black/40 backdrop-blur-xl sm:gap-2 sm:p-2">
        <DockButton
          label={mic.enabled ? "Mute microphone" : "Unmute microphone"}
          shortcut="Ctrl+D"
          tone={mic.enabled ? "default" : "off"}
          disabled={mic.pending}
          onClick={() => mic.toggle()}
        >
          {mic.enabled ? <Mic /> : <MicOff />}
        </DockButton>
        <DockButton
          label={cam.enabled ? "Turn camera off" : "Turn camera on"}
          shortcut="Ctrl+E"
          tone={cam.enabled ? "default" : "off"}
          disabled={cam.pending}
          onClick={() => cam.toggle()}
        >
          {cam.enabled ? <Video /> : <VideoOff />}
        </DockButton>

        <DockButton label={captionsOn ? "Turn off captions" : "Turn on captions"} tone={captionsOn ? "on" : "default"} onClick={onToggleCaptions}>
          <Captions />
        </DockButton>

        <Divider />

        <Popover open={reactionsOpen} onOpenChange={setReactionsOpen}>
          <PopoverTrigger asChild>
            <DockButton label="Send a reaction" tone={reactionsOpen ? "on" : "default"}>
              <SmilePlus />
            </DockButton>
          </PopoverTrigger>
          <PopoverContent
            side="top"
            sideOffset={12}
            className="w-auto max-w-[calc(100vw-1rem)] rounded-2xl border-white/10 bg-ink-900/95 p-1.5 backdrop-blur-xl"
          >
            <div className="grid grid-cols-5 gap-1 sm:flex">
              {REACTION_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  aria-label={`React ${emoji}`}
                  onClick={() => onReact(emoji)}
                  className="flex size-11 items-center justify-center rounded-xl text-2xl transition-transform hover:-translate-y-1 hover:scale-125 hover:bg-white/[0.08] focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none active:scale-95"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        <DockButton label={handUp ? "Lower hand" : "Raise hand"} tone={handUp ? "on" : "default"} onClick={toggleHand}>
          <Hand />
        </DockButton>

        {canShareScreen && (
          <DockButton
            label={screen.enabled ? "Stop sharing" : "Share screen"}
            tone={screen.enabled ? "on" : "default"}
            disabled={screen.pending}
            onClick={() => screen.toggle()}
            className="hidden sm:flex"
          >
            <ScreenShare />
          </DockButton>
        )}

        {isHost && canRecord() && <RecordButton room={room} roomCode={roomCode} hostKey={hostKey} title={title} />}

        <Divider />

        {isHost ? (
          <Popover open={leaveOpen} onOpenChange={setLeaveOpen}>
            <PopoverTrigger asChild>
              <DockButton label="Leave or end the meeting" tone="danger" text="Leave">
                <LogOut />
              </DockButton>
            </PopoverTrigger>
            <PopoverContent side="top" align="end" sideOffset={12} className="w-72 rounded-2xl border-white/10 bg-ink-900/95 p-2 text-white backdrop-blur-xl">
              <button
                type="button"
                onClick={() => room.disconnect()}
                className="flex w-full flex-col items-start rounded-xl px-3 py-2.5 text-left hover:bg-white/[0.06] focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
              >
                <span className="text-sm font-medium">Leave call</span>
                <span className="text-xs text-ink-300">Others can keep talking</span>
              </button>
              <button
                type="button"
                disabled={ending}
                onClick={endForEveryone}
                className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-red-500/15 focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:outline-none disabled:opacity-60"
              >
                <span className="flex flex-col">
                  <span className="flex items-center gap-2 text-sm font-medium text-red-300">
                    {ending && <Loader2 className="size-3.5 animate-spin" />} End meeting for everyone
                  </span>
                  <span className="text-xs text-ink-300">Closes the call and starts writing the AI notes</span>
                </span>
              </button>
            </PopoverContent>
          </Popover>
        ) : (
          <DockButton label="Leave call" tone="danger" text="Leave" onClick={() => room.disconnect()}>
            <LogOut />
          </DockButton>
        )}
      </div>

      {/* right: panels */}
      <div className="flex items-center justify-end gap-1 lg:flex-1">
        {/* Phones have no room for a separate Chat button: this one opens chat when there are new messages,
            and the panel's tabs switch between People and Chat. */}
        <DockButton
          label={`People (${participantCount})${waitingCount ? `, ${waitingCount} waiting to join` : ""}${unreadChat ? `, ${unreadChat} new messages` : ""}`}
          tone={panel === "people" ? "on" : "ghost"}
          aria-pressed={panel === "people"}
          onClick={() =>
            waitingCount === 0 && unreadChat > 0 && matchMedia("(max-width: 639px)").matches ? setPanel("chat") : togglePanel("people")
          }
          badge={
            waitingCount > 0 ? (
              // someone is knocking: amber, pulsing, shows how many
              <span className="absolute -top-1 -right-1 min-w-5 animate-pulse rounded-lg bg-amber-300 px-1 text-[11px] leading-5 font-semibold text-ink-950">
                {waitingCount}
              </span>
            ) : (
              <span
                className={cn(
                  "absolute -top-1 -right-1 min-w-5 rounded-lg px-1 text-[11px] leading-5 font-semibold",
                  unreadChat > 0 ? "bg-brand text-ink-950 sm:bg-ink-700 sm:text-white" : "bg-ink-700 text-white",
                )}
              >
                {participantCount}
              </span>
            )
          }
        >
          <Users />
        </DockButton>
        <DockButton
          label={unreadChat ? `Chat (${unreadChat} new)` : "Chat"}
          tone={panel === "chat" ? "on" : "ghost"}
          aria-pressed={panel === "chat"}
          className="hidden sm:flex"
          onClick={() => togglePanel("chat")}
          badge={
            unreadChat > 0 && (
              <span className="absolute -top-1 -right-1 min-w-5 rounded-lg bg-brand px-1 text-[11px] leading-5 font-semibold text-ink-950">
                {unreadChat}
              </span>
            )
          }
        >
          <MessageCircle />
        </DockButton>
      </div>
    </div>
  );
}

/** Host-only: record this tab + mic. Red with a timer while recording; shows upload progress after. */
function RecordButton({ room, roomCode, hostKey, title }: { room: Room; roomCode: string; hostKey?: string; title: string }) {
  const rec = useRecorderState();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (rec.phase !== "recording") return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [rec.phase]);

  async function start() {
    try {
      const mic = room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track?.mediaStreamTrack;
      await startRecording({
        roomCode,
        hostKey,
        title,
        mic,
        onStop: () => void setMyAttribute(room, "recording", "").catch(() => {}),
      });
      await setMyAttribute(room, "recording", "on"); // everyone sees "Recording"
    } catch (err) {
      if ((err as Error).name !== "NotAllowedError") toast.error("Couldn't start recording. Try again in Chrome or Edge.");
      // NotAllowedError = the person closed the "share this tab" picker
    }
  }

  if (rec.phase === "uploading")
    return (
      <DockButton label={`Uploading recording, ${Math.round(rec.progress * 100)}%`} disabled className="hidden sm:flex">
        <Loader2 className="animate-spin" />
        <span className="hidden text-xs tabular-nums sm:inline">{Math.round(rec.progress * 100)}%</span>
      </DockButton>
    );
  if (rec.phase === "recording") {
    const s = Math.floor((now - rec.startedAt) / 1000);
    return (
      <DockButton label="Stop recording" tone="danger" onClick={stopRecording} className="hidden sm:flex">
        <Square className="fill-current" />
        <span className="hidden font-mono text-xs tabular-nums sm:inline">
          {String(Math.floor(s / 60)).padStart(2, "0")}:{String(s % 60).padStart(2, "0")}
        </span>
      </DockButton>
    );
  }
  return (
    <DockButton label="Record meeting" onClick={start} className="hidden sm:flex">
      <Disc />
    </DockButton>
  );
}
