import { useEffect, useState } from "react";
import { Link, Navigate, useParams, useSearchParams } from "react-router";
import { Loader2, Repeat } from "lucide-react";
import { cn } from "cn";
import { Shell, primary } from "@/pages/PasswordPages";
import { errorMessage, meetingsApi, type Answer, type InviteReply } from "@/lib/api";

/** Series link (/s/:id) from a recurring invite: opens whichever meeting of the series is current. */
export function SeriesPage() {
  const { seriesId = "" } = useParams();
  const [state, setState] = useState<{ roomCode?: string; error?: string }>({});
  useEffect(() => {
    meetingsApi
      .seriesCurrent(seriesId)
      .then((r) => setState({ roomCode: r.roomCode }))
      .catch((err) => setState({ error: errorMessage(err) }));
  }, [seriesId]);

  if (state.roomCode) return <Navigate to={`/m/${state.roomCode}`} replace />;
  if (state.error)
    return (
      <Shell title="Can't open this meeting" subtitle={state.error}>
        <Link to="/" className={primary}>Go to MeetApp</Link>
      </Shell>
    );
  return (
    <Shell title="Opening your meeting" subtitle="Finding this week's meeting...">
      <Loader2 className="size-5 animate-spin text-muted-foreground" aria-label="Loading" />
    </Shell>
  );
}

const ANSWERS: { value: Answer; label: string; done: string }[] = [
  { value: "YES", label: "Yes", done: "You're going" },
  { value: "MAYBE", label: "Maybe", done: "You might go" },
  { value: "NO", label: "No", done: "You're not going" },
];
const fromLink = (a: string | null): Answer | undefined => (a === "yes" ? "YES" : a === "maybe" ? "MAYBE" : a === "no" ? "NO" : undefined);

/** Guest's Yes / Maybe / No from the invite email. No account needed; they can change the answer here. */
export function ReplyPage() {
  const [params] = useSearchParams();
  const token = params.get("t") ?? "";
  const [info, setInfo] = useState<InviteReply | null>(null);
  const [error, setError] = useState(token ? "" : "This link is missing its code. Use the buttons in your invite email.");
  const [busy, setBusy] = useState<Answer | null>(null);

  useEffect(() => {
    if (!token) return;
    meetingsApi
      .reply(token, fromLink(params.get("a")))
      .then(setInfo)
      .catch((err) => setError(errorMessage(err)));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- answer once, from the link
  }, [token]);

  async function answer(a: Answer) {
    setBusy(a);
    try {
      setInfo(await meetingsApi.reply(token, a));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  if (error)
    return (
      <Shell title="Can't save your answer" subtitle={error}>
        <Link to="/" className={primary}>Go to MeetApp</Link>
      </Shell>
    );
  if (!info)
    return (
      <Shell title="Saving your answer" subtitle="One moment...">
        <Loader2 className="size-5 animate-spin text-muted-foreground" aria-label="Loading" />
      </Shell>
    );

  const when = info.scheduledFor
    ? new Date(info.scheduledFor).toLocaleString(undefined, { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" })
    : "";
  const current = ANSWERS.find((a) => a.value === info.answer);
  return (
    <Shell title={current ? `${current.done}` : "Are you going?"} subtitle={current ? "Thanks, the host can see your answer. You can change it any time." : "Let the host know."}>
      <div className="space-y-1 rounded-2xl border border-border bg-card p-4">
        <p className="font-semibold">{info.title}</p>
        {when && <p className="text-sm text-muted-foreground">{info.recurrence ? `Next: ${when}` : when}</p>}
        {info.recurrence && (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Repeat className="size-3.5" aria-hidden /> Repeats {info.recurrence === "DAILY" ? "daily" : "weekly"}; your answer is for all of them
          </p>
        )}
        {info.hostName && <p className="text-sm text-muted-foreground">Host: {info.hostName}</p>}
      </div>
      <div role="group" aria-label="Your answer" className="grid grid-cols-3 gap-2">
        {ANSWERS.map((a) => (
          <button
            key={a.value}
            type="button"
            aria-pressed={info.answer === a.value}
            disabled={!!busy}
            onClick={() => answer(a.value)}
            className={cn(
              "flex h-11 items-center justify-center gap-1.5 rounded-2xl border text-sm font-semibold transition focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none disabled:opacity-60",
              info.answer === a.value ? "border-brand bg-brand text-ink-950" : "border-border hover:border-brand",
            )}
          >
            {busy === a.value && <Loader2 className="size-4 animate-spin" />} {a.label}
          </button>
        ))}
      </div>
      <Link to={info.link} className={primary}>Open the meeting link</Link>
    </Shell>
  );
}
