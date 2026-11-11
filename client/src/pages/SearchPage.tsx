import { Fragment, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { AlertTriangle, FileText, MessageSquare, Mic, NotebookPen, Search, SearchX, Users, X } from "lucide-react";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage, searchApi, type SearchHit, type SearchResult } from "@/lib/api";

const fmtDay = (r: SearchResult) =>
  new Date(r.startedAt ?? r.scheduledFor ?? r.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
const fmtTime = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : "");

/** "the <<budget>> is fine" -> text with <mark> around the matches (never as HTML: just split on the markers). */
function Snippet({ text }: { text: string }) {
  const parts = text.split(/(<<.*?>>)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("<<") && p.endsWith(">>") ? (
          <mark key={i} className="rounded bg-brand/40 px-0.5 text-foreground">
            {p.slice(2, -2)}
          </mark>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  );
}

const KIND = {
  transcript: { icon: Mic, label: "Said" },
  chat: { icon: MessageSquare, label: "Chat" },
  notes: { icon: NotebookPen, label: "Notes" },
  title: { icon: FileText, label: "Title" },
} as const;

/** Where a hit opens: the notes page, on the right tab, scrolled to that line. */
function hitLink(roomCode: string, h: SearchHit) {
  const base = `/m/${roomCode}/notes`;
  if (h.kind === "transcript") return `${base}?tab=transcript&line=${h.id}`;
  if (h.kind === "chat") return `${base}?tab=chat&msg=${h.id}`;
  return base;
}

export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const [text, setText] = useState(q);
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // the URL follows the box after a short pause (so Back and sharing work)
  useEffect(() => {
    const t = setTimeout(() => setParams(text.trim() ? { q: text.trim() } : {}, { replace: true }), text.trim() ? 300 : 0);
    return () => clearTimeout(t);
  }, [text, setParams]);

  useEffect(() => {
    if (q.length < 2) {
      setResults(null);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    setError("");
    searchApi
      .search(q, ctrl.signal)
      .then(setResults)
      .catch((err) => !ctrl.signal.aborted && setError(errorMessage(err)))
      .finally(() => !ctrl.signal.aborted && setLoading(false));
    return () => ctrl.abort();
  }, [q]);

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 px-4 py-8 sm:px-6 lg:px-10">
      <div className="space-y-3">
        <Breadcrumbs items={[{ label: "Home", to: "/dashboard" }, { label: "Search" }]} />
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Search</h1>
          <p className="text-muted-foreground">Find what was said, written in the chat, or in the notes of any meeting you can see.</p>
        </div>
      </div>

      <div className="relative max-w-3xl">
        <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input
          type="search"
          autoFocus
          aria-label="Search meetings"
          placeholder="Try “budget”, “venue”, or someone's name…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="h-14 w-full rounded-2xl border border-border bg-card pr-12 pl-12 text-base placeholder:text-muted-foreground focus-visible:border-brand focus-visible:outline-none [&::-webkit-search-cancel-button]:hidden"
        />
        {text && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => setText("")}
            className="absolute top-1/2 right-3 flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      {error ? (
        <div role="alert" className="flex max-w-3xl items-center gap-2 rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="size-4" /> {error}
        </div>
      ) : q.length < 2 ? (
        <p className="text-sm text-muted-foreground">Type at least 2 letters. Words match from the start, so “bud” finds “budget”.</p>
      ) : loading && !results ? (
        <div role="status" aria-label="Searching" className="max-w-3xl space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28 rounded-3xl" />
          ))}
        </div>
      ) : results && results.length === 0 ? (
        <div className="flex max-w-3xl flex-col items-center gap-2 rounded-3xl border border-border bg-card p-10 text-center">
          <SearchX className="size-8 text-muted-foreground" />
          <p className="font-semibold">Nothing found for “{q}”</p>
          <p className="text-sm text-muted-foreground">Captions must be on during a meeting for what's said to be searchable.</p>
        </div>
      ) : (
        <>
          {results && (
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {results.length} {results.length === 1 ? "meeting" : "meetings"}
            </p>
          )}
          <ul className="max-w-3xl space-y-3">
            {results?.map((r) => (
              <li key={r.roomCode} className="rounded-3xl border border-border bg-card p-4 sm:p-5">
                <Link to={`/m/${r.roomCode}/notes`} className="group block focus-visible:outline-none">
                  <p className="truncate text-lg font-semibold group-hover:underline group-focus-visible:underline">{r.title}</p>
                  <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
                    {fmtDay(r)}
                    {r.teamName && (
                      <span className="inline-flex items-center gap-1">
                        · <Users className="size-3.5" aria-hidden /> {r.teamName}
                      </span>
                    )}
                  </p>
                </Link>
                {r.hits.some((h) => h.kind !== "title") && (
                  <ul className="mt-3 space-y-1">
                    {r.hits
                      .filter((h) => h.kind !== "title")
                      .map((h, i) => {
                        const K = KIND[h.kind];
                        return (
                          <li key={h.id ?? i}>
                            <Link
                              to={hitLink(r.roomCode, h)}
                              className="flex gap-3 rounded-xl px-2 py-2 text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
                            >
                              <K.icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-label={K.label} />
                              <span className="min-w-0">
                                {h.who && (
                                  <span className="font-medium">
                                    {h.who} <span className="font-normal text-muted-foreground">{fmtTime(h.at)}</span>{" "}
                                  </span>
                                )}
                                <span className="text-muted-foreground">
                                  <Snippet text={h.snippet} />
                                </span>
                              </span>
                            </Link>
                          </li>
                        );
                      })}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
