import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { ArrowRight, Captions, Loader2, NotebookPen, Plus, Video } from "lucide-react";
import { errorMessage, meetingsApi } from "@/lib/api";
import { check, joinCodeForm } from "@/lib/validation";
import { Logo } from "@/components/Logo";
import { UserMenu } from "@/components/UserMenu";
import { saveHostKey } from "@/lib/meetingAccess";

const FEATURES = [
  { icon: Video, title: "One-click calls", text: "Start, share a link, talk. No install." },
  { icon: Captions, title: "Live captions", text: "Read along as people speak." },
  { icon: NotebookPen, title: "AI meeting notes", text: "Summary, decisions and to-dos, emailed to you." },
];

export function HomePage() {
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState("");

  async function startMeeting() {
    setCreating(true);
    try {
      const meeting = await meetingsApi.create();
      saveHostKey(meeting.roomCode, meeting.hostKey); // this browser can end the meeting for everyone
      navigate(`/m/${meeting.roomCode}`);
    } catch (err) {
      toast.error(errorMessage(err));
      setCreating(false);
    }
  }

  function joinMeeting(e: FormEvent) {
    e.preventDefault();
    const result = check(joinCodeForm, { code });
    if (result.errors) return setCodeError(result.errors.code!);
    navigate(`/m/${result.data.code}`);
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background bg-[radial-gradient(ellipse_at_top_right,oklch(0.9_0.19_125/0.12),transparent_50%)]">
      <header className="flex items-center justify-between gap-3 px-4 py-4 sm:px-8">
        <Logo />
        <UserMenu />
      </header>

      <main className="flex flex-1 items-center px-4 pb-16 sm:px-8">
        <div className="mx-auto w-full max-w-2xl space-y-10">
          <div className="space-y-4">
            <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
              Meetings that{" "}
              <span className="relative whitespace-nowrap">
                {/* marker-pen highlight behind the lower half of the words */}
                <span className="absolute inset-x-[-0.08em] bottom-[0.06em] h-[0.38em] -rotate-1 rounded-md bg-brand/55" aria-hidden />
                <span className="relative">take notes</span>
              </span>{" "}
              for you.
            </h1>
            <p className="max-w-lg text-base text-muted-foreground sm:text-lg">
              Start a call in one click. Live captions while you talk, clean notes when you're done.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={startMeeting}
                disabled={creating}
                className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-brand px-5 font-semibold text-ink-950 transition hover:brightness-95 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none active:scale-[0.98] disabled:opacity-60"
              >
                {creating ? <Loader2 className="size-5 animate-spin" /> : <Plus className="size-5" />}
                New meeting
              </button>

              <form onSubmit={joinMeeting} className="flex flex-1 gap-2" noValidate>
                <input
                  aria-label="Meeting code or link"
                  aria-invalid={!!codeError}
                  aria-describedby={codeError ? "code-error" : undefined}
                  placeholder="Code or link"
                  className="h-12 min-w-0 flex-1 rounded-2xl border border-border bg-card px-4 placeholder:text-muted-foreground focus-visible:border-brand focus-visible:outline-none aria-invalid:border-destructive"
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value);
                    setCodeError("");
                  }}
                />
                <button
                  type="submit"
                  disabled={!code.trim()}
                  aria-label="Join meeting"
                  className="flex size-12 shrink-0 items-center justify-center rounded-2xl border border-border bg-card transition hover:border-brand focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none disabled:opacity-40"
                >
                  <ArrowRight className="size-5" />
                </button>
              </form>
            </div>
            {codeError && (
              <p id="code-error" role="alert" className="text-sm text-destructive">
                {codeError}
              </p>
            )}
          </div>

          <ul className="grid gap-3 sm:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <li key={title} className="rounded-2xl border border-border bg-card/60 p-4">
                <span className="mb-3 flex size-9 items-center justify-center rounded-xl bg-brand/20 text-foreground">
                  <Icon className="size-4.5" aria-hidden />
                </span>
                <p className="text-sm font-medium">{title}</p>
                <p className="text-sm text-muted-foreground">{text}</p>
              </li>
            ))}
          </ul>
        </div>
      </main>
    </div>
  );
}
