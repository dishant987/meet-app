import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { CircleCheck, Loader2, MailCheck, RotateCw } from "lucide-react";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { api, errorMessage, fieldErrors } from "@/lib/api";
import { useAuth, type User } from "@/lib/auth";
import { check, forgotForm, resetForm } from "@/lib/validation";

const field =
  "h-12 w-full rounded-2xl border border-border bg-card px-4 placeholder:text-muted-foreground focus-visible:border-brand focus-visible:outline-none aria-invalid:border-destructive";
const primary =
  "flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-brand font-semibold text-ink-950 transition hover:brightness-95 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none disabled:opacity-60";

function Shell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background bg-[radial-gradient(ellipse_at_top_right,oklch(0.9_0.19_125/0.1),transparent_45%)] px-4 py-6 sm:px-8">
      <div className="flex items-center justify-between">
        <Link to="/" aria-label="MeetApp home" className="rounded-xl focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none">
          <Logo />
        </Link>
        <ThemeToggle />
      </div>
      <main className="m-auto w-full max-w-sm space-y-6 py-10">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
          <p className="text-muted-foreground">{subtitle}</p>
        </div>
        {children}
      </main>
    </div>
  );
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState("");
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    const result = check(forgotForm, { email });
    if (result.errors) return setError(result.errors.email!);
    setBusy(true);
    setError("");
    try {
      const { data } = await api.post<{ data: { message: string } }>("/auth/forgot-password", result.data);
      setSent(data.data.message);
    } catch (err) {
      setError(fieldErrors(err)?.email?.[0] ?? errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (sent)
    return (
      <Shell title="Check your email" subtitle={sent}>
        <div className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4 text-sm">
          <MailCheck className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden />
          <p>
            The link works once and expires in 30 minutes. Didn't get it? Check spam, or{" "}
            <button type="button" onClick={() => setSent("")} className="font-medium underline underline-offset-4">
              try again
            </button>
            .
          </p>
        </div>
        <Link to="/signin" className="block text-center text-sm font-medium underline underline-offset-4">
          Back to sign in
        </Link>
      </Shell>
    );

  return (
    <Shell title="Forgot your password?" subtitle="Enter your email and we'll send you a link to choose a new one.">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <label htmlFor="email" className="text-sm font-medium">Email</label>
          <input id="email" type="email" autoComplete="email" required className={field} value={email}
            aria-invalid={!!error} aria-describedby={error ? "email-error" : undefined}
            onChange={(e) => { setEmail(e.target.value); setError(""); }} />
          {error && <p id="email-error" role="alert" className="text-sm text-destructive">{error}</p>}
        </div>
        <button type="submit" disabled={busy || !email.trim()} className={primary}>
          {busy && <Loader2 className="size-4 animate-spin" />} Send reset link
        </button>
      </form>
      <Link to="/signin" className="block text-center text-sm text-muted-foreground underline underline-offset-4">
        Back to sign in
      </Link>
    </Shell>
  );
}

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ field?: string; message: string } | null>(null);

  if (!token)
    return (
      <Shell title="Link not valid" subtitle="This reset link is missing its code. Open the link from your email again, or ask for a new one.">
        <Link to="/forgot-password" className={primary}>Get a new link</Link>
      </Shell>
    );

  async function submit(e: FormEvent) {
    e.preventDefault();
    const result = check(resetForm, { password, confirm });
    if (result.errors) {
      const [field, message] = Object.entries(result.errors)[0]!;
      return setError({ field, message });
    }
    setBusy(true);
    setError(null);
    try {
      const { data } = await api.post<{ data: User }>("/auth/reset-password", { token, password });
      setUser(data.data);
      toast.success("Password changed. You're signed in, and signed out everywhere else.");
      navigate("/dashboard", { replace: true });
    } catch (err) {
      const f = fieldErrors(err);
      setError(f?.password ? { field: "password", message: f.password[0]! } : { message: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell title="Choose a new password" subtitle="After this you'll be signed in here and signed out on your other devices.">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <label htmlFor="new-password" className="text-sm font-medium">New password</label>
          <input id="new-password" type="password" autoComplete="new-password" className={field} value={password}
            aria-invalid={error?.field === "password"} aria-describedby={error?.field === "password" ? "pw-error" : "pw-hint"}
            onChange={(e) => setPassword(e.target.value)} />
          {error?.field === "password" ? (
            <p id="pw-error" role="alert" className="text-sm text-destructive">{error.message}</p>
          ) : (
            <p id="pw-hint" className="text-sm text-muted-foreground">At least 8 characters</p>
          )}
        </div>
        <div className="space-y-1.5">
          <label htmlFor="confirm-password" className="text-sm font-medium">Repeat new password</label>
          <input id="confirm-password" type="password" autoComplete="new-password" className={field} value={confirm}
            aria-invalid={error?.field === "confirm"} aria-describedby={error?.field === "confirm" ? "confirm-error" : undefined}
            onChange={(e) => setConfirm(e.target.value)} />
          {error?.field === "confirm" && <p id="confirm-error" role="alert" className="text-sm text-destructive">{error.message}</p>}
        </div>
        {error && !error.field && (
          <div role="alert" className="space-y-2 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <p>{error.message}</p>
            <Link to="/forgot-password" className="font-medium underline underline-offset-4">Get a new link</Link>
          </div>
        )}
        <button type="submit" disabled={busy || !password} className={primary}>
          {busy && <Loader2 className="size-4 animate-spin" />} Save new password
        </button>
      </form>
    </Shell>
  );
}

/** Opened from the "Confirm your email" link. Works signed in or not, on any device. */
export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const { user, loading, setUser } = useAuth();
  const [state, setState] = useState<{ status: "checking" | "done" | "failed"; message?: string }>({ status: token ? "checking" : "failed" });
  const sent = useRef(false);

  useEffect(() => {
    if (!token || sent.current) return;
    sent.current = true; // once (dev StrictMode runs effects twice)
    api
      .post<{ data: { email: string } }>("/auth/verify-email", { token })
      .then(() => setState({ status: "done" }))
      .catch((err) => setState({ status: "failed", message: errorMessage(err) }));
  }, [token]);

  // signed in here as that account: update the banner straight away
  useEffect(() => {
    if (state.status === "done" && user && !user.emailVerified) setUser({ ...user, emailVerified: true });
  }, [state.status, user, setUser]);

  if (state.status === "checking")
    return (
      <Shell title="Confirming your email" subtitle="One moment...">
        <div role="status" className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Checking your link
        </div>
      </Shell>
    );
  if (state.status === "done")
    return (
      <Shell title="Email confirmed" subtitle="Thanks! You can now send invites, and meeting notes will reach your inbox.">
        <div className="flex items-center gap-2 rounded-2xl bg-brand/15 px-4 py-3 text-sm font-medium">
          <CircleCheck className="size-5 text-brand-ink" aria-hidden /> Your email is confirmed
        </div>
        {loading ? null : (
          <Link to={user ? "/dashboard" : "/signin"} className={primary}>
            {user ? "Go to dashboard" : "Sign in"}
          </Link>
        )}
      </Shell>
    );
  return (
    <Shell
      title="Link not valid"
      subtitle={state.message ?? "This confirmation link is missing its code. Open the link from your email again."}
    >
      <Link to={user ? "/dashboard" : "/signin"} className={primary}>
        {user ? "Back to dashboard (resend from there)" : "Sign in to get a new link"}
      </Link>
    </Shell>
  );
}

/** After an email sign-up: "check your inbox". Moves on by itself once the link is clicked (here or on another device). */
export function CheckEmailPage() {
  const [params] = useSearchParams();
  const next = params.get("next")?.startsWith("/") ? params.get("next")! : "/dashboard";
  const { user, loading, setUser, logout } = useAuth();
  const [busy, setBusy] = useState<"resend" | "out" | null>(null);

  // look again every few seconds and when the tab gets focus (the link is often opened in another tab)
  useEffect(() => {
    if (!user || user.emailVerified) return;
    const refresh = () =>
      api
        .get<{ data: User | null }>("/auth/me")
        .then((r) => r.data.data?.emailVerified && setUser(r.data.data))
        .catch(() => {});
    const timer = setInterval(refresh, 5000);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [user, setUser]);

  if (loading) return null;
  if (!user) return <Navigate to={busy === "out" ? "/signup" : "/signin"} replace />;
  if (user.emailVerified) return <Navigate to={next} replace />;

  async function resend() {
    setBusy("resend");
    try {
      const { data } = await api.post<{ data: { alreadyVerified: boolean } }>("/auth/resend-verification");
      if (data.data.alreadyVerified) setUser({ ...user!, emailVerified: true });
      else toast.success(`New link sent to ${user!.email}`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function differentEmail() {
    setBusy("out");
    await logout(); // then the redirect above sends them to Sign up
  }

  return (
    <Shell title="Check your email" subtitle="One last step: confirm your email to start using MeetApp.">
      <div className="flex gap-3 rounded-2xl border border-border bg-card p-4">
        <MailCheck className="mt-0.5 size-5 shrink-0 text-brand-ink" aria-hidden />
        <p className="text-sm">
          We sent a link to <span className="font-semibold break-all">{user.email}</span>. Open it to finish. This page moves on by itself once
          you've clicked it.
        </p>
      </div>
      <div className="space-y-3">
        <button type="button" onClick={resend} disabled={!!busy} className={primary}>
          {busy === "resend" ? <Loader2 className="size-4 animate-spin" /> : <RotateCw className="size-4" />} Resend link
        </button>
        <button
          type="button"
          onClick={differentEmail}
          disabled={!!busy}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-border font-medium transition hover:border-brand focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none disabled:opacity-60"
        >
          {busy === "out" && <Loader2 className="size-4 animate-spin" />} Use a different email
        </button>
      </div>
      <p className="text-sm text-muted-foreground">Can't find it? Check your spam folder. The link works for 24 hours.</p>
    </Shell>
  );
}
