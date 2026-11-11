import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { Check, ChevronRight, CircleDot, DoorOpen, Globe, Loader2, LogOut, Mail, Plus, Trash2, Users, X } from "lucide-react";
import { cn } from "cn";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar } from "@/components/call/Avatar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ApiError, assetUrl, errorMessage, teamsApi, type TeamDetail, type TeamInviteForMe, type TeamRole, type TeamSummary } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const field =
  "h-11 w-full rounded-2xl border border-border bg-background px-3 text-sm placeholder:text-muted-foreground focus-visible:border-brand focus-visible:outline-none aria-invalid:border-destructive";
const primary =
  "flex h-11 items-center justify-center gap-2 rounded-2xl bg-brand px-4 text-sm font-semibold text-ink-950 transition hover:brightness-95 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-card focus-visible:outline-none disabled:bg-muted disabled:text-muted-foreground";
const ghost =
  "flex h-10 items-center justify-center gap-2 rounded-xl border border-border px-3 text-sm font-medium transition hover:border-brand focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none disabled:opacity-50";
const ROLE: Record<TeamRole, string> = { OWNER: "Owner", ADMIN: "Admin", MEMBER: "Member" };
const roleChip = (r: TeamRole) =>
  cn("rounded-lg px-2 py-0.5 text-xs font-semibold", r === "OWNER" ? "bg-brand/25 text-brand-ink" : r === "ADMIN" ? "bg-sky-500/15 text-sky-700 dark:text-sky-300" : "bg-muted text-muted-foreground");
const Card = ({
  title,
  description,
  badge,
  danger,
  children,
}: {
  title: string;
  description?: string;
  badge?: React.ReactNode;
  danger?: boolean;
  children: React.ReactNode;
}) => (
  <section className={cn("rounded-3xl border bg-card p-5 sm:p-6", danger ? "border-red-500/25" : "border-border")}>
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-lg font-semibold">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      </div>
      {badge}
    </div>
    {children}
  </section>
);
const countBadge = (n: number) => <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">{n}</span>;
const initial = (s: string) => s.trim().slice(0, 1).toUpperCase();

/** On/off switch (a real button with role="switch", so keyboards and screen readers get it right). */
function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-card focus-visible:outline-none disabled:opacity-50",
        checked ? "bg-brand" : "bg-muted-foreground/30",
      )}
    >
      <span className={cn("absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform", checked && "translate-x-5")} />
    </button>
  );
}
const splitEmails = (s: string) => [...new Set(s.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean))];

/** /teams — my teams, invites waiting for me, and "New team". */
export function TeamsPage() {
  const [data, setData] = useState<{ teams: TeamSummary[]; invites: TeamInviteForMe[] } | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const load = () => teamsApi.mine().then(setData).catch((err) => toast.error(errorMessage(err)));
  useEffect(() => void load(), []);

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError("Give the team a name");
    setBusy("create");
    setError("");
    try {
      const t = await teamsApi.create(name.trim());
      navigate(`/teams/${t.id}`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function answer(inv: TeamInviteForMe, accept: boolean) {
    setBusy(inv.id);
    try {
      await teamsApi.answer(inv.id, accept);
      toast.success(accept ? `You joined ${inv.teamName}` : "Invite declined");
      await load();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 px-4 py-8 sm:px-6 lg:px-10">
      <div className="space-y-3">
        <Breadcrumbs items={[{ label: "Home", to: "/dashboard" }, { label: "Teams" }]} />
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Teams</h1>
          <p className="text-muted-foreground">Share meetings, notes and recordings with the people you work with.</p>
        </div>
      </div>

      {data?.invites.length ? (
        <section aria-label="Invites for you" className="space-y-2">
          {data.invites.map((inv) => (
            <div key={inv.id} className="flex flex-wrap items-center gap-3 rounded-3xl border border-brand/50 bg-brand/10 p-4">
              <Mail className="size-5 shrink-0 text-brand-ink" aria-hidden />
              <p className="min-w-0 flex-1 text-sm">
                You're invited to <b>{inv.teamName}</b> as {ROLE[inv.role].toLowerCase()} · {inv.members} {inv.members === 1 ? "member" : "members"}
              </p>
              <div className="flex gap-2">
                <button type="button" className={ghost} disabled={!!busy} onClick={() => answer(inv, false)}>
                  Decline
                </button>
                <button type="button" className={cn(primary, "h-10")} disabled={!!busy} onClick={() => answer(inv, true)}>
                  {busy === inv.id ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Join
                </button>
              </div>
            </div>
          ))}
        </section>
      ) : null}

      <div className="grid items-start gap-4 lg:grid-cols-[1fr_380px]">
        <section aria-label="Your teams">
          {!data ? (
            <div role="status" aria-label="Loading teams" className="grid gap-3 sm:grid-cols-2">
              <Skeleton className="h-28 rounded-3xl" />
              <Skeleton className="h-28 rounded-3xl" />
            </div>
          ) : data.teams.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-3xl border border-dashed border-border p-10 text-center">
              <Users className="size-8 text-muted-foreground" />
              <p className="font-semibold">No teams yet</p>
              <p className="max-w-sm text-sm text-muted-foreground">Make one, invite people by email, and pick the team when you schedule a meeting.</p>
            </div>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {data.teams.map((t) => (
                <li key={t.id}>
                  <Link
                    to={`/teams/${t.id}`}
                    className="group flex items-center gap-4 rounded-3xl border border-border bg-card p-5 transition hover:border-brand focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
                  >
                    <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-muted text-lg font-semibold">
                      {t.name.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate font-semibold">{t.name}</span>
                        <span className={roleChip(t.role)}>{ROLE[t.role]}</span>
                      </span>
                      <span className="block text-sm text-muted-foreground">
                        {t.members} {t.members === 1 ? "member" : "members"} · {t.meetings} {t.meetings === 1 ? "meeting" : "meetings"}
                      </span>
                    </span>
                    <ChevronRight className="size-5 text-muted-foreground transition group-hover:translate-x-0.5" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <Card title="New team" description="You'll be the owner. Free plan: 1 team with up to 5 people.">
          <form onSubmit={create} noValidate className="space-y-3">
            <label htmlFor="team-name" className="sr-only">
              Team name
            </label>
            <input id="team-name" className={field} placeholder="e.g. Design" maxLength={60} value={name} aria-invalid={!!error}
              onChange={(e) => (setName(e.target.value), setError(""))} />
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}{" "}
                {error.includes("Pro") && <Link to="/billing" className="font-semibold underline">See plans</Link>}
              </p>
            )}
            <button type="submit" className={cn(primary, "w-full")} disabled={busy === "create"}>
              {busy === "create" ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Create team
            </button>
          </form>
        </Card>
      </div>
    </div>
  );
}

/** /teams/:teamId — members, invites, settings. */
export function TeamPage() {
  const { teamId = "" } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [team, setTeam] = useState<TeamDetail | null>(null);
  const [error, setError] = useState("");
  const load = () =>
    teamsApi
      .get(teamId)
      .then(setTeam)
      .catch((err) => setError(errorMessage(err)));
  useEffect(() => void load(), [teamId]);

  if (error)
    return (
      <div className="mx-auto w-full max-w-[1400px] px-4 py-8 sm:px-6 lg:px-10">
        <Breadcrumbs items={[{ label: "Home", to: "/dashboard" }, { label: "Teams", to: "/teams" }, { label: "Team" }]} />
        <p role="alert" className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>
      </div>
    );
  if (!team)
    return (
      <div role="status" aria-label="Loading team" className="mx-auto w-full max-w-[1400px] space-y-4 px-4 py-8 sm:px-6 lg:px-10">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-9 w-64" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-72 rounded-3xl" />
          <Skeleton className="h-72 rounded-3xl" />
        </div>
      </div>
    );

  const admin = team.myRole !== "MEMBER";
  const used = team.members.length + team.invites.length;
  const pct = Math.min(100, Math.round((used / team.maxPeople) * 100));
  const stat = "inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-1.5 text-sm whitespace-nowrap";
  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 px-4 py-8 sm:px-6 lg:px-10">
      <Breadcrumbs items={[{ label: "Home", to: "/dashboard" }, { label: "Teams", to: "/teams" }, { label: team.name }]} />
      <header className="space-y-4 rounded-3xl border border-border bg-card p-5 sm:p-6">
        <div className="flex items-center gap-4">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand to-emerald-400 text-2xl font-bold text-ink-950" aria-hidden>
            {initial(team.name)}
          </span>
          <h1 className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight sm:text-3xl">
            <span className="truncate">{team.name}</span> <span className={roleChip(team.myRole)}>{ROLE[team.myRole]}</span>
          </h1>
          <Link to="/meetings?role=team" className={cn(ghost, "hidden sm:flex")}>
            Team meetings <ChevronRight className="size-4" />
          </Link>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className={stat}>
            <Users className="size-4 text-muted-foreground" aria-hidden /> {team.members.length} {team.members.length === 1 ? "member" : "members"}
          </span>
          {admin && team.invites.length > 0 && (
            <span className={stat}>
              <Mail className="size-4 text-muted-foreground" aria-hidden /> {team.invites.length} {team.invites.length === 1 ? "invite" : "invites"} waiting
            </span>
          )}
          {admin && (
            <span className={cn(stat, "gap-2")} title="Members and invites count toward the plan's limit">
              {used} of {team.maxPeople} places
              <span className="h-1.5 w-16 overflow-hidden rounded-full bg-muted" aria-hidden>
                <span className={cn("block h-full rounded-full", pct >= 100 ? "bg-red-500" : "bg-brand")} style={{ width: `${Math.max(pct, 4)}%` }} />
              </span>
            </span>
          )}
        </div>
        <Link to="/meetings?role=team" className={cn(ghost, "w-full sm:hidden")}>
          Team meetings <ChevronRight className="size-4" />
        </Link>
      </header>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <div className="min-w-0 space-y-4">
          <Members team={team} me={user?.id} onChange={load} />
          {admin && <InvitePeople team={team} onChange={load} />}
        </div>
        <div className="min-w-0 space-y-4">
          <Settings team={team} admin={admin} onChange={load} />
          <DangerZone team={team} me={user?.id} onGone={() => navigate("/teams", { replace: true })} />
        </div>
      </div>
    </div>
  );
}

function Members({ team, me, onChange }: { team: TeamDetail; me?: string; onChange: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const owner = team.myRole === "OWNER";
  async function run(id: string, job: () => Promise<unknown>, done: string) {
    setBusy(id);
    try {
      await job();
      toast.success(done);
      onChange();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }
  return (
    <Card title="Members" badge={countBadge(team.members.length)}>
      <ul className="divide-y divide-border">
        {team.members.map((m) => {
          const canRemove = m.id !== me && m.role !== "OWNER" && (owner || (team.myRole === "ADMIN" && m.role === "MEMBER"));
          return (
            <li key={m.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-1 last:pb-0">
              <Avatar name={m.name} size="sm" src={assetUrl(m.avatarUrl)} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {m.name} {m.id === me && <span className="text-muted-foreground">(you)</span>}
                </p>
                <p className="truncate text-xs text-muted-foreground">{m.email}</p>
              </div>
              {owner && m.role !== "OWNER" ? (
                <select
                  aria-label={`Role for ${m.name}`}
                  value={m.role}
                  disabled={busy === m.id}
                  onChange={(e) => run(m.id, () => teamsApi.setRole(team.id, m.id, e.target.value as "ADMIN" | "MEMBER"), `${m.name} is now ${e.target.value === "ADMIN" ? "an admin" : "a member"}`)}
                  className="h-9 rounded-xl border border-border bg-background px-2 text-sm focus-visible:border-brand focus-visible:outline-none"
                >
                  <option value="MEMBER">Member</option>
                  <option value="ADMIN">Admin</option>
                </select>
              ) : (
                <span className={roleChip(m.role)}>{ROLE[m.role]}</span>
              )}
              {canRemove && (
                <button
                  type="button"
                  aria-label={`Remove ${m.name}`}
                  disabled={busy === m.id}
                  onClick={() => run(m.id, () => teamsApi.removeMember(team.id, m.id), `${m.name} removed`)}
                  className="flex size-9 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-destructive focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
                >
                  {busy === m.id ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function InvitePeople({ team, onChange }: { team: TeamDetail; onChange: () => void }) {
  const [emails, setEmails] = useState("");
  const [role, setRole] = useState<"MEMBER" | "ADMIN">("MEMBER");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; limit: boolean } | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    const list = splitEmails(emails);
    if (!list.length) return setError({ text: "Add at least one email", limit: false });
    const bad = list.find((x) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x));
    if (bad) return setError({ text: `"${bad}" isn't a valid email`, limit: false });
    setBusy(true);
    setError(null);
    try {
      const r = await teamsApi.invite(team.id, list, role);
      toast.success(r.invited ? `Invite sent to ${r.invited} ${r.invited === 1 ? "person" : "people"}` : "They're already in the team or invited");
      setEmails("");
      onChange();
    } catch (err) {
      setError({ text: errorMessage(err), limit: err instanceof ApiError && err.code === "PLAN_LIMIT" });
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card title="Invite people" description="They get an email and accept on their Teams page (after signing up with that email if needed).">
      <form onSubmit={submit} noValidate className="space-y-3">
        <label htmlFor="team-emails" className="sr-only">
          Emails
        </label>
        <textarea id="team-emails" rows={2} className={cn(field, "h-auto py-2.5")} placeholder="asha@acme.com, ravi@acme.com" value={emails}
          aria-invalid={!!error} onChange={(e) => (setEmails(e.target.value), setError(null))} />
        <div className="flex flex-wrap gap-2">
          {team.myRole === "OWNER" && (
            <select aria-label="Role" value={role} onChange={(e) => setRole(e.target.value as "MEMBER" | "ADMIN")} className={cn(field, "w-auto")}>
              <option value="MEMBER">As member</option>
              <option value="ADMIN">As admin</option>
            </select>
          )}
          <button type="submit" className={primary} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />} Send invites
          </button>
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error.text} {error.limit && <Link to="/billing" className="font-semibold underline">See plans</Link>}
          </p>
        )}
      </form>
      {team.invites.length > 0 && (
        <div className="mt-6 border-t border-border pt-5">
          <p className="mb-3 flex items-center gap-2 text-sm font-medium">
            Waiting to accept {countBadge(team.invites.length)}
          </p>
          <ul className="space-y-2">
            {team.invites.map((i) => (
              <li key={i.id} className="flex items-center gap-3 rounded-2xl border border-dashed border-border px-3 py-2.5 text-sm">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground" aria-hidden>
                  {initial(i.email)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{i.email}</span>
                  <span className="block text-xs text-muted-foreground">Invited as {ROLE[i.role].toLowerCase()}</span>
                </span>
                <span className="rounded-lg bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-300">Pending</span>
                <button
                  type="button"
                  aria-label={`Cancel invite for ${i.email}`}
                  onClick={() => teamsApi.cancelInvite(team.id, i.id).then(onChange, (err) => toast.error(errorMessage(err)))}
                  className="flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-background hover:text-destructive focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
                >
                  <X className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function Settings({ team, admin, onChange }: { team: TeamDetail; admin: boolean; onChange: () => void }) {
  const [name, setName] = useState(team.name);
  const [askToJoin, setAskToJoin] = useState(team.settings.askToJoin);
  const [domains, setDomains] = useState(team.settings.allowedDomains.join(", "));
  const [recording, setRecording] = useState(team.settings.recording);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(e: FormEvent) {
    e.preventDefault();
    const list = domains.split(/[\s,;]+/).map((d) => d.trim().replace(/^@/, "").toLowerCase()).filter(Boolean);
    const bad = list.find((d) => !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d));
    if (bad) return setError(`"${bad}" isn't a domain. Use the part after @, like acme.com`);
    if (!name.trim()) return setError("Give the team a name");
    setBusy(true);
    setError("");
    try {
      await teamsApi.update(team.id, { name: name.trim(), askToJoin, allowedDomains: list, recording });
      toast.success("Team settings saved");
      onChange();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  const dirty =
    name.trim() !== team.name ||
    askToJoin !== team.settings.askToJoin ||
    domains.split(/[\s,;]+/).map((d) => d.trim().replace(/^@/, "").toLowerCase()).filter(Boolean).join(",") !== team.settings.allowedDomains.join(",") ||
    recording !== team.settings.recording;
  const icon = "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground";
  return (
    <Card title="Settings" description={admin ? "Apply to the team's meetings. Only owners and admins can change them." : "Set by the team's owner and admins."}>
      <form onSubmit={save} noValidate>
        <fieldset disabled={!admin || busy} className="space-y-5">
          <div className="space-y-1.5">
            <label htmlFor="team-rename" className="text-sm font-medium">Team name</label>
            <input id="team-rename" className={field} maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="flex items-start gap-3 rounded-2xl border border-border p-4">
            <span className={icon} aria-hidden><DoorOpen className="size-4" /></span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium" id="ask-label">Ask to join</p>
              <p className="text-xs text-muted-foreground">New team meetings start with a waiting room: the host lets people in.</p>
            </div>
            <Switch checked={askToJoin} onChange={setAskToJoin} label="Ask to join" disabled={!admin || busy} />
          </div>

          <div className="flex items-start gap-3 rounded-2xl border border-border p-4">
            <span className={icon} aria-hidden><Globe className="size-4" /></span>
            <div className="min-w-0 flex-1 space-y-2">
              <div>
                <label htmlFor="team-domains" className="text-sm font-medium">Who can join team meetings</label>
                <p className="text-xs text-muted-foreground">Leave empty for anyone with the link. With domains, only people signed in with that email can join.</p>
              </div>
              <input id="team-domains" className={field} placeholder="e.g. acme.com" value={domains} onChange={(e) => setDomains(e.target.value)} />
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-2xl border border-border p-4">
            <span className={icon} aria-hidden><CircleDot className="size-4" /></span>
            <div className="min-w-0 flex-1 space-y-2">
              <div>
                <label htmlFor="team-rec" className="text-sm font-medium">Recording</label>
                <p className="text-xs text-muted-foreground">Who may record the team's meetings.</p>
              </div>
              <select id="team-rec" className={field} value={recording} onChange={(e) => setRecording(e.target.value as "HOST" | "OFF")}>
                <option value="HOST">The meeting's host can record</option>
                <option value="OFF">Nobody can record</option>
              </select>
            </div>
          </div>
        </fieldset>
        {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
        {admin && (
          <div className="mt-5 flex items-center gap-3">
            <button type="submit" className={primary} disabled={busy || !dirty}>
              {busy && <Loader2 className="size-4 animate-spin" />} Save settings
            </button>
            {dirty && <span className="text-xs text-muted-foreground">You have unsaved changes</span>}
          </div>
        )}
      </form>
    </Card>
  );
}

function DangerZone({ team, me, onGone }: { team: TeamDetail; me?: string; onGone: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const owner = team.myRole === "OWNER";
  async function go() {
    setBusy(true);
    try {
      if (owner) await teamsApi.remove(team.id);
      else await teamsApi.removeMember(team.id, me!);
      toast.success(owner ? "Team deleted" : `You left ${team.name}`);
      onGone();
    } catch (err) {
      toast.error(errorMessage(err));
      setBusy(false);
    }
  }
  return (
    <Card danger title={owner ? "Delete team" : "Leave team"} description={owner ? "Meetings and notes stay with the people who hosted them." : "You'll stop seeing the team's meetings."}>
      <button type="button" onClick={() => setOpen(true)} className={cn(ghost, "border-red-500/40 text-red-600 hover:border-red-500 dark:text-red-400")}>
        {owner ? <Trash2 className="size-4" /> : <LogOut className="size-4" />} {owner ? "Delete team" : "Leave team"}
      </button>
      <AlertDialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <AlertDialogContent className="rounded-3xl sm:max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{owner ? `Delete ${team.name}?` : `Leave ${team.name}?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {owner ? "Everyone loses access to the team's shared meetings. This can't be undone." : "You'll need a new invite to come back."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy} className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => (e.preventDefault(), void go())}
              className="rounded-xl bg-red-500 text-white hover:bg-red-600"
            >
              {busy && <Loader2 className="size-4 animate-spin" />} {owner ? "Delete team" : "Leave"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
