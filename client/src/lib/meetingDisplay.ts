import type { MyMeeting } from "@/lib/api";

/** Status chip text + colours for a meeting card. */
export function statusChip(m: MyMeeting) {
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

export function when(m: MyMeeting) {
  const start = new Date(m.startedAt ?? m.createdAt!);
  const date = start.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
  const time = start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (!m.endedAt || !m.startedAt) return `${date} · ${time}`;
  const mins = Math.max(1, Math.round((+new Date(m.endedAt) - +start) / 60000));
  return `${date} · ${time} · ${mins >= 60 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${mins} min`}`;
}
