import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { AlertTriangle, ArrowRight, CalendarClock, Loader2 } from "lucide-react";
import { VideoIcon, type VideoIconHandle } from "@animateicons/react/lucide/video-icon";
import { ArrowRightIcon, type ArrowRightIconHandle } from "@animateicons/react/lucide/arrow-right-icon";
import { LinkIcon, type LinkIconHandle } from "@animateicons/react/lucide/link-icon";
import { CalendarClockIcon, type CalendarClockIconHandle } from "@animateicons/react/lucide/calendar-clock-icon";
import { ClockIcon } from "@animateicons/react/lucide/clock-icon";
import { NotebookPenIcon, type NotebookPenIconHandle } from "@animateicons/react/lucide/notebook-pen-icon";
import { UsersIcon } from "@animateicons/react/lucide/users-icon";
import { useIconHover } from "@/lib/useIconHover";
import { cn } from "cn";
import { useAuth } from "@/lib/auth";
import { errorMessage, meetingsApi, type MyMeeting } from "@/lib/api";
import { check, joinCodeForm } from "@/lib/validation";
import { statusChip, when } from "@/lib/meetingDisplay";
import { useStartMeeting } from "@/lib/useStartMeeting";

const DAY = 86_400_000;

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function duration(mins: number) {
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)} h ${mins % 60 ? `${mins % 60} min` : ""}`.trim();
}

/** Numbers for the last 30 days, worked out from the meetings list. */
function stats(meetings: MyMeeting[], me: string) {
  const recent = meetings.filter((m) => Date.now() - +new Date(m.createdAt!) < 30 * DAY);
  const minutes = recent.reduce(
    (sum, m) => (m.startedAt && m.endedAt ? sum + Math.max(1, Math.round((+new Date(m.endedAt) - +new Date(m.startedAt)) / 60000)) : sum),
    0,
  );
  const people = new Set(recent.flatMap((m) => m.attendees).filter((a) => a !== me));
  return [
    { label: "Meetings", value: String(recent.length), Icon: CalendarClockIcon },
    { label: "Time in calls", value: duration(minutes), Icon: ClockIcon },
    { label: "Notes ready", value: String(recent.filter((m) => m.notes?.status === "READY").length), Icon: NotebookPenIcon },
    { label: "People met", value: String(people.size), Icon: UsersIcon },
  ];
}

const card = "rounded-3xl border border-border bg-card";

type Stat = ReturnType<typeof stats>[number];

function StatTile({ label, value, Icon }: Stat) {
  const { ref, hover } = useIconHover<CalendarClockIconHandle>();
  return (
    <div {...hover} className={cn(card, "p-4 transition hover:border-brand/60")}>
      <Icon ref={ref} size={20} className="flex text-muted-foreground" />
      <p className="mt-3 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

/** A link with a trailing arrow that moves when the link is hovered. */
function ArrowLink({ to, className, children }: { to: string; className: string; children: React.ReactNode }) {
  const { ref, hover } = useIconHover<ArrowRightIconHandle>();
  return (
    <Link to={to} {...hover} className={className}>
      {children}
      <ArrowRightIcon ref={ref} size={16} className="flex" />
    </Link>
  );
}

function RecentRow({ m }: { m: MyMeeting }) {
  const video = useIconHover<VideoIconHandle>();
  const notes = useIconHover<NotebookPenIconHandle>();
  const chip = statusChip(m);
  const isLive = m.status !== "ENDED";
  const hover = isLive ? video.hover : notes.hover;
  return (
    <li>
      <Link
        to={isLive ? `/m/${m.roomCode}` : `/m/${m.roomCode}/notes`}
        {...hover}
        className="group flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-muted/60 focus-visible:bg-muted focus-visible:outline-none sm:px-5"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted">
          {isLive ? <VideoIcon ref={video.ref} size={16} className="flex" /> : <NotebookPenIcon ref={notes.ref} size={16} className="flex" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{m.notes?.title || m.title}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {when(m)}
            {m.isHost && " · You hosted"}
          </span>
        </span>
        <span className={cn("hidden shrink-0 rounded-lg px-2 py-1 text-xs font-semibold sm:inline", chip.cls)}>{chip.text}</span>
        <ArrowRight className="size-4 shrink-0 text-muted-foreground opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" aria-hidden />
      </Link>
    </li>
  );
}

export function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { busy, start, createLink } = useStartMeeting();
  const [meetings, setMeetings] = useState<MyMeeting[] | null>(null);
  const [error, setError] = useState("");
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState("");
  const startIcon = useIconHover<VideoIconHandle>();
  const joinIcon = useIconHover<ArrowRightIconHandle>();
  const linkIcon = useIconHover<LinkIconHandle>();

  useEffect(() => {
    meetingsApi
      .mine()
      .then(setMeetings)
      .catch((e) => setError(errorMessage(e)));
  }, []);

  const numbers = useMemo(() => (meetings && user ? stats(meetings, user.name) : null), [meetings, user]);
  const live = meetings?.filter((m) => m.status !== "ENDED") ?? [];

  function join(e: FormEvent) {
    e.preventDefault();
    const result = check(joinCodeForm, { code });
    if (result.errors) return setCodeError(result.errors.code!);
    navigate(`/m/${result.data.code}`);
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 px-4 py-8 sm:px-8">
      <div>
        <p className="text-sm text-muted-foreground">
          {new Date().toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" })}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          {greeting()}, {user?.name.split(" ")[0]}
        </h1>
      </div>

      {/* quick actions */}
      <section aria-label="Quick actions" className="grid gap-3 md:grid-cols-3">
        <button
          type="button"
          onClick={start}
          disabled={!!busy}
          {...startIcon.hover}
          className="group relative flex flex-col items-start gap-6 overflow-hidden rounded-3xl bg-brand p-5 text-left text-ink-950 transition hover:brightness-95 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none active:scale-[0.99] disabled:opacity-70"
        >
          <span className="flex size-10 items-center justify-center rounded-2xl bg-ink-950/10">
            {busy === "start" ? <Loader2 className="size-5 animate-spin" /> : <VideoIcon ref={startIcon.ref} size={20} className="flex" />}
          </span>
          <span>
            <span className="block text-lg font-semibold">New meeting</span>
            <span className="block text-sm text-ink-950/70">Start a call now and invite people</span>
          </span>
          <ArrowRight className="absolute top-5 right-5 size-5 transition-transform group-hover:translate-x-1" aria-hidden />
        </button>

        <form onSubmit={join} noValidate {...joinIcon.hover} className={cn(card, "flex flex-col gap-3 p-5")}>
          <span className="flex size-10 items-center justify-center rounded-2xl bg-brand/20">
            <ArrowRightIcon ref={joinIcon.ref} size={20} className="flex" />
          </span>
          <label htmlFor="join-code" className="text-lg font-semibold">
            Join with a code
          </label>
          <div className="flex gap-2">
            <input
              id="join-code"
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                setCodeError("");
              }}
              placeholder="abc-defg-hij or link"
              aria-invalid={!!codeError}
              aria-describedby={codeError ? "join-code-error" : undefined}
              className="h-11 min-w-0 flex-1 rounded-2xl border border-border bg-background px-3 text-sm placeholder:text-muted-foreground focus-visible:border-brand focus-visible:outline-none aria-invalid:border-destructive"
            />
            <button
              type="submit"
              disabled={!code.trim()}
              className="h-11 rounded-2xl bg-foreground px-4 text-sm font-semibold text-background transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none disabled:opacity-40"
            >
              Join
            </button>
          </div>
          {codeError && (
            <p id="join-code-error" role="alert" className="text-sm text-destructive">
              {codeError}
            </p>
          )}
        </form>

        <button
          type="button"
          onClick={createLink}
          disabled={!!busy}
          {...linkIcon.hover}
          className={cn(
            card,
            "flex flex-col items-start gap-6 p-5 text-left transition hover:border-brand focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none disabled:opacity-70",
          )}
        >
          <span className="flex size-10 items-center justify-center rounded-2xl bg-brand/20">
            {busy === "link" ? <Loader2 className="size-5 animate-spin" /> : <LinkIcon ref={linkIcon.ref} size={20} className="flex" />}
          </span>
          <span>
            <span className="block text-lg font-semibold">Get a link for later</span>
            <span className="block text-sm text-muted-foreground">Copies a meeting link to share now and start any time</span>
          </span>
        </button>
      </section>

      {error && (
        <div role="alert" className={cn(card, "flex items-center gap-3 p-4 text-sm")}>
          <AlertTriangle className="size-5 text-amber-500" /> {error}
        </div>
      )}

      {/* live now */}
      {live.length > 0 && (
        <section aria-label="Live now" className="space-y-2">
          {live.map((m) => (
            <ArrowLink
              key={m.id}
              to={`/m/${m.roomCode}`}
              className="flex items-center gap-3 rounded-2xl border border-brand/40 bg-brand/10 px-4 py-3 text-sm transition hover:border-brand focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
            >
              <span className="relative flex size-2.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand opacity-75" />
                <span className="relative inline-flex size-2.5 rounded-full bg-brand" />
              </span>
              <span className="min-w-0 flex-1 truncate">
                <span className="font-semibold">{m.title}</span> is live now
              </span>
              <span className="font-medium">Rejoin</span>
            </ArrowLink>
          ))}
        </section>
      )}

      {/* last 30 days */}
      <section aria-labelledby="stats-title" className="space-y-3">
        <h2 id="stats-title" className="text-sm font-medium text-muted-foreground">
          Last 30 days
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {numbers
            ? numbers.map((n) => <StatTile key={n.label} {...n} />)
            : [0, 1, 2, 3].map((i) => <div key={i} className="h-[7.5rem] animate-pulse rounded-3xl bg-muted" />)}
        </div>
      </section>

      {/* recent */}
      <section aria-labelledby="recent-title" className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 id="recent-title" className="text-sm font-medium text-muted-foreground">
            Recent meetings
          </h2>
          {meetings && meetings.length > 0 && (
            <ArrowLink to="/meetings" className="flex items-center gap-1 text-sm font-medium hover:underline">
              View all
            </ArrowLink>
          )}
        </div>
        {!meetings ? (
          <div className="h-48 animate-pulse rounded-3xl bg-muted" />
        ) : meetings.length === 0 ? (
          <div className={cn(card, "flex flex-col items-center gap-2 border-dashed p-10 text-center")}>
            <CalendarClock className="size-6 text-muted-foreground" aria-hidden />
            <p className="font-medium">No meetings yet</p>
            <p className="max-w-sm text-sm text-muted-foreground">Start your first one above. Its notes and recording will show up here.</p>
          </div>
        ) : (
          <ul className={cn(card, "divide-y divide-border overflow-hidden")}>
            {meetings.slice(0, 5).map((m) => (
              <RecentRow key={m.id} m={m} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
