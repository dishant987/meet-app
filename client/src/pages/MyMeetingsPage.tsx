import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import { toast } from "sonner";
import { AlertTriangle, Loader2, Plus, Search, Video } from "lucide-react";
import { cn } from "cn";
import { Logo } from "@/components/Logo";
import { UserMenu } from "@/components/UserMenu";
import { Avatar } from "@/components/call/Avatar";
import { useAuth } from "@/lib/auth";
import { errorMessage, meetingsApi, type MyMeeting } from "@/lib/api";
import { saveHostKey } from "@/lib/meetingAccess";

function statusChip(m: MyMeeting) {
  if (m.status !== "ENDED") return { text: "Live now", cls: "bg-brand text-ink-950" };
  switch (m.notes?.status) {
    case "READY":
      return { text: "Notes ready", cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" };
    case "PENDING":
      return { text: "Writing notes…", cls: "bg-muted text-muted-foreground" };
    case "FAILED":
      return { text: "Notes failed", cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400" };
    case "EMPTY":
      return { text: "No captions", cls: "bg-muted text-muted-foreground" };
    default:
      return { text: "Ended", cls: "bg-muted text-muted-foreground" };
  }
}

function when(m: MyMeeting) {
  const start = new Date(m.startedAt ?? m.createdAt!);
  const date = start.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
  const time = start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (!m.endedAt || !m.startedAt) return `${date} · ${time}`;
  const mins = Math.max(1, Math.round((+new Date(m.endedAt) - +start) / 60000));
  return `${date} · ${time} · ${mins >= 60 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${mins} min`}`;
}

export function MyMeetingsPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [meetings, setMeetings] = useState<MyMeeting[] | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!user) return;
    meetingsApi
      .mine()
      .then(setMeetings)
      .catch((e) => setError(errorMessage(e)));
  }, [user]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!meetings || !q) return meetings;
    return meetings.filter((m) =>
      [m.title, m.notes?.title, m.notes?.summary, ...m.attendees].some((t) => t?.toLowerCase().includes(q)),
    );
  }, [meetings, query]);

  if (!loading && !user) return <Navigate to="/signin?next=/meetings" replace />;

  async function newMeeting() {
    setCreating(true);
    try {
      const m = await meetingsApi.create();
      saveHostKey(m.roomCode, m.hostKey);
      navigate(`/m/${m.roomCode}`);
    } catch (e) {
      toast.error(errorMessage(e));
      setCreating(false);
    }
  }

  return (
    <div className="min-h-dvh bg-background bg-[radial-gradient(ellipse_at_top_right,oklch(0.9_0.19_125/0.1),transparent_45%)]">
      <header className="flex items-center justify-between gap-3 px-4 py-4 sm:px-8">
        <Link to="/" aria-label="MeetApp home" className="rounded-xl focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none">
          <Logo />
        </Link>
        <UserMenu />
      </header>

      <main className="mx-auto w-full max-w-4xl px-4 pb-16 sm:px-8">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">My meetings</h1>
            <p className="text-muted-foreground">Meetings you hosted or joined while signed in.</p>
          </div>
          <button
            type="button"
            onClick={newMeeting}
            disabled={creating}
            className="flex h-11 items-center justify-center gap-2 rounded-2xl bg-brand px-5 font-semibold text-ink-950 transition hover:brightness-95 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none disabled:opacity-60"
          >
            {creating ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} New meeting
          </button>
        </div>

        {meetings && meetings.length > 0 && (
          <label className="mb-4 flex h-11 items-center gap-2 rounded-2xl border border-border bg-card px-3 focus-within:border-brand">
            <Search className="size-4 text-muted-foreground" aria-hidden />
            <span className="sr-only">Search meetings</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by title, person or topic"
              className="h-full flex-1 bg-transparent text-sm focus:outline-none"
            />
          </label>
        )}

        {error ? (
          <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 text-sm">
            <AlertTriangle className="size-5 text-amber-500" /> {error}
          </div>
        ) : !shown ? (
          <div className="space-y-3" aria-label="Loading meetings">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-28 animate-pulse rounded-3xl bg-muted" />
            ))}
          </div>
        ) : meetings!.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-border p-10 text-center">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-brand/20">
              <Video className="size-5" aria-hidden />
            </span>
            <p className="font-medium">No meetings yet</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Start one, or join a meeting while signed in. It'll show up here with its notes.
            </p>
          </div>
        ) : shown.length === 0 ? (
          <p className="py-10 text-center text-muted-foreground">No meetings match "{query}".</p>
        ) : (
          <ul className="space-y-3">
            {shown.map((m) => {
              const chip = statusChip(m);
              const live = m.status !== "ENDED";
              return (
                <li key={m.id}>
                  <Link
                    to={live ? `/m/${m.roomCode}` : `/m/${m.roomCode}/notes`}
                    className="group block rounded-3xl border border-border bg-card p-5 transition hover:border-brand focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-lg font-semibold">{m.notes?.title || m.title}</p>
                        <p className="text-sm text-muted-foreground">
                          {when(m)}
                          {m.isHost && " · You hosted"}
                        </p>
                      </div>
                      <span className={cn("shrink-0 rounded-lg px-2 py-1 text-xs font-semibold", chip.cls)}>{chip.text}</span>
                    </div>
                    {m.notes?.summary && <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{m.notes.summary}</p>}
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <div className="flex -space-x-2" aria-label={`${m.attendees.length} people`}>
                        {m.attendees.slice(0, 6).map((a) => (
                          <span key={a} title={a} className="rounded-xl ring-2 ring-card">
                            <Avatar name={a} size="sm" />
                          </span>
                        ))}
                      </div>
                      <span className="text-sm font-medium text-muted-foreground group-hover:text-foreground">
                        {live ? "Rejoin →" : "Open notes →"}
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
