import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router";
import { Captions, Loader2, NotebookPen, Video } from "lucide-react";
import { Logo } from "@/components/Logo";
import { useAuth } from "@/lib/auth";
import { errorMessage, fieldErrors as formFieldErrors } from "@/lib/api";
import { GoogleButton, googleEnabled } from "@/components/GoogleButton";

const field =
  "h-12 w-full rounded-2xl border border-border bg-card px-4 placeholder:text-muted-foreground focus-visible:border-brand focus-visible:outline-none aria-invalid:border-destructive";

/** Only allow redirects inside this app (no "?next=https://evil.com"). */
function safeNext(next: string | null) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/meetings";
}

export function AuthPage({ mode }: { mode: "signin" | "signup" }) {
  const { user, loading, login, register, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const signup = mode === "signup";

  if (!loading && user) return <Navigate to={next} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setFieldErrors({});
    try {
      if (signup) await register(name, email, password);
      else await login(email, password);
      navigate(next, { replace: true });
    } catch (err) {
      const fields = formFieldErrors(err);
      if (fields) setFieldErrors(fields);
      else setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function google(credential: string) {
    setError("");
    try {
      await loginWithGoogle(credential);
      navigate(next, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  const fieldError = (key: string) =>
    fieldErrors[key]?.[0] && (
      <p id={`${key}-error`} role="alert" className="text-sm text-destructive">
        {fieldErrors[key][0]}
      </p>
    );
  const other = `${signup ? "/signin" : "/signup"}${params.get("next") ? `?next=${encodeURIComponent(next)}` : ""}`;

  return (
    <div className="grid min-h-dvh bg-background lg:grid-cols-2">
      {/* brand side (desktop) */}
      <aside className="dark relative hidden flex-col justify-between overflow-hidden bg-ink-950 p-10 text-white lg:flex">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,oklch(0.9_0.19_125/0.18),transparent_45%)]" aria-hidden />
        <Link to="/" className="relative">
          <Logo />
        </Link>
        <div className="relative space-y-6">
          <h2 className="text-4xl font-semibold tracking-tight text-balance">Every meeting, written down for you.</h2>
          <ul className="space-y-3 text-ink-300">
            {[
              [Video, "One-click calls that work on any device"],
              [Captions, "Live captions while people talk"],
              [NotebookPen, "AI notes, decisions and to-dos after every call"],
            ].map(([Icon, text]) => {
              const I = Icon as typeof Video;
              return (
                <li key={text as string} className="flex items-center gap-3">
                  <span className="flex size-9 items-center justify-center rounded-xl bg-white/[0.06]">
                    <I className="size-4 text-brand" aria-hidden />
                  </span>
                  {text as string}
                </li>
              );
            })}
          </ul>
        </div>
        <p className="relative text-sm text-ink-500">Your meetings and notes stay with your account.</p>
      </aside>

      {/* form */}
      <main className="flex flex-col px-4 py-6 sm:px-8">
        <Link to="/" className="lg:hidden">
          <Logo />
        </Link>
        <div className="m-auto w-full max-w-sm space-y-6 py-10">
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight">{signup ? "Create your account" : "Welcome back"}</h1>
            <p className="text-muted-foreground">
              {signup ? "Keep all your meetings and notes in one place." : "Sign in to see your meetings and notes."}
            </p>
          </div>

          {googleEnabled && (
            <>
              <GoogleButton onCredential={google} />
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="h-px flex-1 bg-border" /> or with email <span className="h-px flex-1 bg-border" />
              </div>
            </>
          )}

          <form onSubmit={submit} className="space-y-4" noValidate>
            {signup && (
              <div className="space-y-1.5">
                <label htmlFor="name" className="text-sm font-medium">Name</label>
                <input id="name" autoComplete="name" required maxLength={50} className={field} value={name}
                  aria-invalid={!!fieldErrors.name} aria-describedby={fieldErrors.name ? "name-error" : undefined}
                  onChange={(e) => setName(e.target.value)} />
                {fieldError("name")}
              </div>
            )}
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-sm font-medium">Email</label>
              <input id="email" type="email" autoComplete="email" required className={field} value={email}
                aria-invalid={!!fieldErrors.email} aria-describedby={fieldErrors.email ? "email-error" : undefined}
                onChange={(e) => setEmail(e.target.value)} />
              {fieldError("email")}
            </div>
            <div className="space-y-1.5">
              <label htmlFor="password" className="text-sm font-medium">Password</label>
              <input id="password" type="password" required maxLength={128}
                autoComplete={signup ? "new-password" : "current-password"} className={field} value={password}
                aria-invalid={!!fieldErrors.password} aria-describedby={fieldErrors.password ? "password-error" : signup ? "password-hint" : undefined}
                onChange={(e) => setPassword(e.target.value)} />
              {fieldError("password") ?? (signup && <p id="password-hint" className="text-sm text-muted-foreground">At least 8 characters</p>)}
            </div>

            {error && (
              <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-brand font-semibold text-ink-950 transition hover:brightness-95 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none disabled:opacity-60"
            >
              {busy && <Loader2 className="size-4 animate-spin" />}
              {signup ? "Create account" : "Sign in"}
            </button>
          </form>

          <p className="text-center text-sm text-muted-foreground">
            {signup ? "Already have an account? " : "New here? "}
            <Link to={other} className="font-medium text-foreground underline underline-offset-4">
              {signup ? "Sign in" : "Create an account"}
            </Link>
          </p>
          <p className="text-center text-xs text-muted-foreground">You can still join and start meetings without an account.</p>
        </div>
      </main>
    </div>
  );
}
