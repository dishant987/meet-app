import { useEffect, useRef } from "react";
import { ApiError, meetingsApi, type JoinData, type JoinWaiting } from "@/lib/api";
import { Avatar } from "./Avatar";

const POLL_MS = 2000;

type Props = {
  request: JoinWaiting;
  name: string;
  avatarUrl?: string;
  onAdmitted: (join: JoinData) => void;
  onTurnedAway: (message: string, ended: boolean) => void;
  onCancel: () => void;
};

/** "Asking to join…": checks every 2 s until the host lets you in or says no. */
export function WaitingScreen({ request, name, avatarUrl, onAdmitted, onTurnedAway, onCancel }: Props) {
  // latest callbacks without restarting the polling loop on every parent render
  const latest = useRef({ onAdmitted, onTurnedAway });
  useEffect(() => {
    latest.current = { onAdmitted, onTurnedAway };
  });

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function check() {
      try {
        const res = await meetingsApi.checkRequest(request.meeting.roomCode, request.requestId, request.ticket);
        if (stopped) return;
        if (!res.waiting) return latest.current.onAdmitted(res);
      } catch (err) {
        if (stopped) return;
        // A real answer from the server ends the wait; network hiccups just retry.
        const status = err instanceof ApiError ? (err.status ?? 0) : 0;
        if (status >= 400 && status < 500 && status !== 429) return latest.current.onTurnedAway((err as ApiError).message, status === 410);
      }
      timer = setTimeout(check, POLL_MS);
    }
    void check();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [request]);

  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <div role="status" className="animate-pop-in w-full max-w-sm space-y-6 rounded-3xl border border-white/[0.08] bg-ink-900 p-8 text-center">
        {/* soft rings rippling out from your avatar while you wait */}
        <div className="relative mx-auto flex size-32 items-center justify-center">
          <span className="absolute inset-0 animate-ping rounded-full bg-brand/15 [animation-duration:2.4s]" aria-hidden />
          <span className="absolute inset-3 animate-ping rounded-full bg-brand/20 [animation-delay:0.6s] [animation-duration:2.4s]" aria-hidden />
          <Avatar name={name} size="lg" src={avatarUrl} />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">Asking to join…</h1>
          <p className="text-ink-300">You'll join as soon as the host lets you in.</p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="h-12 w-full rounded-2xl border border-white/10 font-medium text-white hover:bg-white/[0.06] focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
        >
          Cancel
        </button>
      </div>
    </main>
  );
}
