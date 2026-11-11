import { useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { CalendarPlus, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { errorMessage, fieldErrors, meetingsApi } from "@/lib/api";
import { saveHostKey } from "@/lib/meetingAccess";
import { check, scheduleForm, type FormErrors } from "@/lib/validation";

const field =
  "h-11 w-full rounded-2xl border border-border bg-background px-3 text-sm placeholder:text-muted-foreground focus-visible:border-brand focus-visible:outline-none aria-invalid:border-destructive";
const DURATIONS = [15, 30, 45, 60, 90, 120];

/** Next half hour, as the form's starting date/time (local). */
function nextSlot() {
  const d = new Date(Date.now() + 30 * 60_000);
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}

/** "Schedule" button + form: pick a time, add guests, they get an email with a calendar invite. */
export function ScheduleDialog({ trigger, onScheduled }: { trigger: ReactNode; onScheduled?: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [form, setForm] = useState(() => ({ title: "", ...nextSlot(), durationMin: "30", guests: "" }));
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setErrors(({ [k]: _gone, form: _f, ...rest }) => rest);
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    const result = check(scheduleForm, form);
    if (result.errors) return setErrors(result.errors);
    setBusy(true);
    try {
      const m = await meetingsApi.create({ ...result.data, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone });
      saveHostKey(m.roomCode, m.hostKey);
      const link = `${location.origin}/m/${m.roomCode}`;
      toast.success(m.invited ? `Scheduled. Invites are on their way to ${m.invited} ${m.invited === 1 ? "person" : "people"}.` : "Scheduled.", {
        action: { label: "Copy link", onClick: () => void navigator.clipboard?.writeText(link) },
      });
      setOpen(false);
      setForm({ title: "", ...nextSlot(), durationMin: "30", guests: "" });
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

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogTitle>Schedule a meeting</DialogTitle>
        <DialogDescription>Guests get an email with a calendar invite and the link. No account needed to join.</DialogDescription>
        <form onSubmit={submit} noValidate className="space-y-3">
          <div className="space-y-1.5">
            <label htmlFor="s-title" className="text-sm font-medium">Title</label>
            <input id="s-title" className={field} placeholder="Weekly sync" maxLength={100} value={form.title} onChange={set("title")} {...invalid("title")} />
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
                {DURATIONS.map((d) => (
                  <option key={d} value={d}>{d < 60 ? `${d} min` : `${d / 60} h${d % 60 ? " 30 min" : ""}`}</option>
                ))}
              </select>
            </div>
          </div>
          {err("date") ?? err("time")}
          <div className="space-y-1.5">
            <label htmlFor="s-guests" className="text-sm font-medium">Guests <span className="font-normal text-muted-foreground">(optional)</span></label>
            <textarea id="s-guests" rows={3} className={`${field} h-auto py-2.5`} placeholder="asha@example.com, ravi@example.com"
              value={form.guests} onChange={set("guests")} {...invalid("guests")} />
            {err("guests") ?? <p className="text-xs text-muted-foreground">Up to 20 emails, separated by commas or new lines.</p>}
          </div>
          {err("form")}
          <button
            type="submit"
            disabled={busy}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-brand font-semibold text-ink-950 transition hover:brightness-95 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-popover focus-visible:outline-none disabled:opacity-60"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <CalendarPlus className="size-4" />}
            {form.guests.trim() ? "Schedule and send invites" : "Schedule"}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
