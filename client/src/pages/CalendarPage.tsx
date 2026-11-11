import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { Link, useSearchParams } from "react-router";
import { toast } from "sonner";
import { CalendarPlus, ChevronLeft, ChevronRight, Clock, Copy, Repeat, Users, Video } from "lucide-react";
import { cn } from "cn";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { ScheduleDialog } from "@/components/ScheduleDialog";
import { MeetingActions, canManage } from "@/components/MeetingActions";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { errorMessage, meetingsApi, type MyMeeting } from "@/lib/api";
import { guestsLabel, openLink, repeatLabel, roleLabel, statusChip } from "@/lib/meetingDisplay";

type View = "month" | "week";
const HOUR_PX = 48; // week view: one hour is 48px tall
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// ---------- dates (local time, weeks start on Monday) ----------
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const startOfWeek = (d: Date) => addDays(startOfDay(d), -((d.getDay() + 6) % 7));
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parseDay = (s: string | null) => {
  const m = s?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? new Date(+m[1]!, +m[2]! - 1, +m[3]!) : startOfDay(new Date());
};
const time = (d: Date) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

/** The days a view shows: 6 full weeks around the month, or the 7 days of the week. */
function range(view: View, anchor: Date) {
  if (view === "week") {
    const from = startOfWeek(anchor);
    return { from, to: addDays(from, 7), days: Array.from({ length: 7 }, (_, i) => addDays(from, i)) };
  }
  const from = startOfWeek(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
  return { from, to: addDays(from, 42), days: Array.from({ length: 42 }, (_, i) => addDays(from, i)) };
}

/** When a meeting sits on the calendar: its planned time, else when it really started. */
function span(m: MyMeeting) {
  const start = new Date(m.scheduledFor ?? m.startedAt ?? m.createdAt!);
  const minutes =
    m.durationMin ?? (m.startedAt && m.endedAt ? Math.max(15, Math.round((+new Date(m.endedAt) - +new Date(m.startedAt)) / 60_000)) : 30);
  return { start, end: new Date(start.getTime() + minutes * 60_000), minutes };
}

/** Colours by state: live, still to come, or over. */
function tone(m: MyMeeting) {
  if (m.status === "LIVE") return "border-red-500/50 bg-red-500/15 text-red-700 dark:text-red-300";
  if (m.status === "SCHEDULED") return "border-brand/60 bg-brand/20 text-foreground";
  return "border-border bg-muted text-muted-foreground";
}
const dot = (m: MyMeeting) => (m.status === "LIVE" ? "bg-red-500" : m.status === "SCHEDULED" ? "bg-brand" : "bg-muted-foreground/50");

/** Side-by-side columns for meetings that overlap in time (week view). */
function lanes(items: { m: MyMeeting; start: Date; end: Date }[]) {
  const sorted = [...items].sort((a, b) => +a.start - +b.start);
  const out: { m: MyMeeting; start: Date; end: Date; lane: number; of: number }[] = [];
  let cluster: typeof out = [];
  let clusterEnd = 0;
  const flush = () => {
    const n = Math.max(...cluster.map((c) => c.lane)) + 1;
    cluster.forEach((c) => out.push({ ...c, of: n }));
    cluster = [];
  };
  for (const it of sorted) {
    if (cluster.length && +it.start >= clusterEnd) flush();
    const taken = new Set(cluster.filter((c) => +c.end > +it.start).map((c) => c.lane));
    let lane = 0;
    while (taken.has(lane)) lane++;
    cluster.push({ ...it, lane, of: 1 });
    clusterEnd = Math.max(clusterEnd, +it.end);
  }
  if (cluster.length) flush();
  return out;
}

export function CalendarPage() {
  const [params, setParams] = useSearchParams();
  const view: View = params.get("view") === "week" ? "week" : "month";
  const dateParam = params.get("date");
  const { anchor, from, to, days } = useMemo(() => {
    const a = parseDay(dateParam);
    return { anchor: a, ...range(view, a) };
  }, [view, dateParam]);
  const [meetings, setMeetings] = useState<MyMeeting[] | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<MyMeeting | null>(null);
  const [scheduleAt, setScheduleAt] = useState<Date | null>(null);
  const [reload, setReload] = useState(0);
  const today = startOfDay(new Date());

  const go = (next: { view?: View; date?: Date }) =>
    setParams({ view: next.view ?? view, date: dayKey(next.date ?? anchor) }, { replace: true });
  const step = (dir: number) =>
    go({ date: view === "week" ? addDays(anchor, dir * 7) : new Date(anchor.getFullYear(), anchor.getMonth() + dir, 1) });

  useEffect(() => {
    const ctrl = new AbortController();
    setError("");
    meetingsApi
      .calendar(from, to, ctrl.signal)
      .then(setMeetings)
      .catch((err) => !ctrl.signal.aborted && setError(errorMessage(err)));
    return () => ctrl.abort();
  }, [from, to, reload]);

  const byDay = useMemo(() => {
    const map = new Map<string, MyMeeting[]>();
    for (const m of meetings ?? []) {
      const k = dayKey(span(m).start);
      map.set(k, [...(map.get(k) ?? []), m]);
    }
    for (const list of map.values()) list.sort((a, b) => +span(a).start - +span(b).start);
    return map;
  }, [meetings]);

  /** Click on an empty day or time: schedule there (only in the future). */
  const scheduleOn = (at: Date) => {
    const soon = new Date(Date.now() + 30 * 60_000);
    if (at < soon) {
      if (sameDay(at, new Date())) at = new Date(Math.ceil(soon.getTime() / 1_800_000) * 1_800_000); // next half hour today
      else return toast("That time has passed. Pick a time from now on.");
    }
    setScheduleAt(at);
  };

  const title =
    view === "month"
      ? anchor.toLocaleDateString([], { month: "long", year: "numeric" })
      : `${from.toLocaleDateString([], { day: "numeric", month: "short" })} – ${addDays(to, -1).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" })}`;

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-5 px-4 py-8 sm:px-6 lg:px-10">
      <div className="space-y-3">
        <Breadcrumbs items={[{ label: "Home", to: "/dashboard" }, { label: "Calendar" }]} />
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Calendar</h1>
            <p className="text-muted-foreground">Every meeting you host, join or are invited to, by day.</p>
          </div>
          <button
            type="button"
            onClick={() => scheduleOn(new Date(Math.ceil((Date.now() + 30 * 60_000) / 1_800_000) * 1_800_000))}
            className="flex h-11 items-center gap-2 rounded-2xl bg-brand px-4 text-sm font-semibold text-ink-950 transition hover:brightness-95 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
          >
            <CalendarPlus className="size-4" /> Schedule
          </button>
        </div>
      </div>

      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => go({ date: today })}
          className="h-10 rounded-xl border border-border bg-card px-3 text-sm font-medium transition hover:border-brand focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
        >
          Today
        </button>
        <div className="flex">
          {[-1, 1].map((d) => (
            <button
              key={d}
              type="button"
              aria-label={d < 0 ? `Previous ${view}` : `Next ${view}`}
              onClick={() => step(d)}
              className="flex size-10 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
            >
              {d < 0 ? <ChevronLeft className="size-5" /> : <ChevronRight className="size-5" />}
            </button>
          ))}
        </div>
        <h2 className="min-w-0 flex-1 truncate text-lg font-semibold" aria-live="polite">
          {title}
        </h2>
        <div role="radiogroup" aria-label="View" className="hidden rounded-2xl border border-border bg-muted p-1 text-sm md:flex">
          {(["month", "week"] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={view === v}
              onClick={() => go({ view: v })}
              className={cn(
                "rounded-xl px-4 py-1.5 font-medium capitalize transition-colors focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none",
                view === v ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {/* desktop / tablet: month or week grid */}
      <div className="hidden md:block">
        {!meetings ? (
          <Skeleton className="h-[640px] rounded-3xl" />
        ) : view === "month" ? (
          <MonthGrid days={days} month={anchor.getMonth()} today={today} byDay={byDay} onOpen={setOpen} onDay={(d) => go({ view: "week", date: d })} onEmpty={(d) => scheduleOn(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 10))} />
        ) : (
          <WeekGrid days={days} today={today} byDay={byDay} onOpen={setOpen} onEmpty={scheduleOn} />
        )}
      </div>

      {/* phones: a simple agenda for the same range */}
      <div className="md:hidden">
        {!meetings ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-20 rounded-2xl" />
            ))}
          </div>
        ) : (
          <Agenda days={days.filter((d) => view === "week" || d.getMonth() === anchor.getMonth())} today={today} byDay={byDay} onOpen={setOpen} />
        )}
      </div>

      <MeetingDetails m={open} onClose={() => setOpen(null)} onChanged={() => (setOpen(null), setReload((n) => n + 1))} />
      <ScheduleDialog
        open={!!scheduleAt}
        onOpenChange={(o) => !o && setScheduleAt(null)}
        initialAt={scheduleAt}
        onScheduled={() => setReload((n) => n + 1)}
      />
    </div>
  );
}

function Chip({ m, onOpen }: { m: MyMeeting; onOpen: (m: MyMeeting) => void }) {
  return (
    <button
      type="button"
      onClick={(e) => (e.stopPropagation(), onOpen(m))}
      className="flex w-full min-w-0 items-center gap-1.5 rounded-lg px-1.5 py-0.5 text-left text-xs transition hover:bg-muted focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
    >
      <span className={cn("size-1.5 shrink-0 rounded-full", dot(m))} aria-hidden />
      <span className="shrink-0 text-muted-foreground tabular-nums">{time(span(m).start)}</span>
      <span className={cn("min-w-0 truncate font-medium", m.status === "ENDED" && "text-muted-foreground")}>{m.title}</span>
    </button>
  );
}

function MonthGrid({
  days,
  month,
  today,
  byDay,
  onOpen,
  onDay,
  onEmpty,
}: {
  days: Date[];
  month: number;
  today: Date;
  byDay: Map<string, MyMeeting[]>;
  onOpen: (m: MyMeeting) => void;
  onDay: (d: Date) => void;
  onEmpty: (d: Date) => void;
}) {
  return (
    <div className="overflow-hidden rounded-3xl border border-border bg-card">
      <div className="grid grid-cols-7 border-b border-border">
        {WEEKDAYS.map((w) => (
          <div key={w} className="px-3 py-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 grid-rows-6">
        {days.map((d, i) => {
          const list = byDay.get(dayKey(d)) ?? [];
          const isToday = sameDay(d, today);
          const outside = d.getMonth() !== month;
          return (
            <div
              key={i}
              role="gridcell"
              aria-label={`${d.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" })}${list.length ? `, ${list.length} meetings` : ""}`}
              onClick={() => onEmpty(d)}
              className={cn(
                "group relative min-h-28 cursor-pointer border-border p-1.5 transition-colors hover:bg-muted/40",
                i % 7 !== 6 && "border-r",
                i < 35 && "border-b",
                outside && "bg-muted/20",
              )}
            >
              <div className="mb-1 flex items-center justify-between px-1">
                <button
                  type="button"
                  onClick={(e) => (e.stopPropagation(), onDay(d))}
                  aria-label={`Open the week of ${d.toLocaleDateString([], { day: "numeric", month: "long" })}`}
                  className={cn(
                    "flex size-7 items-center justify-center rounded-full text-sm tabular-nums transition hover:bg-muted focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none",
                    isToday ? "bg-brand font-semibold text-ink-950 hover:bg-brand" : outside ? "text-muted-foreground/60" : "font-medium",
                  )}
                >
                  {d.getDate()}
                </button>
                <CalendarPlus className="size-3.5 text-muted-foreground opacity-0 transition group-hover:opacity-100" aria-hidden />
              </div>
              <div className="space-y-0.5">
                {list.slice(0, 3).map((m) => (
                  <Chip key={m.id} m={m} onOpen={onOpen} />
                ))}
                {list.length > 3 && (
                  <button
                    type="button"
                    onClick={(e) => (e.stopPropagation(), onDay(d))}
                    className="px-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                  >
                    +{list.length - 3} more
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeekGrid({
  days,
  today,
  byDay,
  onOpen,
  onEmpty,
}: {
  days: Date[];
  today: Date;
  byDay: Map<string, MyMeeting[]>;
  onOpen: (m: MyMeeting) => void;
  onEmpty: (at: Date) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    scroller.current?.scrollTo({ top: 7.5 * HOUR_PX }); // start the view around 7:30
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const clickSlot = (d: Date) => (e: MouseEvent<HTMLDivElement>) => {
    const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
    const half = Math.max(0, Math.min(47, Math.floor(y / (HOUR_PX / 2))));
    onEmpty(new Date(d.getFullYear(), d.getMonth(), d.getDate(), Math.floor(half / 2), (half % 2) * 30));
  };

  return (
    <div className="overflow-hidden rounded-3xl border border-border bg-card">
      <div className="grid grid-cols-[56px_repeat(7,minmax(0,1fr))] border-b border-border">
        <div />
        {days.map((d) => (
          <div key={+d} className="flex items-center gap-2 border-l border-border px-3 py-2">
            <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{WEEKDAYS[(d.getDay() + 6) % 7]}</span>
            <span
              className={cn(
                "flex size-7 items-center justify-center rounded-full text-sm font-medium tabular-nums",
                sameDay(d, today) && "bg-brand font-semibold text-ink-950",
              )}
            >
              {d.getDate()}
            </span>
          </div>
        ))}
      </div>
      <div ref={scroller} className="relative max-h-[640px] overflow-y-auto">
        <div className="grid grid-cols-[56px_repeat(7,minmax(0,1fr))]" style={{ height: 24 * HOUR_PX }}>
          {/* hour labels */}
          <div className="relative">
            {Array.from({ length: 24 }, (_, h) => (
              <span key={h} className="absolute right-2 -translate-y-1/2 text-[11px] text-muted-foreground tabular-nums" style={{ top: h * HOUR_PX }}>
                {h === 0 ? "" : new Date(2000, 0, 1, h).toLocaleTimeString([], { hour: "numeric" })}
              </span>
            ))}
          </div>
          {days.map((d) => {
            const items = lanes((byDay.get(dayKey(d)) ?? []).map((m) => ({ m, ...span(m) })));
            const isToday = sameDay(d, today);
            return (
              <div
                key={+d}
                onClick={clickSlot(d)}
                className="relative cursor-pointer border-l border-border bg-[repeating-linear-gradient(to_bottom,transparent_0,transparent_47px,var(--color-border)_47px,var(--color-border)_48px)] hover:bg-muted/20"
                aria-label={`${d.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" })}: click a time to schedule`}
              >
                {isToday && (
                  <div className="pointer-events-none absolute inset-x-0 z-10 h-0.5 bg-red-500" style={{ top: ((now.getHours() * 60 + now.getMinutes()) / 60) * HOUR_PX }}>
                    <span className="absolute -top-1 -left-1 size-2.5 rounded-full bg-red-500" />
                  </div>
                )}
                {items.map(({ m, start, end, lane, of }) => {
                  const top = ((start.getHours() * 60 + start.getMinutes()) / 60) * HOUR_PX;
                  const height = Math.max(22, ((+end - +start) / 3_600_000) * HOUR_PX - 2);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={(e) => (e.stopPropagation(), onOpen(m))}
                      className={cn(
                        "absolute overflow-hidden rounded-lg border px-1.5 py-1 text-left text-xs transition hover:brightness-110 focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none",
                        tone(m),
                      )}
                      style={{ top, height, left: `calc(${(lane / of) * 100}% + 2px)`, width: `calc(${100 / of}% - 4px)` }}
                    >
                      <span className="block truncate font-semibold">{m.title}</span>
                      {height > 34 && (
                        <span className="block truncate opacity-80 tabular-nums">
                          {time(start)} – {time(end)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Agenda({ days, today, byDay, onOpen }: { days: Date[]; today: Date; byDay: Map<string, MyMeeting[]>; onOpen: (m: MyMeeting) => void }) {
  const withMeetings = days.filter((d) => byDay.get(dayKey(d))?.length);
  if (!withMeetings.length)
    return (
      <div className="flex flex-col items-center gap-2 rounded-3xl border border-dashed border-border p-8 text-center">
        <Clock className="size-7 text-muted-foreground" />
        <p className="font-semibold">No meetings in this period</p>
        <p className="text-sm text-muted-foreground">Use the arrows to look at other dates, or schedule one.</p>
      </div>
    );
  return (
    <ol className="space-y-4">
      {withMeetings.map((d) => (
        <li key={+d}>
          <p className={cn("mb-2 text-sm font-semibold", sameDay(d, today) ? "text-brand-ink" : "text-muted-foreground")}>
            {sameDay(d, today) ? "Today · " : ""}
            {d.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" })}
          </p>
          <ul className="space-y-2">
            {byDay.get(dayKey(d))!.map((m) => {
              const { start, end } = span(m);
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(m)}
                    className={cn("flex w-full items-center gap-3 rounded-2xl border p-3 text-left focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none", tone(m))}
                  >
                    <span className="w-16 shrink-0 text-xs tabular-nums">
                      {time(start)}
                      <br />
                      <span className="opacity-70">{time(end)}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{m.title}</span>
                      <span className="block truncate text-xs opacity-80">{roleLabel(m)}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </li>
      ))}
    </ol>
  );
}

/** A meeting's details with what you can do next (join / start / notes, copy link, edit or cancel). */
function MeetingDetails({ m, onClose, onChanged }: { m: MyMeeting | null; onClose: () => void; onChanged: () => void }) {
  if (!m) return null;
  const { start, end } = span(m);
  const chip = statusChip(m);
  const link = openLink(m);
  const extras = [repeatLabel(m), guestsLabel(m)].filter(Boolean);
  async function copy() {
    const url = `${location.origin}/m/${m!.roomCode}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Meeting link copied");
    } catch {
      toast(url);
    }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <div className="flex items-start justify-between gap-3 pr-8">
          <DialogTitle>{m.notes?.title || m.title}</DialogTitle>
          <span className={cn("shrink-0 rounded-lg px-2 py-1 text-xs font-semibold", chip.cls)}>{chip.text}</span>
        </div>
        <DialogDescription className="sr-only">Meeting details</DialogDescription>
        <ul className="space-y-2 text-sm">
          <li className="flex items-center gap-2.5">
            <Clock className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            {start.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" })} · {time(start)} – {time(end)}
          </li>
          <li className="flex items-center gap-2.5">
            <Users className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            {roleLabel(m)}
            {m.attendees.length > 0 && ` · ${m.attendees.slice(0, 4).join(", ")}${m.attendees.length > 4 ? "…" : ""}`}
          </li>
          {extras.map((t) => (
            <li key={t} className="flex items-center gap-2.5">
              <Repeat className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              {t}
            </li>
          ))}
        </ul>
        {m.notes?.summary && <p className="line-clamp-3 rounded-2xl bg-muted px-3 py-2 text-sm text-muted-foreground">{m.notes.summary}</p>}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Link
            to={link.to}
            className="flex h-10 items-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-ink-950 transition hover:brightness-95 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-popover focus-visible:outline-none"
          >
            <Video className="size-4" /> {link.label}
          </Link>
          {m.status !== "ENDED" && (
            <button
              type="button"
              onClick={copy}
              className="flex h-10 items-center gap-2 rounded-xl border border-border px-3 text-sm font-medium transition hover:border-brand focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
            >
              <Copy className="size-4" /> Copy link
            </button>
          )}
          {canManage(m) && <MeetingActions m={m} onChanged={onChanged} className="ml-auto border border-border" />}
        </div>
      </DialogContent>
    </Dialog>
  );
}
