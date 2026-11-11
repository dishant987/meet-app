import { useState } from "react";
import { toast } from "sonner";
import { CalendarPlus, CalendarX, Link2, Loader2, MoreHorizontal, Pencil } from "lucide-react";
import { cn } from "cn";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
import { ScheduleDialog } from "@/components/ScheduleDialog";
import { errorMessage, meetingsApi, type MyMeeting } from "@/lib/api";
import { getHostKey } from "@/lib/meetingAccess";

/** Only for meetings you host that haven't started and have a planned time (like a calendar invite). */
export const canManage = (m: MyMeeting) => m.isHost && m.status === "SCHEDULED" && !!m.scheduledFor;

const item =
  "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none";

/** One-off "add this meeting" links for Google Calendar and Outlook (no sign-in to MeetApp needed there). */
function calendarLinks(m: MyMeeting) {
  const start = new Date(m.scheduledFor!);
  const end = new Date(start.getTime() + (m.durationMin ?? 30) * 60_000);
  const link = `${location.origin}/m/${m.roomCode}`;
  const g = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const google = new URLSearchParams({ action: "TEMPLATE", text: m.title, dates: `${g(start)}/${g(end)}`, details: `Join: ${link}`, location: link });
  const outlook = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: m.title,
    startdt: start.toISOString(),
    enddt: end.toISOString(),
    body: `Join: ${link}`,
    location: link,
  });
  return {
    google: `https://calendar.google.com/calendar/render?${google}`,
    outlook: `https://outlook.live.com/calendar/0/deeplink/compose?${outlook}`,
  };
}

/** "⋯" menu on an upcoming meeting: Edit, Copy link, add to a calendar, Cancel meeting. */
export function MeetingActions({ m, onChanged, className }: { m: MyMeeting; onChanged: () => void; className?: string }) {
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [cancelling, setCancelling] = useState<"one" | "series" | null>(null);
  const repeats = !!m.seriesId;

  async function copyLink() {
    setMenu(false);
    try {
      await navigator.clipboard.writeText(`${location.origin}/m/${m.roomCode}`);
      toast.success("Meeting link copied");
    } catch {
      toast(`Meeting link: ${location.origin}/m/${m.roomCode}`);
    }
  }

  async function cancel(scope: "one" | "series") {
    setCancelling(scope);
    try {
      const r = await meetingsApi.cancelMeeting(m.roomCode, getHostKey(m.roomCode), scope);
      const what = scope === "series" ? "All upcoming meetings in the series cancelled." : "Meeting cancelled.";
      toast.success(r.notified ? `${what} ${r.notified} ${r.notified === 1 ? "guest was" : "guests were"} told.` : what);
      setConfirm(false);
      onChanged();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setCancelling(null);
    }
  }

  return (
    <>
      <Popover open={menu} onOpenChange={setMenu}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`Options for ${m.title}`}
            className={cn(
              "flex size-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none",
              className,
            )}
          >
            <MoreHorizontal className="size-4" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-52 gap-0.5 rounded-2xl p-1.5">
          <button type="button" className={item} onClick={() => (setMenu(false), setEditing(true))}>
            <Pencil className="size-4" aria-hidden /> Edit
          </button>
          <button type="button" className={item} onClick={copyLink}>
            <Link2 className="size-4" aria-hidden /> Copy link
          </button>
          {m.scheduledFor && (
            <>
              <a className={item} href={calendarLinks(m).google} target="_blank" rel="noreferrer" onClick={() => setMenu(false)}>
                <CalendarPlus className="size-4" aria-hidden /> Add to Google Calendar
              </a>
              <a className={item} href={calendarLinks(m).outlook} target="_blank" rel="noreferrer" onClick={() => setMenu(false)}>
                <CalendarPlus className="size-4" aria-hidden /> Add to Outlook
              </a>
            </>
          )}
          <button type="button" className={cn(item, "text-destructive")} onClick={() => (setMenu(false), setConfirm(true))}>
            <CalendarX className="size-4" aria-hidden /> Cancel meeting
          </button>
        </PopoverContent>
      </Popover>

      <ScheduleDialog editRoomCode={m.roomCode} open={editing} onOpenChange={setEditing} onScheduled={onChanged} />

      <AlertDialog open={confirm} onOpenChange={(o) => !cancelling && setConfirm(o)}>
        <AlertDialogContent className={cn("rounded-3xl", repeats ? "sm:max-w-md!" : "sm:max-w-sm")}>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel "{m.title}"?</AlertDialogTitle>
            <AlertDialogDescription>
              {m.invitedCount
                ? `${m.invitedCount} ${m.invitedCount === 1 ? "guest gets" : "guests get"} a cancellation email and it's removed from their calendar. `
                : ""}
              {repeats
                ? "This meeting repeats: cancel just this one, or this and every later one. Cancelled links stop working. This can't be undone."
                : "The link stops working. This can't be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!cancelling} className="rounded-xl">
              Keep meeting
            </AlertDialogCancel>
            {repeats && (
              <AlertDialogAction
                disabled={!!cancelling}
                onClick={(e) => {
                  e.preventDefault(); // stay open until it's done
                  void cancel("series");
                }}
                className="rounded-xl border border-red-500/40 bg-transparent text-red-600 hover:bg-red-500/10 dark:text-red-400"
              >
                {cancelling === "series" && <Loader2 className="size-4 animate-spin" />} Cancel all upcoming
              </AlertDialogAction>
            )}
            <AlertDialogAction
              disabled={!!cancelling}
              onClick={(e) => {
                e.preventDefault(); // stay open until it's done
                void cancel("one");
              }}
              className="rounded-xl bg-red-500 text-white hover:bg-red-600"
            >
              {cancelling === "one" && <Loader2 className="size-4 animate-spin" />} {repeats ? "Cancel this one" : "Cancel meeting"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
