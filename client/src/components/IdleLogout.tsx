import { useEffect, useRef, useState } from "react";
import { matchPath, useLocation, useNavigate } from "react-router";
import { toast } from "sonner";
import { Clock } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/lib/auth";

export const IDLE_MS = 10 * 60_000; // no activity for 10 minutes -> warning
export const WARN_MS = 5 * 60_000; // then 5 minutes to answer -> signed out
const KEY = "meetapp-last-active"; // shared by all tabs: activity anywhere counts everywhere
const SAVE_EVERY_MS = 15_000;

function readShared() {
  try {
    return Number(localStorage.getItem(KEY)) || 0;
  } catch {
    return 0;
  }
}
function writeShared(t: number) {
  try {
    localStorage.setItem(KEY, String(t));
  } catch {
    /* private mode: this tab only */
  }
}

const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * Signs out people who leave the app open and walk away: after 10 idle minutes a dialog counts down 5 minutes.
 * Never in a meeting (join screen, call, "you left" screen): a call keeps every tab active instead.
 */
export function IdleLogout() {
  const { user, logout } = useAuth();
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const inMeeting = !!matchPath("/m/:roomCode", pathname);
  const [left, setLeft] = useState<number | null>(null); // ms until sign-out while the warning shows
  const lastActive = useRef(Date.now());
  const lastSaved = useRef(0);
  const warning = left !== null;

  // activity in this tab (ignored while the warning shows: it needs a real answer)
  useEffect(() => {
    if (!user || warning) return;
    const active = () => {
      const now = Date.now();
      lastActive.current = now;
      if (now - lastSaved.current > SAVE_EVERY_MS) {
        lastSaved.current = now;
        writeShared(now);
      }
    };
    active();
    const events = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart", "scroll"] as const;
    events.forEach((e) => addEventListener(e, active, { passive: true }));
    const onVisible = () => document.visibilityState === "visible" && active();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      events.forEach((e) => removeEventListener(e, active));
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [user, warning]);

  // in a meeting: no timer here, and every other tab is told we're active
  useEffect(() => {
    if (!user || !inMeeting) return;
    setLeft(null);
    const beat = () => {
      lastActive.current = Date.now();
      writeShared(lastActive.current);
    };
    beat();
    const t = setInterval(beat, 30_000);
    return () => clearInterval(t);
  }, [user, inMeeting]);

  // the clock: works from timestamps, so sleeping laptops and slowed background tabs are handled too
  useEffect(() => {
    if (!user || inMeeting) return;
    const tick = () => {
      const idle = Date.now() - Math.max(lastActive.current, readShared());
      if (idle >= IDLE_MS + WARN_MS) {
        setLeft(null);
        void logout().then(() => {
          toast("You were signed out after 15 minutes without activity.");
          navigate(`/signin?next=${encodeURIComponent(pathname + search)}`, { replace: true });
        });
      } else if (idle >= IDLE_MS) setLeft(IDLE_MS + WARN_MS - idle);
      else setLeft(null); // e.g. active in another tab
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [user, inMeeting, logout, navigate, pathname, search]);

  if (!user || inMeeting) return null;

  function stay() {
    lastActive.current = Date.now();
    lastSaved.current = lastActive.current;
    writeShared(lastActive.current);
    setLeft(null);
  }

  return (
    <AlertDialog open={warning} onOpenChange={(open) => !open && stay()}>
      <AlertDialogContent className="rounded-3xl sm:max-w-sm">
        <AlertDialogHeader>
          <span className="mb-1 flex size-11 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-300">
            <Clock className="size-5" aria-hidden />
          </span>
          <AlertDialogTitle>Are you still there?</AlertDialogTitle>
          <AlertDialogDescription>
            You haven't done anything for 10 minutes. To keep your account safe, you'll be signed out in{" "}
            <span className="font-semibold text-foreground tabular-nums" role="timer" aria-live="off">
              {mmss(left ?? 0)}
            </span>
            .
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            className="rounded-xl"
            onClick={(e) => {
              e.preventDefault();
              setLeft(null);
              void logout().then(() => navigate("/", { replace: true }));
            }}
          >
            Sign out now
          </AlertDialogCancel>
          <AlertDialogAction className="rounded-xl bg-brand text-ink-950 hover:brightness-95" onClick={stay}>
            Stay signed in
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
