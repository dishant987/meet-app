import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { Loader2, NotebookPen, RotateCcw } from "lucide-react";
import { LiveKitRoom, type LocalUserChoices } from "@livekit/components-react";
import { DisconnectReason, MediaDeviceFailure } from "livekit-client";
import { ApiError, assetUrl, errorMessage, meetingsApi, type JoinData, type JoinWaiting, type Meeting } from "@/lib/api";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { RoomHeader } from "@/components/RoomHeader";
import { deviceToast } from "@/lib/deviceErrors";
import { getHostKey, saveParticipantId } from "@/lib/meetingAccess";
import { CallView } from "@/components/call/CallView";
import { PreJoinScreen } from "@/components/call/PreJoinScreen";
import { WaitingScreen } from "@/components/call/WaitingScreen";
import { useRecorderState } from "@/lib/recorder";
import { useAuth } from "@/lib/auth";

type Stage =
  | { name: "loading" }
  | { name: "error"; title: string; message: string }
  | { name: "prejoin"; meeting: Meeting }
  | { name: "waiting"; request: JoinWaiting; choices: LocalUserChoices }
  | { name: "turned-away"; meeting: Meeting; message: string }
  | { name: "call"; join: JoinData; choices: LocalUserChoices }
  | { name: "left"; meeting: Meeting; reason?: DisconnectReason };

/** Dark "studio" shell shared by the join and left screens. */
function Studio({ meeting, children }: { meeting: Meeting; children: React.ReactNode }) {
  return (
    <div className="dark flex min-h-dvh flex-col bg-ink-950 bg-[radial-gradient(ellipse_at_top,oklch(0.9_0.19_125/0.07),transparent_55%)] text-white">
      <RoomHeader meeting={meeting} />
      {children}
    </div>
  );
}

export function RoomPage() {
  const { roomCode = "" } = useParams();
  const navigate = useNavigate();
  const [stage, setStage] = useState<Stage>({ name: "loading" });
  const [joining, setJoining] = useState(false);
  const rec = useRecorderState();
  const { user } = useAuth();

  useEffect(() => {
    let cancelled = false;
    meetingsApi
      .get(roomCode)
      .then((meeting) => {
        if (cancelled) return;
        if (meeting.status === "ENDED") navigate(`/m/${roomCode}/notes`, { replace: true }); // over → show its notes
        else setStage({ name: "prejoin", meeting });
      })
      .catch((err) => {
        if (cancelled) return;
        const notFound = err instanceof ApiError && (err.status === 404 || err.status === 400);
        const calledOff = err instanceof ApiError && err.code === "MEETING_CANCELLED";
        setStage({
          name: "error",
          title: calledOff ? "This meeting was cancelled" : notFound ? "Meeting not found" : "Couldn't load meeting",
          message: errorMessage(err),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [roomCode, navigate]);

  const enter = useCallback(
    (join: JoinData, choices: LocalUserChoices) => {
      saveParticipantId(roomCode, join.participantId); // lets this browser open the notes later
      setStage({ name: "call", join, choices });
    },
    [roomCode],
  );

  async function join(choices: LocalUserChoices) {
    if (joining) return;
    setJoining(true);
    try {
      // The host key (creator's browser) lets the host skip "Ask to join".
      const res = await meetingsApi.join(roomCode, choices.username, getHostKey(roomCode));
      if (res.waiting) setStage({ name: "waiting", request: res, choices });
      else enter(res, choices);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setJoining(false);
    }
  }

  if (stage.name === "loading")
    return (
      <div className="flex min-h-dvh items-center justify-center bg-ink-950" role="status">
        <Loader2 className="size-8 animate-spin text-brand" />
        <span className="sr-only">Loading meeting…</span>
      </div>
    );

  if (stage.name === "error") return <NotFoundPage title={stage.title} message={stage.message} />;

  if (stage.name === "waiting") {
    const { request, choices } = stage;
    return (
      <Studio meeting={request.meeting}>
        <WaitingScreen
          request={request}
          name={choices.username}
          avatarUrl={user ? assetUrl(user.avatarUrl) : undefined}
          onAdmitted={(join) => enter(join, choices)}
          onTurnedAway={(message, ended) =>
            ended ? navigate(`/m/${roomCode}/notes`, { replace: true }) : setStage({ name: "turned-away", meeting: request.meeting, message })
          }
          onCancel={() => setStage({ name: "prejoin", meeting: request.meeting })}
        />
      </Studio>
    );
  }

  if (stage.name === "turned-away")
    return (
      <Studio meeting={stage.meeting}>
        <main className="flex flex-1 items-center justify-center p-4">
          <div role="alert" className="animate-pop-in w-full max-w-sm space-y-6 rounded-3xl border border-white/[0.08] bg-ink-900 p-8 text-center">
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold">You can't join right now</h1>
              <p className="text-ink-300">{stage.message}</p>
            </div>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setStage({ name: "prejoin", meeting: stage.meeting })}
                className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-brand font-semibold text-ink-950 hover:brightness-95 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-ink-900 focus-visible:outline-none"
              >
                <RotateCcw className="size-4" /> Ask again
              </button>
              <Link
                to="/"
                className="flex h-12 items-center justify-center rounded-2xl text-ink-300 hover:bg-white/[0.06] hover:text-white focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
              >
                Back to home
              </Link>
            </div>
          </div>
        </main>
      </Studio>
    );

  if (stage.name === "left")
    return (
      <Studio meeting={stage.meeting}>
        <main className="flex flex-1 items-center justify-center p-4">
          <div className="animate-pop-in w-full max-w-sm space-y-6 rounded-3xl border border-white/[0.08] bg-ink-900 p-8 text-center">
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold">
                {stage.reason === DisconnectReason.ROOM_DELETED
                  ? "The meeting has ended"
                  : stage.reason === DisconnectReason.PARTICIPANT_REMOVED
                    ? "The host removed you from the meeting"
                    : stage.reason === DisconnectReason.CLIENT_INITIATED
                    ? "You left the call"
                    : "You were disconnected"}
              </h1>
              <p className="text-ink-300">{stage.meeting.title}</p>
            </div>
            {rec.phase === "uploading" && (
              <div role="status" className="space-y-2 rounded-2xl bg-white/[0.05] p-3 text-left text-sm">
                <p className="flex items-center gap-2 font-medium">
                  <Loader2 className="size-4 animate-spin text-brand" /> Uploading recording… {Math.round(rec.progress * 100)}%
                </p>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${rec.progress * 100}%` }} />
                </div>
                <p className="text-xs text-ink-300">Keep this tab open until it finishes.</p>
              </div>
            )}
            {rec.phase === "done" && <p className="text-sm text-brand">Recording saved to the meeting notes.</p>}
            {rec.phase === "saved-locally" && <p className="text-sm text-amber-300">Recording saved to your computer (Downloads).</p>}
            <div className="flex flex-col gap-2">
              {stage.reason === DisconnectReason.ROOM_DELETED ? (
                <Link
                  to={`/m/${roomCode}/notes`}
                  className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-brand font-semibold text-ink-950 hover:brightness-95 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-ink-900 focus-visible:outline-none"
                >
                  <NotebookPen className="size-4" /> View meeting notes
                </Link>
              ) : (
                <Link
                  to={`/m/${roomCode}/notes`}
                  className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-white/10 font-medium text-white hover:bg-white/[0.06] focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
                >
                  <NotebookPen className="size-4" /> Meeting notes
                </Link>
              )}
              <button
                type="button"
                hidden={stage.reason === DisconnectReason.ROOM_DELETED || stage.reason === DisconnectReason.PARTICIPANT_REMOVED}
                onClick={() => setStage({ name: "prejoin", meeting: stage.meeting })}
                className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-brand font-semibold text-ink-950 hover:brightness-95 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-ink-900 focus-visible:outline-none"
              >
                <RotateCcw className="size-4" /> Rejoin
              </button>
              <Link
                to="/"
                className="flex h-12 items-center justify-center rounded-2xl text-ink-300 hover:bg-white/[0.06] hover:text-white focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
              >
                Back to home
              </Link>
            </div>
          </div>
        </main>
      </Studio>
    );

  if (stage.name === "prejoin")
    return (
      <Studio meeting={stage.meeting}>
        {/* key: re-open with the profile name/photo once we know the visitor is signed in */}
        <PreJoinScreen key={user?.id ?? "guest"} meeting={stage.meeting} joining={joining} onJoin={join} />
      </Studio>
    );

  const { join: joinData, choices } = stage;
  return (
    <LiveKitRoom
      serverUrl={joinData.livekitUrl}
      token={joinData.token}
      connect
      video={choices.videoEnabled ? { deviceId: choices.videoDeviceId || undefined } : false}
      audio={choices.audioEnabled ? { deviceId: choices.audioDeviceId || undefined } : false}
      onMediaDeviceFailure={deviceToast}
      onError={(err) => {
        // Camera/mic errors are already explained by onMediaDeviceFailure.
        if (!MediaDeviceFailure.getFailure(err)) toast.error(`Connection problem: ${err.message}`);
      }}
      onDisconnected={(reason) => setStage({ name: "left", meeting: joinData.meeting, reason })}
    >
      <CallView
        roomCode={joinData.meeting.roomCode}
        title={joinData.meeting.title}
        participantId={joinData.participantId}
        isHost={!!getHostKey(roomCode) || joinData.isHost}
      />
    </LiveKitRoom>
  );
}
