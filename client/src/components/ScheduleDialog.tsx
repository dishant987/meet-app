import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { CalendarCheck, CalendarPlus, Loader2, Repeat } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage, fieldErrors, meetingsApi, teamsApi, type Answer, type TeamSummary } from "@/lib/api";
import { getHostKey, saveHostKey } from "@/lib/meetingAccess";
import { check, scheduleForm, type FormErrors } from "@/lib/validation";

const field =
  "h-11 w-full rounded-2xl border border-border bg-background px-3 text-sm placeholder:text-muted-foreground focus-visible:border-brand focus-visible:outline-none aria-invalid:border-destructive";
const DURATIONS = [15, 30, 45, 60, 90, 120];
const lengthLabel = (d: number) => (d < 60 ? `${d} min` : `${Math.floor(d / 60)} h${d % 60 ? ` ${d % 60} min` : ""}`);
const pad = (n: number) => String(n).padStart(2, "0");
const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const localTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const people = (n: number) => `${n} ${n === 1 ? "person" : "people"}`;

/** Next half hour, as the form's starting date/time (local). */
function nextSlot() {
  const d = new Date(Date.now() + 30 * 60_000);
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0);
  return { date: localDate(d), time: localTime(d) };
}
const blank = () => ({ title: "", ...nextSlot(), durationMin: "30", guests: "", repeat: "", repeatCount: "4", teamId: "" });
const REPLY: Record<Answer, { label: string; cls: string }> = {
  YES: { label: "Going", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  MAYBE: { label: "Maybe", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  NO: { label: "Not going", cls: "bg-red-500/15 text-red-700 dark:text-red-300" },
};

type Props = {
  /** Opens the dialog (schedule mode). Leave out when the parent controls `open`. */
  trigger?: ReactNode;
  /** Edit an existing meeting instead of scheduling a new one. */
  editRoomCode?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onScheduled?: () => void;
  /** Schedule mode: start the form at this date and time (e.g. a slot clicked in the calendar). */
  initialAt?: Date | null;
};

/**
 * Schedule a meeting (guests get a calendar invite) or edit one that hasn't started
 * (guests get an update to the same calendar event; removed guests get a cancellation).
 */
export function ScheduleDialog({ trigger, editRoomCode, open: openProp, onOpenChange, onScheduled, initialAt }: Props) {
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = (o: boolean) => (onOpenChange ? onOpenChange(o) : setOpenState(o));
  const editing = !!editRoomCode;
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [form, setForm] = useState(blank);
  const [series, setSeries] = useState<{ recurrence: string; left: number } | null>(null);
  const [replies, setReplies] = useState<{ email: string; response: Answer | null }[]>([]);
  const [teams, setTeams] = useState<TeamSummary[]>([]);

  // schedule: start at the slot the person picked
  useEffect(() => {
    if (open && !editRoomCode && initialAt) setForm({ ...blank(), date: localDate(initialAt), time: localTime(initialAt) });
  }, [open, editRoomCode, initialAt]);

  // schedule: my teams, for "Who's it for"
  useEffect(() => {
    if (!open || editRoomCode) return;
    teamsApi.mine().then((r) => setTeams(r.teams), () => setTeams([]));
  }, [open, editRoomCode]);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setErrors(({ [k]: _gone, form: _f, ...rest }) => rest);
  };

  // edit: load the current details each time the dialog opens
  useEffect(() => {
    if (!open || !editRoomCode) return;
    let alive = true;
    setLoading(true);
    setErrors({});
    meetingsApi
      .getSchedule(editRoomCode, getHostKey(editRoomCode))
      .then((s) => {
        if (!alive) return;
        const at = s.scheduledFor ? new Date(s.scheduledFor) : null;
        setForm({
          title: s.title,
          ...(at ? { date: localDate(at), time: localTime(at) } : nextSlot()),
          durationMin: String(s.durationMin ?? 30),
          guests: s.invitees.join(", "),
          repeat: "",
          repeatCount: "4",
          teamId: "",
        });
        setSeries(s.recurrence ? { recurrence: s.recurrence, left: s.seriesLeft } : null);
        setReplies(s.replies);
        if (!s.editable) setErrors({ form: "This meeting has already started or was cancelled, so it can't be changed." });
      })
      .catch((err) => alive && setErrors({ form: errorMessage(err) }))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [open, editRoomCode]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const result = check(scheduleForm, form);
    if (result.errors) return setErrors(result.errors);
    setBusy(true);
    try {
      if (editRoomCode) {
        const { repeat: _r, repeatCount: _c, teamId: _t, ...change } = result.data; // repeat and team aren't edited here
        const r = await meetingsApi.updateSchedule(editRoomCode, { ...change, timeZone: timeZone() }, getHostKey(editRoomCode));
        const parts = [
          r.updated && `updates sent to ${people(r.updated)}`,
          r.invited && `invites sent to ${people(r.invited)}`,
          r.removed && `${people(r.removed)} told they're no longer invited`,
        ].filter(Boolean);
        const text = parts.join(", ");
        const all = r.occurrences > 1 ? ` All ${r.occurrences} upcoming meetings in the series changed.` : "";
        toast.success((text ? `Saved. ${text[0]!.toUpperCase()}${text.slice(1)}.` : "Saved.") + all);
      } else {
        const m = await meetingsApi.create({ ...result.data, timeZone: timeZone() });
        saveHostKey(m.roomCode, m.hostKey);
        const link = `${location.origin}/m/${m.roomCode}`;
        const what = m.occurrences > 1 ? `Scheduled ${m.occurrences} ${result.data.repeat === "DAILY" ? "daily" : "weekly"} meetings.` : "Scheduled.";
        toast.success(m.invited ? `${what} Invites are on their way to ${people(m.invited)}.` : what, {
          action: { label: "Copy link", onClick: () => void navigator.clipboard?.writeText(link) },
        });
        setForm(blank());
      }
      setOpen(false);
      onScheduled?.();
    } catch (err) {
      const f = fieldErrors(err);
      setErrors(f ? Object.fromEntries(Object.entries(f).map(([k, v]) => [k === "scheduledFor" ? "time" : k === "invitees" ? "guests" : k, v[0]!])) : { form: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  const err = (k: string) =>
    errors[k] && (
      <p id={`s-${k}-err`} role="alert" className="text-sm text-destructive">
        {errors[k]}
      </p>
    );
  const invalid = (k: string) => ({ "aria-invalid": !!errors[k], "aria-describedby": errors[k] ? `s-${k}-err` : undefined });
  const lengths = DURATIONS.includes(Number(form.durationMin)) ? DURATIONS : [...DURATIONS, Number(form.durationMin)].sort((a, b) => a - b);

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent>
        <DialogTitle>{editing ? "Edit meeting" : "Schedule a meeting"}</DialogTitle>
        <DialogDescription>
          {editing
            ? "Guests get an updated invite and their calendar moves the meeting. People you remove get a cancellation."
            : "Guests get an email with a calendar invite and the link. No account needed to join."}
        </DialogDescription>
        {loading ? (
          <div role="status" aria-label="Loading meeting" className="space-y-3">
            <Skeleton className="h-11 rounded-2xl" />
            <div className="grid gap-3 sm:grid-cols-3">
              <Skeleton className="h-11 rounded-2xl" />
              <Skeleton className="h-11 rounded-2xl" />
              <Skeleton className="h-11 rounded-2xl" />
            </div>
            <Skeleton className="h-24 rounded-2xl" />
            <Skeleton className="h-11 rounded-2xl" />
          </div>
        ) : (
          <form onSubmit={submit} noValidate className="space-y-3">
            <div className="space-y-1.5">
              <label htmlFor="s-title" className="text-sm font-medium">
                Title <span className="text-destructive" aria-hidden>*</span>
              </label>
              <input id="s-title" required aria-required className={field} placeholder="Weekly sync" maxLength={100} value={form.title} onChange={set("title")} {...invalid("title")} />
              {err("title")}
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <label htmlFor="s-date" className="text-sm font-medium">Date</label>
                <input id="s-date" type="date" className={field} value={form.date} onChange={set("date")} {...invalid("date")} />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="s-time" className="text-sm font-medium">Time</label>
                <input id="s-time" type="time" className={field} value={form.time} onChange={set("time")} {...invalid("time")} />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="s-len" className="text-sm font-medium">Length</label>
                <select id="s-len" className={field} value={form.durationMin} onChange={set("durationMin")}>
                  {lengths.map((d) => (
                    <option key={d} value={d}>
                      {lengthLabel(d)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {err("date") ?? err("time")}
            {editing ? (
              series && (
                <p className="flex items-start gap-2 rounded-2xl bg-muted px-3 py-2.5 text-sm">
                  <Repeat className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>
                    Repeats {series.recurrence === "DAILY" ? "daily" : "weekly"}. Changes apply to all {series.left} upcoming meetings in this
                    series; a new time moves them all.
                  </span>
                </p>
              )
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="s-repeat" className="text-sm font-medium">Repeat</label>
                  <select id="s-repeat" className={field} value={form.repeat} onChange={set("repeat")}>
                    <option value="">Doesn't repeat</option>
                    <option value="DAILY">Every day</option>
                    <option value="WEEKLY">Every week</option>
                  </select>
                </div>
                {form.repeat && (
                  <div className="space-y-1.5">
                    <label htmlFor="s-count" className="text-sm font-medium">How many meetings</label>
                    <select id="s-count" className={field} value={form.repeatCount} onChange={set("repeatCount")}>
                      {Array.from({ length: 11 }, (_, i) => i + 2).map((n) => (
                        <option key={n} value={n}>
                          {n} meetings
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}
            {!editing && teams.length > 0 && (
              <div className="space-y-1.5">
                <label htmlFor="s-team" className="text-sm font-medium">Who's it for</label>
                <select id="s-team" className={field} value={form.teamId} onChange={set("teamId")}>
                  <option value="">Just me</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      Team: {t.name}
                    </option>
                  ))}
                </select>
                {form.teamId && <p className="text-xs text-muted-foreground">Everyone in the team sees it, its notes and recordings. Team settings apply.</p>}
              </div>
            )}
            <div className="space-y-1.5">
              <label htmlFor="s-guests" className="text-sm font-medium">
                Guests <span className="font-normal text-muted-foreground">(optional)</span>
              </label>
              <textarea
                id="s-guests"
                rows={3}
                className={`${field} h-auto py-2.5`}
                placeholder="asha@example.com, ravi@example.com"
                value={form.guests}
                onChange={set("guests")}
                {...invalid("guests")}
              />
              {err("guests") ?? <p className="text-xs text-muted-foreground">Up to 20 emails, separated by commas or new lines.</p>}
              {editing && replies.length > 0 && (
                <ul aria-label="Guest replies" className="flex flex-wrap gap-1.5 pt-1">
                  {replies.map((r) => (
                    <li key={r.email} className={`max-w-full truncate rounded-lg px-2 py-1 text-xs font-medium ${r.response ? REPLY[r.response].cls : "bg-muted text-muted-foreground"}`}>
                      {r.email} · {r.response ? REPLY[r.response].label : "No reply yet"}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {err("form")}
            <button
              type="submit"
              disabled={busy}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-brand font-semibold text-ink-950 transition hover:brightness-95 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-popover focus-visible:outline-none disabled:opacity-60"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : editing ? <CalendarCheck className="size-4" /> : <CalendarPlus className="size-4" />}
              {editing ? (form.guests.trim() ? "Save and update guests" : "Save changes") : form.guests.trim() ? "Schedule and send invites" : "Schedule"}
            </button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
