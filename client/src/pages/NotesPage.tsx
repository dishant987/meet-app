import { useCallback, useEffect, useRef, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Link, useParams, useSearchParams } from "react-router";
import { toast } from "sonner";
import {
  AlertTriangle,
  Calendar,
  Check,
  CircleHelp,
  Clock,
  Copy,
  Download,
  FileDown,
  FileText,
  Gavel,
  ListChecks,
  Loader2,
  MessageSquareOff,
  MicOff,
  Pencil,
  Printer,
  Mail,
  RefreshCw,
  AlignLeft,
  PenLine,
  Users,
} from "lucide-react";
import { cn } from "cn";
import { AskAI } from "@/components/notes/AskAI";
import { Logo } from "@/components/Logo";
import { UserMenu } from "@/components/UserMenu";
import { Avatar } from "@/components/call/Avatar";
import { ApiError, errorMessage, meetingsApi, type NotesContent, type NotesResponse, type TranscriptRow, type ChatRow } from "@/lib/api";
import { accessHeaders, getHostKey } from "@/lib/meetingAccess";
import { downloadTranscriptText, downloadTranscriptWord, downloadWord, toMarkdown, type NotesDoc, type TranscriptMeta } from "@/lib/notesExport";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { useAuth } from "@/lib/auth";
import { NotesEditor } from "@/components/notes/NotesEditor";
import { Recordings } from "@/components/notes/Recordings";

const fmtTime = (d: string) => new Date(d).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

function dateLine(m: NotesResponse["meeting"]) {
  const start = m.startedAt ?? m.createdAt;
  if (!start) return "";
  const day = new Date(start).toLocaleDateString([], { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  if (!m.endedAt) return day;
  const mins = Math.max(1, Math.round((+new Date(m.endedAt) - +new Date(start)) / 60000));
  const dur = mins >= 60 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${mins} min`;
  return `${day} · ${fmtTime(start)}–${fmtTime(m.endedAt)} · ${dur}`;
}

/** Centered message card used for every non-ready state. */
function StateCard({ icon, title, children }: { icon: React.ReactNode; title: string; children?: React.ReactNode }) {
  return (
    <div className="mx-auto mt-6 flex max-w-lg flex-col items-center gap-3 rounded-3xl border border-border bg-card p-8 text-center">
      {icon}
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </div>
  );
}

function Section({ icon, title, count, children }: { icon: React.ReactNode; title: string; count?: number; children: React.ReactNode }) {
  return (
    <section className="break-inside-avoid rounded-3xl border border-border bg-card p-5 sm:p-6 print:rounded-none print:border-0 print:p-0 print:py-3">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
        {icon}
        {title}
        {count !== undefined && <span className="rounded-md bg-muted px-1.5 text-xs">{count}</span>}
      </h2>
      {children}
    </section>
  );
}

function NotesView({ n }: { n: NotesContent }) {
  return (
    <div className="grid gap-4 print:block">
      <Section icon={<AlignLeft className="size-4 text-brand" />} title="Summary">
        <p className="text-base leading-relaxed sm:text-lg">{n.summary || "—"}</p>
      </Section>

      {n.actionItems.length > 0 && (
        <Section icon={<ListChecks className="size-4" />} title="Action items" count={n.actionItems.length}>
          <ol className="divide-y divide-border">
            {n.actionItems.map((a, i) => (
              <li key={i} className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:gap-4">
                <span className="flex flex-1 gap-3">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border border-border text-[11px] font-semibold text-muted-foreground">
                    {i + 1}
                  </span>
                  <span>{a.task}</span>
                </span>
                <span className="flex shrink-0 gap-2 pl-8 text-xs sm:pl-0">
                  <span className={cn("rounded-lg px-2 py-1", a.owner ? "bg-brand/25 font-medium" : "bg-muted text-muted-foreground")}>
                    {a.owner ?? "No owner"}
                  </span>
                  {a.dueDate && (
                    <span className="flex items-center gap-1 rounded-lg bg-muted px-2 py-1">
                      <Calendar className="size-3" aria-hidden /> {a.dueDate}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ol>
        </Section>
      )}

      <div className="grid gap-4 md:grid-cols-2 print:block">
        {n.decisions.length > 0 && (
          <Section icon={<Gavel className="size-4" />} title="Decisions" count={n.decisions.length}>
            <ul className="space-y-2">
              {n.decisions.map((d, i) => (
                <li key={i} className="flex gap-2.5">
                  <Check className="mt-1 size-4 shrink-0 text-emerald-500" aria-hidden />
                  {d}
                </li>
              ))}
            </ul>
          </Section>
        )}
        {n.openQuestions.length > 0 && (
          <Section icon={<CircleHelp className="size-4" />} title="Open questions" count={n.openQuestions.length}>
            <ul className="space-y-2">
              {n.openQuestions.map((q, i) => (
                <li key={i} className="flex gap-2.5">
                  <span className="mt-0.5 font-semibold text-amber-500" aria-hidden>
                    ?
                  </span>
                  {q}
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>

      {n.keyPoints.length > 0 && (
        <Section icon={<FileText className="size-4" />} title="Key points" count={n.keyPoints.length}>
          <ul className="list-disc space-y-1.5 pl-5 marker:text-muted-foreground">
            {n.keyPoints.map((k, i) => (
              <li key={i}>{k}</li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

/** Shaped like the notes page: breadcrumb, title, people, tabs, summary and to-do cards. */
function NotesSkeleton() {
  return (
    <div role="status" aria-label="Loading notes" className="space-y-6">
      <div className="space-y-3">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-10 w-2/3 max-w-md" />
        <Skeleton className="h-4 w-72 max-w-full" />
        <div className="flex flex-wrap gap-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-11 w-32 rounded-2xl" />
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-11 w-56 rounded-2xl" />
        <Skeleton className="hidden h-11 w-48 rounded-2xl sm:block" />
      </div>
      <Skeleton className="h-40 rounded-3xl" />
      <Skeleton className="h-56 rounded-3xl" />
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-36 rounded-3xl" />
        <Skeleton className="h-36 rounded-3xl" />
      </div>
    </div>
  );
}

/** Scrolls to the row a search result pointed at (?line= / ?msg=) and marks it for a moment. */
function useJumpTo(id: string | null, ready: boolean) {
  useEffect(() => {
    if (!id || !ready) return;
    const el = document.getElementById(`row-${id}`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [id, ready]);
}
const jumpCls = (on: boolean) => (on ? "bg-brand/20 ring-1 ring-brand/50" : "");

function Transcript({ roomCode, headers, meta, focus }: { roomCode: string; headers: Record<string, string>; meta: TranscriptMeta; focus: string | null }) {
  const [rows, setRows] = useState<TranscriptRow[] | null>(null);
  useJumpTo(focus, !!rows);
  const [error, setError] = useState("");
  useEffect(() => {
    meetingsApi
      .transcript(roomCode, headers)
      .then(setRows)
      .catch((e) => setError(errorMessage(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- headers come from localStorage; load once
  }, [roomCode]);

  if (error) return <StateCard icon={<AlertTriangle className="size-8 text-amber-500" />} title="Couldn't load the transcript">{error}</StateCard>;
  if (!rows)
    return (
      <div role="status" aria-label="Loading transcript" className="space-y-4 rounded-3xl border border-border bg-card p-4">
        {[70, 90, 55, 80, 65].map((w, i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="size-9 shrink-0 rounded-xl" />
            <div className="flex-1 space-y-2 pt-1">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-3.5" style={{ width: `${w}%` }} />
            </div>
          </div>
        ))}
      </div>
    );
  if (rows.length === 0) return <StateCard icon={<MicOff className="size-8 text-muted-foreground" />} title="No transcript" />;
  const dl = "flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium hover:border-brand focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none";
  return (
    <>
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 print:hidden">
      <p className="text-sm text-muted-foreground">
        {rows.length} lines · {new Set(rows.map((r) => r.speakerName)).size} speakers
      </p>
      <div className="flex gap-2">
        <button type="button" className={dl} onClick={() => downloadTranscriptText(meta, rows)}>
          <Download className="size-4" aria-hidden /> Text
        </button>
        <button type="button" className={dl} onClick={() => downloadTranscriptWord(meta, rows).catch(() => toast.error("Couldn't create the Word file."))}>
          <FileText className="size-4" aria-hidden /> Word
        </button>
      </div>
    </div>
    <ol className="space-y-1 rounded-3xl border border-border bg-card p-3 sm:p-4">
      {rows.map((r, i) => {
        const sameSpeaker = rows[i - 1]?.speakerName === r.speakerName;
        return (
          <li key={r.id} id={`row-${r.id}`} className={cn("flex scroll-mt-24 gap-3 rounded-xl px-2 py-1.5", !sameSpeaker && "mt-2 first:mt-0", jumpCls(r.id === focus))}>
            <span className="w-9 shrink-0">{!sameSpeaker && <Avatar name={r.speakerName} size="sm" />}</span>
            <div className="min-w-0 flex-1">
              {!sameSpeaker && (
                <p className="text-sm font-semibold">
                  {r.speakerName} <span className="font-normal text-muted-foreground">{fmtTime(r.spokenAt)}</span>
                </p>
              )}
              <p className="text-[15px] leading-relaxed">{r.text}</p>
            </div>
          </li>
        );
      })}
    </ol>
    </>
  );
}

/** Chat messages from the call, in order. */
function ChatLog({ roomCode, headers, focus = null }: { roomCode: string; headers: Record<string, string>; focus?: string | null }) {
  const [rows, setRows] = useState<ChatRow[] | null>(null);
  useJumpTo(focus, !!rows);
  const [error, setError] = useState("");
  useEffect(() => {
    meetingsApi
      .chat(roomCode, headers)
      .then(setRows)
      .catch((e) => setError(errorMessage(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- headers come from localStorage; load once
  }, [roomCode]);

  if (error) return <StateCard icon={<AlertTriangle className="size-8 text-amber-500" />} title="Couldn't load the chat">{error}</StateCard>;
  if (!rows)
    return (
      <div role="status" aria-label="Loading chat" className="space-y-4 rounded-3xl border border-border bg-card p-4">
        {[60, 85, 45].map((w, i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="size-9 shrink-0 rounded-xl" />
            <div className="flex-1 space-y-2 pt-1">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-3.5" style={{ width: `${w}%` }} />
            </div>
          </div>
        ))}
      </div>
    );
  if (rows.length === 0)
    return <StateCard icon={<MessageSquareOff className="size-8 text-muted-foreground" />} title="No chat messages">Nobody wrote in the chat during this meeting.</StateCard>;
  return (
    <ol className="space-y-1 rounded-3xl border border-border bg-card p-3 sm:p-4">
      {rows.map((r, i) => {
        const same = rows[i - 1]?.senderName === r.senderName;
        return (
          <li key={r.id} id={`row-${r.id}`} className={cn("flex scroll-mt-24 gap-3 rounded-xl px-2 py-1.5", !same && "mt-2 first:mt-0", jumpCls(r.id === focus))}>
            <span className="w-9 shrink-0">{!same && <Avatar name={r.senderName} size="sm" />}</span>
            <div className="min-w-0 flex-1">
              {!same && (
                <p className="text-sm font-semibold">
                  {r.senderName} <span className="font-normal text-muted-foreground">{fmtTime(r.sentAt)}</span>
                </p>
              )}
              <p className="text-[15px] leading-relaxed break-words whitespace-pre-wrap">{r.text}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

type Tab = "notes" | "transcript" | "chat" | "ask";

export function NotesPage() {
  const { roomCode = "" } = useParams();
  const { user } = useAuth();
  const [params] = useSearchParams();
  const focusLine = params.get("line");
  const focusMsg = params.get("msg");
  const [data, setData] = useState<NotesResponse | null>(null);
  const [error, setError] = useState<{ title: string; message: string } | null>(null);
  const [tab, setTab] = useState<Tab>(() => {
    const t = params.get("tab");
    return t === "transcript" || t === "chat" || t === "ask" ? t : "notes";
  });
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const hostKey = getHostKey(roomCode);
  const [headers] = useState(() => accessHeaders(roomCode));
  const loaded = useRef(false);

  const load = useCallback(async () => {
    try {
      setData(await meetingsApi.notes(roomCode, headers));
      loaded.current = true;
      setError(null);
    } catch (e) {
      const forbidden = e instanceof ApiError && e.status === 403;
      const notFound = e instanceof ApiError && e.status === 404;
      // A hiccup while we already show something: keep polling quietly instead of replacing the page.
      if (!forbidden && !notFound && loaded.current) return;
      setError({
        title: forbidden ? "These notes are private" : e instanceof ApiError && e.status === 404 ? "Meeting not found" : "Couldn't load the notes",
        message: forbidden ? "Only people who joined this meeting, on this device, can open its notes." : errorMessage(e),
      });
    }
  }, [roomCode, headers]);

  // Load, then poll every 3s while notes are being written or the meeting is still going.
  const waiting = !data || !data.notes || data.notes.status === "PENDING";
  useEffect(() => {
    const t = setTimeout(load, 0); // first load
    return () => clearTimeout(t);
  }, [load]);
  useEffect(() => {
    if (!waiting || error) return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [waiting, error, load]);

  // Host: email the (possibly edited) notes to everyone who joined while signed in.
  const [emailing, setEmailing] = useState(false);
  async function emailAttendees() {
    setEmailing(true);
    try {
      const { sent } = await meetingsApi.emailNotes(roomCode, hostKey);
      toast.success(sent ? `Notes emailed to ${sent} ${sent === 1 ? "person" : "people"}` : "Nobody to email: only people who joined while signed in get notes by email.");
      await load();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setEmailing(false);
    }
  }

  async function regenerate() {
    try {
      await meetingsApi.regenerateNotes(roomCode, hostKey);
      await load();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  async function save(content: NotesContent) {
    const notes = await meetingsApi.updateNotes(roomCode, hostKey, content); // errors shown by the editor
    setData((d) => (d ? { ...d, notes } : d));
    setEditing(false);
    toast.success("Notes saved");
  }

  const notes = data?.notes;
  const doc: NotesDoc | null =
    data && notes?.status === "READY"
      ? { ...notes, meetingTitle: data.meeting.title, dateLine: dateLine(data.meeting), attendees: data.attendees }
      : null;

  async function copy() {
    if (!doc) return;
    try {
      await navigator.clipboard.writeText(toMarkdown(doc));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy to the clipboard.");
    }
  }

  const actionBtn =
    "flex h-10 items-center gap-2 rounded-xl border border-border bg-card px-3 text-sm font-medium transition hover:border-brand focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none disabled:opacity-50 [&_svg]:size-4";

  return (
    <div className="min-h-dvh bg-background bg-[radial-gradient(ellipse_at_top_right,oklch(0.9_0.19_125/0.1),transparent_45%)] print:bg-none">
      <header className="flex items-center justify-between gap-3 px-4 py-4 sm:px-8 print:hidden">
        <Link to="/" aria-label="MeetApp home" className="rounded-xl focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none">
          <Logo />
        </Link>
        <div className="flex flex-wrap items-center justify-end gap-2">
        {doc && !editing && (
          <>
            <button type="button" onClick={copy} className={actionBtn} aria-label="Copy notes as text">
              {copied ? <Check className="text-brand" /> : <Copy />}
              <span className="hidden sm:inline">{copied ? "Copied" : "Copy"}</span>
            </button>
            <button
              type="button"
              onClick={() => downloadWord(doc).catch(() => toast.error("Couldn't create the Word file."))}
              className={actionBtn}
              aria-label="Download as Word"
            >
              <FileDown />
              <span className="hidden sm:inline">Word</span>
            </button>
            <button type="button" onClick={() => print()} className={actionBtn} aria-label="Print or save as PDF">
              <Printer />
              <span className="hidden sm:inline">PDF</span>
            </button>
          </>
        )}
          <UserMenu />
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl px-4 pb-16 sm:px-8 print:max-w-none print:px-0">
        {error ? (
          <StateCard icon={<AlertTriangle className="size-8 text-amber-500" />} title={error.title}>
            <p className="text-sm text-muted-foreground">{error.message}</p>
            <Link to="/" className="text-sm font-medium underline underline-offset-4">
              Back to home
            </Link>
          </StateCard>
        ) : !data ? (
          <NotesSkeleton />
        ) : (
          <>
            {/* heading */}
            <div className="mb-6 space-y-3">
              <div className="flex flex-wrap items-center gap-2 print:hidden">
                <Breadcrumbs
                  items={
                    user
                      ? [{ label: "Home", to: "/dashboard" }, { label: "Meetings", to: "/meetings" }, { label: data.meeting.title }]
                      : [{ label: "Home", to: "/" }, { label: "Meeting notes" }]
                  }
                />
                {notes?.edited && <span className="mb-3 rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">Edited</span>}
              </div>
              <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
                {(notes?.status === "READY" && notes.title) || data.meeting.title}
              </h1>
              <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Clock className="size-4" aria-hidden /> {dateLine(data.meeting)}
                </span>
                <span className="flex items-center gap-1.5">
                  <Users className="size-4" aria-hidden /> {data.attendees.length} {data.attendees.length === 1 ? "person" : "people"}
                </span>
              </p>
              <ul className="flex flex-wrap gap-2" aria-label="Attendees">
                {data.attendees.map((a) => (
                  <li key={a} className="flex items-center gap-2 rounded-xl border border-border bg-card py-1 pr-3 pl-1 text-sm">
                    <Avatar name={a} size="sm" />
                    {a}
                  </li>
                ))}
              </ul>
            </div>

            {/* tabs */}
            {notes?.status === "READY" && !editing && (
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3 print:hidden">
                <div role="tablist" className="flex max-w-full overflow-x-auto rounded-2xl bg-muted p-1">
                  {(["notes", "transcript", "chat", ...(user?.emailVerified ? (["ask"] as const) : [])] as const).map((t) => (
                    <button
                      key={t}
                      role="tab"
                      type="button"
                      aria-selected={tab === t}
                      onClick={() => setTab(t)}
                      className={cn(
                        "shrink-0 rounded-xl px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none",
                        tab === t ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {t === "notes" ? "Notes" : t === "transcript" ? `Transcript · ${data.lineCount}` : t === "chat" ? `Chat · ${data.chatCount}` : "Ask AI"}
                    </button>
                  ))}
                </div>
                {data.isHost && tab === "notes" && (
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setEditing(true)} className={actionBtn}>
                      <Pencil /> <span className="hidden sm:inline">Edit</span>
                    </button>
                    <button
                      type="button"
                      onClick={emailAttendees}
                      disabled={emailing}
                      className={actionBtn}
                      aria-label="Email the notes to attendees"
                      title={notes?.emailedAt ? `Last emailed ${new Date(notes.emailedAt).toLocaleString()}` : "Not emailed yet"}
                    >
                      {emailing ? <Loader2 className="animate-spin" /> : <Mail />} <span className="hidden sm:inline">Email</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => confirm("Write the notes again from the transcript? Your edits will be replaced.") && regenerate()}
                      className={actionBtn}
                      aria-label="Write the notes again"
                    >
                      <RefreshCw /> <span className="hidden sm:inline">Redo</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {data.meeting.status === "ENDED" && !editing && tab === "notes" && <Recordings roomCode={roomCode} headers={headers} isHost={data.isHost} />}

            {/* body */}
            {!notes && data.meeting.status !== "ENDED" ? (
              <StateCard icon={<Clock className="size-8 text-muted-foreground" />} title="The meeting is still going">
                <p className="text-sm text-muted-foreground">
                  Notes are written when the meeting ends — when the host ends it or everyone leaves. This page updates by itself.
                </p>
                <Link to={`/m/${roomCode}`} className="text-sm font-medium underline underline-offset-4">
                  Back to the meeting
                </Link>
              </StateCard>
            ) : !notes || notes.status === "PENDING" ? (
              <StateCard icon={<PenLine className="size-8 animate-pulse text-brand" />} title="Writing your notes…">
                <p className="text-sm text-muted-foreground">
                  Reading {data.lineCount} caption {data.lineCount === 1 ? "line" : "lines"} and pulling out the summary, decisions and
                  action items. This usually takes under a minute.
                </p>
                <div className="mt-2 h-1.5 w-48 overflow-hidden rounded-full bg-muted">
                  <div className="h-full w-1/3 animate-[slide_1.4s_ease-in-out_infinite] rounded-full bg-brand" />
                </div>
              </StateCard>
            ) : notes.status === "EMPTY" ? (
              <>
                <StateCard icon={<MicOff className="size-8 text-muted-foreground" />} title="Nothing to summarize">
                  <p className="text-sm text-muted-foreground">
                    No captions were recorded in this meeting, so there's no transcript to write notes from. Next time, turn on captions
                    (the CC button) while you talk.
                  </p>
                </StateCard>
                {data.chatCount > 0 && (
                  <section aria-label="Chat" className="mt-8">
                    <h2 className="mb-3 text-lg font-semibold">Chat · {data.chatCount}</h2>
                    <ChatLog roomCode={roomCode} headers={headers} />
                  </section>
                )}
              </>
            ) : notes.status === "FAILED" ? (
              <StateCard icon={<AlertTriangle className="size-8 text-amber-500" />} title="Couldn't write the notes">
                <p className="text-sm text-muted-foreground">
                  The AI services didn't respond. The transcript is saved, so nothing is lost.
                </p>
                {data.isHost ? (
                  <button type="button" onClick={regenerate} className={cn(actionBtn, "border-brand")}>
                    <RefreshCw /> Try again
                  </button>
                ) : (
                  <p className="text-sm text-muted-foreground">Ask the person who started the meeting to try again.</p>
                )}
              </StateCard>
            ) : editing ? (
              <NotesEditor initial={notes} onCancel={() => setEditing(false)} onSave={save} />
            ) : tab === "notes" ? (
              <>
                <NotesView n={notes} />
                <p className="mt-6 text-center text-xs text-muted-foreground">
                  Written by AI ({notes.provider ?? "unknown"}) from {data.lineCount} caption lines. AI can make mistakes — check
                  important details against the transcript.
                </p>
              </>
            ) : tab === "chat" ? (
              <ChatLog roomCode={roomCode} headers={headers} focus={focusMsg} />
            ) : tab === "ask" ? (
              <AskAI roomCode={roomCode} />
            ) : (
              <Transcript
                roomCode={roomCode}
                headers={headers}
                focus={focusLine}
                meta={{ meetingTitle: data.meeting.title, dateLine: dateLine(data.meeting), attendees: data.attendees }}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}
