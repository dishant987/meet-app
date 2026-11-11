import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { ArrowUp, Loader2, MessageCircleQuestion } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, askApi, errorMessage, type AiAnswer } from "@/lib/api";

const IDEAS = ["What did we decide?", "What are the action items and who owns them?", "Summarize this in 3 short points"];

/** Ask questions about this meeting; answers come only from its transcript, chat and notes. */
export function AskAI({ roomCode }: { roomCode: string }) {
  const [history, setHistory] = useState<AiAnswer[] | null>(null);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; limit: boolean } | null>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    askApi
      .history(roomCode)
      .then(setHistory)
      .catch((err) => (setHistory([]), setError({ text: errorMessage(err), limit: false })));
  }, [roomCode]);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); // (newer browsers return a promise: keep it out of the effect's return)
  }, [history?.length, busy]);

  async function ask(q: string) {
    const text = q.trim();
    if (text.length < 3 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const a = await askApi.ask(roomCode, text);
      setHistory((h) => [...(h ?? []), a]);
      setQuestion("");
    } catch (err) {
      setError({ text: errorMessage(err), limit: err instanceof ApiError && err.code === "PLAN_LIMIT" });
    } finally {
      setBusy(false);
    }
  }
  const submit = (e: FormEvent) => (e.preventDefault(), void ask(question));

  return (
    <section aria-label="Ask AI about this meeting" className="space-y-4">
      <div className="rounded-3xl border border-border bg-card p-4 sm:p-5">
        {history === null ? (
          <div role="status" aria-label="Loading questions" className="space-y-3">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-16" />
          </div>
        ) : history.length === 0 && !busy ? (
          <div className="space-y-3 text-center">
            <MessageCircleQuestion className="mx-auto size-7 text-brand-ink" aria-hidden />
            <p className="font-semibold">Ask anything about this meeting</p>
            <p className="text-sm text-muted-foreground">Answers come only from what was said, the chat and the notes. AI can make mistakes.</p>
            <div className="flex flex-wrap justify-center gap-2 pt-1">
              {IDEAS.map((i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => ask(i)}
                  className="rounded-xl border border-border px-3 py-1.5 text-sm hover:border-brand focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
                >
                  {i}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <ol className="space-y-4" aria-live="polite">
            {history.map((a) => (
              <li key={a.id} className="space-y-2">
                <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-brand px-3 py-2 text-sm text-ink-950">{a.question}</p>
                <p className="w-fit max-w-[92%] rounded-2xl rounded-bl-md bg-muted px-3 py-2 text-[15px] leading-relaxed whitespace-pre-wrap">{a.answer}</p>
              </li>
            ))}
            {busy && (
              <li className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
                <Loader2 className="size-4 animate-spin" /> Reading the meeting…
              </li>
            )}
          </ol>
        )}
        <div ref={end} />
      </div>

      {error && (
        <p role="alert" className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error.text}{" "}
          {error.limit && (
            <Link to="/billing" className="font-semibold underline underline-offset-4">
              See plans
            </Link>
          )}
        </p>
      )}

      <form onSubmit={submit} className="relative">
        <label htmlFor="ask-q" className="sr-only">
          Your question
        </label>
        <input
          id="ask-q"
          value={question}
          maxLength={500}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="e.g. What did Ravi agree to do?"
          className="h-13 w-full rounded-2xl border border-border bg-card pr-14 pl-4 placeholder:text-muted-foreground focus-visible:border-brand focus-visible:outline-none"
        />
        <button
          type="submit"
          aria-label="Ask"
          disabled={busy || question.trim().length < 3}
          className="absolute top-1/2 right-2 flex size-9 -translate-y-1/2 items-center justify-center rounded-xl bg-brand text-ink-950 transition hover:brightness-95 focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none disabled:bg-muted disabled:text-muted-foreground"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
        </button>
      </form>
    </section>
  );
}
