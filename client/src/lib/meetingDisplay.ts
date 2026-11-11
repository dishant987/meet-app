import type { MyMeeting } from "@/lib/api";

/** Status chip text + colours for a meeting card. */
export function statusChip(m: MyMeeting) {
  if (m.status === "LIVE") return { text: "Live now", cls: "bg-brand text-ink-950" };
  if (m.status === "SCHEDULED")
    return m.scheduledFor
      ? { text: "Upcoming", cls: "bg-sky-500/15 text-sky-700 dark:text-sky-300" }
      : { text: "Not started", cls: "bg-muted text-muted-foreground" };
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

const duration = (mins: number) => (mins >= 60 ? `${Math.floor(mins / 60)} h${mins % 60 ? ` ${mins % 60} min` : ""}` : `${mins} min`);

/** "Thu, Nov 12 · 3:30 PM · 45 min": planned time for upcoming meetings, real time for the rest. */
export function when(m: MyMeeting) {
  const planned = m.status === "SCHEDULED" && m.scheduledFor;
  const start = new Date(planned ? m.scheduledFor! : (m.startedAt ?? m.createdAt!));
  const date = start.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
  const time = start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (planned) return `${date} · ${time}${m.durationMin ? ` · ${duration(m.durationMin)}` : ""}`;
  if (!m.endedAt || !m.startedAt) return `${date} · ${time}`;
  return `${date} · ${time} · ${duration(Math.max(1, Math.round((+new Date(m.endedAt) - +start) / 60000)))}`;
}

/** Where a meeting card goes, and what its link says. */
export function openLink(m: MyMeeting) {
  if (m.status === "ENDED") return { to: `/m/${m.roomCode}/notes`, label: "Open notes" };
  if (m.status === "LIVE") return { to: `/m/${m.roomCode}`, label: "Rejoin" };
  return { to: `/m/${m.roomCode}`, label: m.isHost ? "Start" : "Join" };
}

/** Who you were in it. */
export const roleLabel = (m: MyMeeting) => (m.isHost ? "You host" : m.attendees.length ? "You joined" : "You're invited");
