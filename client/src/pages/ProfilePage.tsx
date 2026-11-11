import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { BadgeCheck, CalendarSync, Camera, Copy, KeyRound, Loader2, Mail, RefreshCw, Trash2 } from "lucide-react";
import { Avatar } from "@/components/call/Avatar";
import { useAuth, type User } from "@/lib/auth";
import { ApiError, api, assetUrl, calendarApi, errorMessage, fieldErrors } from "@/lib/api";
import { squarePhoto } from "@/lib/image";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { changePasswordForm, check, profileNameForm } from "@/lib/validation";

const field =
  "h-12 w-full rounded-2xl border border-border bg-background px-4 placeholder:text-muted-foreground focus-visible:border-brand focus-visible:outline-none aria-invalid:border-destructive";
const primaryBtn =
  "flex h-11 items-center justify-center gap-2 rounded-2xl bg-brand px-5 text-sm font-semibold text-ink-950 transition hover:brightness-95 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-card focus-visible:outline-none disabled:bg-muted disabled:text-muted-foreground disabled:hover:brightness-100";
const ghostBtn =
  "flex h-11 items-center justify-center gap-2 rounded-2xl border border-border px-4 text-sm font-medium transition hover:border-brand focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none disabled:opacity-50";

function Card({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="rounded-3xl border border-border bg-card p-5 sm:p-6">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mb-4 text-sm text-muted-foreground">{description}</p>
      {children}
    </section>
  );
}
const badge = "inline-flex items-center gap-1 rounded-lg bg-muted px-2 py-1 text-xs font-medium";

function PhotoCard({ user, onSaved }: { user: User; onSaved: (u: User) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const blob = await squarePhoto(file);
      setPreview(URL.createObjectURL(blob)); // show it right away
      const { data } = await api.put<{ data: User }>("/me/avatar", blob, { headers: { "content-type": blob.type } });
      onSaved(data.data);
      toast.success("Photo updated");
    } catch (err) {
      setPreview(null);
      toast.error(err instanceof ApiError ? err.message : (err as Error).message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function remove() {
    setBusy(true);
    try {
      const { data } = await api.delete<{ data: User }>("/me/avatar");
      setPreview(null);
      onSaved(data.data);
      toast.success("Photo removed");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const uploaded = user.avatarUrl?.startsWith("/");
  return (
    <section aria-label="Your account" className="rounded-3xl border border-border bg-card p-5 sm:p-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="relative shrink-0">
          <Avatar name={user.name} src={preview ?? assetUrl(user.avatarUrl)} />
          {busy && (
            <div className="absolute inset-0 flex items-center justify-center rounded-[1.75rem] bg-black/40 sm:rounded-[2.25rem]">
              <Loader2 className="size-6 animate-spin text-white" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="truncate text-xl font-semibold">{user.name}</p>
          <p className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
            <Mail className="size-4 shrink-0" aria-hidden /> <span className="truncate">{user.email}</span>
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            {user.emailVerified && (
              <span className={badge}>
                <BadgeCheck className="size-3.5 text-brand-ink" aria-hidden /> Email confirmed
              </span>
            )}
            {user.google && <span className={badge}>Signs in with Google</span>}
            {user.hasPassword && <span className={badge}>Signs in with password</span>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 sm:self-center">
          <input ref={input} type="file" accept="image/*" className="sr-only" id="photo" onChange={(e) => pick(e.target.files?.[0])} />
          <label htmlFor="photo" className={`${primaryBtn} cursor-pointer ${busy ? "pointer-events-none opacity-50" : ""}`}>
            <Camera className="size-4" /> {user.avatarUrl ? "Change photo" : "Upload photo"}
          </label>
          {uploaded && (
            <button type="button" onClick={remove} disabled={busy} className={ghostBtn}>
              <Trash2 className="size-4" /> Remove
            </button>
          )}
        </div>
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        Your photo shows in meetings when your camera is off. JPG, PNG or WebP; we crop it to a square and make it small before uploading.
        {user.google && !uploaded && " Without an upload, your Google photo is used."}
      </p>
    </section>
  );
}

function NameCard({ user, onSaved }: { user: User; onSaved: (u: User) => void }) {
  const [name, setName] = useState(user.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const changed = name.trim() !== user.name && name.trim().length > 0;

  async function save(e: FormEvent) {
    e.preventDefault();
    const result = check(profileNameForm, { name });
    if (result.errors) return setError(result.errors.name!);
    setBusy(true);
    setError("");
    try {
      const { data } = await api.patch<{ data: User }>("/me", result.data);
      onSaved(data.data);
      toast.success("Name saved");
    } catch (err) {
      setError(err instanceof ApiError && err.details?.name ? err.details.name[0]! : errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Your name" description="Used as your name when you join meetings.">
      <form onSubmit={save} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <label htmlFor="profile-name" className="text-sm font-medium">Name</label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input id="profile-name" className={field} value={name} maxLength={50} autoComplete="name"
              aria-invalid={!!error} aria-describedby={error ? "name-err" : undefined}
              onChange={(e) => { setName(e.target.value); setError(""); }} />
            <button type="submit" disabled={!changed || busy} className={primaryBtn}>
              {busy && <Loader2 className="size-4 animate-spin" />} Save
            </button>
          </div>
          {error && <p id="name-err" role="alert" className="text-sm text-destructive">{error}</p>}
        </div>
      </form>
    </Card>
  );
}

function PasswordCard({ user, onSaved }: { user: User; onSaved: (u: User) => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function save(e: FormEvent) {
    e.preventDefault();
    const result = check(changePasswordForm(user.hasPassword), {
      currentPassword: user.hasPassword ? current : undefined,
      newPassword: next,
      confirm,
    });
    if (result.errors) return setErrors(result.errors);
    setBusy(true);
    setErrors({});
    try {
      const { data } = await api.post<{ data: User }>("/me/password", {
        currentPassword: result.data.currentPassword,
        newPassword: result.data.newPassword,
      });
      onSaved(data.data);
      setCurrent("");
      setNext("");
      setConfirm("");
      toast.success(user.hasPassword ? "Password changed" : "Password set. You can now also sign in with email.");
    } catch (err) {
      const fields = fieldErrors(err);
      if (fields) setErrors(Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v[0]!])));
      else setErrors({ form: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  const err = (k: string) =>
    errors[k] && <p id={`${k}-err`} role="alert" className="text-sm text-destructive">{errors[k]}</p>;

  return (
    <Card
      title={user.hasPassword ? "Change password" : "Set a password"}
      description={
        user.hasPassword
          ? "You'll stay signed in here; your other devices are signed out."
          : "You sign in with Google. Add a password to also sign in with your email."
      }
    >
      <form onSubmit={save} className="space-y-3" noValidate>
        {user.hasPassword && (
          <div className="space-y-1.5">
            <label htmlFor="pw-current" className="text-sm font-medium">Current password</label>
            <input id="pw-current" type="password" autoComplete="current-password" className={field} value={current}
              aria-invalid={!!errors.currentPassword} aria-describedby={errors.currentPassword ? "currentPassword-err" : undefined}
              onChange={(e) => setCurrent(e.target.value)} />
            {err("currentPassword")}
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="pw-new" className="text-sm font-medium">New password</label>
            <input id="pw-new" type="password" autoComplete="new-password" className={field} value={next}
              aria-invalid={!!errors.newPassword} aria-describedby={errors.newPassword ? "newPassword-err" : "pw-hint"}
              onChange={(e) => setNext(e.target.value)} />
            {err("newPassword") ?? <p id="pw-hint" className="text-xs text-muted-foreground">At least 8 characters</p>}
          </div>
          <div className="space-y-1.5">
            <label htmlFor="pw-confirm" className="text-sm font-medium">Repeat new password</label>
            <input id="pw-confirm" type="password" autoComplete="new-password" className={field} value={confirm}
              aria-invalid={!!errors.confirm} aria-describedby={errors.confirm ? "confirm-err" : undefined}
              onChange={(e) => setConfirm(e.target.value)} />
            {err("confirm")}
          </div>
        </div>
        {err("form")}
        <button type="submit" disabled={busy || !next || (user.hasPassword && !current)} className={primaryBtn}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
          {user.hasPassword ? "Change password" : "Set password"}
        </button>
      </form>
    </Card>
  );
}

/** Personal calendar link: Google / Outlook / Apple Calendar subscribe and keep MeetApp meetings in sync. */
function CalendarCard() {
  const [url, setUrl] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    calendarApi.link().then(setUrl).catch((err) => toast.error(errorMessage(err)));
  }, []);
  const webcal = url?.replace(/^https?:/, "webcal:");
  async function copy() {
    try {
      await navigator.clipboard.writeText(url!);
      toast.success("Calendar link copied");
    } catch {
      toast(url!);
    }
  }
  async function reset() {
    setBusy(true);
    try {
      setUrl(await calendarApi.reset());
      setConfirmReset(false);
      toast.success("New link made. Calendars using the old one stop updating.");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  const linkBtn = `${ghostBtn} h-10`;
  return (
    <Card
      title="Calendar"
      description="Your scheduled MeetApp meetings (hosted, invited and team) show up in your calendar and stay updated. Keep this link private."
    >
      {!url ? (
        <div className="h-11 animate-pulse rounded-2xl bg-muted" />
      ) : (
        <div className="space-y-3">
          <div className="flex gap-2">
            <input readOnly aria-label="Your calendar link" value={url} onFocus={(e) => e.target.select()} className={`${field} h-11 min-w-0 font-mono text-xs`} />
            <button type="button" onClick={copy} className={linkBtn} aria-label="Copy calendar link">
              <Copy className="size-4" />
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <a className={linkBtn} target="_blank" rel="noreferrer" href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal!)}`}>
              <CalendarSync className="size-4" /> Add to Google Calendar
            </a>
            <a className={linkBtn} target="_blank" rel="noreferrer"
              href={`https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(url)}&name=MeetApp`}>
              <CalendarSync className="size-4" /> Add to Outlook
            </a>
            <a className={linkBtn} href={webcal}>
              <CalendarSync className="size-4" /> Apple Calendar
            </a>
          </div>
          <p className="text-xs text-muted-foreground">Calendar apps refresh subscribed calendars every few hours, so a new meeting can take a while to appear.</p>
          {confirmReset ? (
            <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-muted px-3 py-2 text-sm">
              <span className="flex-1">Make a new link? Calendars using the old one stop updating.</span>
              <button type="button" className={linkBtn} onClick={() => setConfirmReset(false)} disabled={busy}>Keep it</button>
              <button type="button" className={`${linkBtn} border-red-500/40 text-red-600 dark:text-red-400`} onClick={reset} disabled={busy}>
                {busy && <Loader2 className="size-4 animate-spin" />} New link
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmReset(true)} className="flex items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 hover:underline">
              <RefreshCw className="size-3.5" /> Shared it by mistake? Make a new link
            </button>
          )}
        </div>
      )}
    </Card>
  );
}

export function ProfilePage() {
  const { user, setUser } = useAuth();

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 px-4 py-8 sm:px-6 lg:px-10">
      <div className="space-y-3">
        <Breadcrumbs items={[{ label: "Home", to: "/dashboard" }, { label: "Profile" }]} />
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Profile</h1>
          <p className="text-muted-foreground">How you appear in meetings, and how you sign in.</p>
        </div>
      </div>
      {!user ? (
        <Loader2 className="mx-auto mt-10 size-6 animate-spin text-muted-foreground" />
      ) : (
        <>
          <PhotoCard user={user} onSaved={setUser} />
          <div className="grid items-start gap-4 lg:grid-cols-2">
            {/* key: reset the form if the saved name changes elsewhere */}
            <NameCard key={user.name} user={user} onSaved={setUser} />
            <PasswordCard user={user} onSaved={setUser} />
          </div>
          <CalendarCard />
        </>
      )}
    </div>
  );
}
