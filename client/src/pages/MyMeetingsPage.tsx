import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { AlertTriangle, CalendarPlus, ChevronLeft, ChevronRight, Loader2, Search, SearchX, Video, X } from "lucide-react";
import { PlusIcon, type PlusIconHandle } from "@animateicons/react/lucide/plus-icon";
import { cn } from "cn";
import { Avatar } from "@/components/call/Avatar";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { ScheduleDialog } from "@/components/ScheduleDialog";
import { errorMessage, meetingsApi, type MeetingsPage, type MeetingsQuery, type MyMeeting } from "@/lib/api";
import { openLink, roleLabel, statusChip, when } from "@/lib/meetingDisplay";
import { useStartMeeting } from "@/lib/useStartMeeting";
import { useIconHover } from "@/lib/useIconHover";

const PAGE_SIZE = 10;
const STATUSES = [
  ["all", "All"],
  ["live", "Live"],
  ["upcoming", "Upcoming"],
  ["ended", "Ended"],
] as const;
const ROLES = [
  ["all", "Any role"],
  ["hosted", "I hosted"],
  ["joined", "I joined"],
  ["invited", "I'm invited"],
] as const;
const SORTS = [
  ["newest", "Newest first"],
  ["oldest", "Oldest first"],
  ["soonest", "Coming up soonest"],
] as const;
const DEFAULTS: Omit<MeetingsQuery, "pageSize"> = { q: "", status: "all", role: "all", sort: "newest", page: 1 };

const pick = <T extends string>(v: string | null, options: readonly (readonly [T, string])[], fallback: T) =>
  (options.find(([k]) => k === v)?.[0] ?? fallback) as T;

/** Filters live in the address bar, so a filtered list can be shared, bookmarked and reached with Back. */
function useMeetingsQuery() {
  const [params, setParams] = useSearchParams();
  const query: MeetingsQuery = {
    q: params.get("q")?.slice(0, 100) ?? "",
    status: pick(params.get("status"), STATUSES, "all"),
    role: pick(params.get("role"), ROLES, "all"),
    sort: pick(params.get("sort"), SORTS, "newest"),
    page: Math.max(1, Math.floor(Number(params.get("page"))) || 1),
    pageSize: PAGE_SIZE,
  };
  const update = (patch: Partial<MeetingsQuery>) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries({ page: 1, ...patch })) {
          if (v === DEFAULTS[k as keyof typeof DEFAULTS] || v === "") next.delete(k);
          else next.set(k, String(v));
        }
        return next;
      },
      { replace: !("page" in patch) }, // page changes get their own Back step
    );
  return { query, update, key: params.toString() };
}

/** 1 … 4 5 6 … 12 */
function pageList(current: number, count: number): (number | "…")[] {
  const want = new Set([1, count, current - 1, current, current + 1].filter((p) => p >= 1 && p <= count));
  const sorted = [...want].sort((a, b) => a - b);
  return sorted.flatMap((p, i) => (i > 0 && p - sorted[i - 1]! > 1 ? ["…" as const, p] : [p]));
}

function MeetingCard({ m }: { m: MyMeeting }) {
  const chip = statusChip(m);
  const link = openLink(m);
  return (
    <li>
      <Link
        to={link.to}
        className="group flex h-full flex-col rounded-3xl border border-border bg-card p-5 transition hover:border-brand focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold">{m.notes?.title || m.title}</p>
            <p className="text-sm text-muted-foreground">
              {when(m)} · {roleLabel(m)}
              {m.invitedCount > 0 && ` · ${m.invitedCount} invited`}
            </p>
          </div>
          <span className={cn("shrink-0 rounded-lg px-2 py-1 text-xs font-semibold", chip.cls)}>{chip.text}</span>
        </div>
        {m.notes?.summary && <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{m.notes.summary}</p>}
        <div className="mt-auto flex items-center justify-between gap-2 pt-3">
          <div className="flex -space-x-2" aria-label={`${m.attendees.length} people`}>
            {m.attendees.slice(0, 6).map((a) => (
              <span key={a} title={a} className="rounded-xl ring-2 ring-card">
                <Avatar name={a} size="sm" />
              </span>
            ))}
          </div>
          <span className="flex items-center gap-1 text-sm font-medium text-muted-foreground group-hover:text-foreground">
            {link.label} <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </span>
        </div>
      </Link>
    </li>
  );
}

const select =
  "h-11 rounded-2xl border border-border bg-card px-3 text-sm focus-visible:border-brand focus-visible:outline-none";

export function MyMeetingsPage() {
  const { busy, start } = useStartMeeting();
  const plus = useIconHover<PlusIconHandle>();
  const { query, update, key } = useMeetingsQuery();
  const [data, setData] = useState<MeetingsPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState(query.q);
  const [reload, setReload] = useState(0);

  // the server does the searching, filtering and paging
  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    meetingsApi
      .mine(query, ctrl.signal)
      .then((d) => {
        setData(d);
        setError("");
        // a page past the end (e.g. after filtering) -> last real page
        if (d.page > d.pageCount && d.total > 0) update({ page: d.pageCount });
      })
      .catch((e) => !ctrl.signal.aborted && setError(errorMessage(e)))
      .finally(() => !ctrl.signal.aborted && setLoading(false));
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` is the whole query
  }, [key, reload]);

  // search after a short pause in typing
  useEffect(() => {
    if (search.trim() === query.q) return;
    // clearing the box applies at once; typing waits for a short pause
    const t = setTimeout(() => update({ q: search.trim() }), search.trim() ? 300 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const filtered = query.q || query.status !== "all" || query.role !== "all";
  const from = data && data.total ? (data.page - 1) * data.pageSize + 1 : 0;
  const to = data ? Math.min(data.page * data.pageSize, data.total) : 0;
  const goTo = (page: number) => {
    update({ page });
    scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-8 sm:px-6 lg:px-10">
      <Breadcrumbs items={[{ label: "Home", to: "/dashboard" }, { label: "Meetings" }]} />
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">My meetings</h1>
          <p className="text-muted-foreground">Meetings you host, joined, or are invited to.</p>
        </div>
        <div className="flex gap-2">
          <ScheduleDialog
            onScheduled={() => setReload((n) => n + 1)}
            trigger={
              <button
                type="button"
                className="flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl border border-border bg-card px-4 text-sm font-semibold transition hover:border-brand focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none sm:flex-none"
              >
                <CalendarPlus className="size-4" aria-hidden /> Schedule
              </button>
            }
          />
          <button
            type="button"
            onClick={start}
            disabled={!!busy}
            {...plus.hover}
            className="flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl bg-brand px-5 font-semibold text-ink-950 transition hover:brightness-95 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none disabled:opacity-60 sm:flex-none"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <PlusIcon ref={plus.ref} size={16} className="flex" />} New meeting
          </button>
        </div>
      </div>

      {/* search + filters */}
      <div className="mb-3 flex flex-col gap-2 sm:flex-row">
        <label className="flex h-11 flex-1 items-center gap-2 rounded-2xl border border-border bg-card px-3 focus-within:border-brand">
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="sr-only">Search meetings</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            maxLength={100}
            placeholder="Search by title, person or topic"
            className="h-full min-w-0 flex-1 bg-transparent text-sm focus:outline-none [&::-webkit-search-cancel-button]:hidden"
          />
          {search && (
            <button type="button" aria-label="Clear search" onClick={() => setSearch("")} className="rounded-lg p-1 text-muted-foreground hover:text-foreground">
              <X className="size-4" />
            </button>
          )}
        </label>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <select aria-label="Role" className={select} value={query.role} onChange={(e) => update({ role: e.target.value as MeetingsQuery["role"] })}>
            {ROLES.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
          <select aria-label="Sort" className={select} value={query.sort} onChange={(e) => update({ sort: e.target.value as MeetingsQuery["sort"] })}>
            {SORTS.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
      </div>

      <div role="group" aria-label="Status" className="mb-4 flex gap-1 overflow-x-auto rounded-2xl border border-border bg-card p-1">
        {STATUSES.map(([v, label]) => (
          <button
            key={v}
            type="button"
            aria-pressed={query.status === v}
            onClick={() => update({ status: v })}
            className={cn(
              "flex shrink-0 flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none",
              query.status === v ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {label}
            {data && <span className={cn("rounded-md px-1.5 text-xs tabular-nums", query.status === v ? "bg-background/20" : "bg-muted")}>{data.counts[v]}</span>}
          </button>
        ))}
      </div>

      <div className="mb-3 flex min-h-5 items-center justify-between text-sm text-muted-foreground" aria-live="polite">
        <span>{data && data.total > 0 ? `Showing ${from}–${to} of ${data.total}` : ""}</span>
        {loading && data && <Loader2 className="size-4 animate-spin" aria-label="Loading" />}
      </div>

      {error ? (
        <div role="alert" className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 text-sm">
          <AlertTriangle className="size-5 shrink-0 text-amber-500" /> {error}
          <button type="button" onClick={() => setReload((n) => n + 1)} className="ml-auto font-medium underline underline-offset-4">
            Try again
          </button>
        </div>
      ) : !data ? (
        <div className="space-y-3" aria-label="Loading meetings">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-3xl bg-muted" />
          ))}
        </div>
      ) : data.total === 0 && !filtered ? (
        <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-border p-10 text-center">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-brand/20">
            <Video className="size-5" aria-hidden />
          </span>
          <p className="font-medium">No meetings yet</p>
          <p className="max-w-sm text-sm text-muted-foreground">Start or schedule one. Meetings you join while signed in show up here too, with their notes.</p>
        </div>
      ) : data.total === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-border p-10 text-center">
          <SearchX className="size-6 text-muted-foreground" aria-hidden />
          <p className="font-medium">No meetings match{query.q ? ` "${query.q}"` : " these filters"}</p>
          <button
            type="button"
            onClick={() => {
              setSearch("");
              update({ q: "", status: "all", role: "all" });
            }}
            className="rounded-xl border border-border px-3 py-2 text-sm font-medium hover:border-brand focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <ul className={cn("grid gap-3 transition-opacity xl:grid-cols-2", loading && "opacity-60")}>
          {data.items.map((m) => (
            <MeetingCard key={m.id} m={m} />
          ))}
        </ul>
      )}

      {data && data.pageCount > 1 && (
        <nav aria-label="Pages" className="mt-6 flex items-center justify-center gap-1">
          <button
            type="button"
            disabled={data.page <= 1}
            onClick={() => goTo(data.page - 1)}
            aria-label="Previous page"
            className="flex size-10 items-center justify-center rounded-xl border border-border bg-card hover:border-brand focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none disabled:opacity-40"
          >
            <ChevronLeft className="size-4" />
          </button>
          {pageList(data.page, data.pageCount).map((p, i) =>
            p === "…" ? (
              <span key={`gap${i}`} className="px-1 text-muted-foreground">…</span>
            ) : (
              <button
                key={p}
                type="button"
                onClick={() => goTo(p)}
                aria-current={p === data.page ? "page" : undefined}
                className={cn(
                  "h-10 min-w-10 rounded-xl px-2 text-sm font-medium tabular-nums focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none",
                  p === data.page ? "bg-foreground text-background" : "border border-border bg-card hover:border-brand",
                )}
              >
                {p}
              </button>
            ),
          )}
          <button
            type="button"
            disabled={data.page >= data.pageCount}
            onClick={() => goTo(data.page + 1)}
            aria-label="Next page"
            className="flex size-10 items-center justify-center rounded-xl border border-border bg-card hover:border-brand focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none disabled:opacity-40"
          >
            <ChevronRight className="size-4" />
          </button>
        </nav>
      )}
    </div>
  );
}
