import { useState } from "react";
import { toast } from "sonner";
import { CalendarX, Link2, Loader2, MoreHorizontal, Pencil } from "lucide-react";
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

/** "⋯" menu on an upcoming meeting: Edit, Copy link, Cancel meeting. */
export function MeetingActions({ m, onChanged, className }: { m: MyMeeting; onChanged: () => void; className?: string }) {
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  async function copyLink() {
    setMenu(false);
    try {
      await navigator.clipboard.writeText(`${location.origin}/m/${m.roomCode}`);
      toast.success("Meeting link copied");
    } catch {
      toast(`Meeting link: ${location.origin}/m/${m.roomCode}`);
    }
  }

  async function cancel() {
    setCancelling(true);
    try {
      const r = await meetingsApi.cancelMeeting(m.roomCode, getHostKey(m.roomCode));
      toast.success(r.notified ? `Meeting cancelled. ${r.notified} ${r.notified === 1 ? "guest was" : "guests were"} told.` : "Meeting cancelled.");
      setConfirm(false);
      onChanged();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setCancelling(false);
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
          <button type="button" className={cn(item, "text-destructive")} onClick={() => (setMenu(false), setConfirm(true))}>
            <CalendarX className="size-4" aria-hidden /> Cancel meeting
          </button>
        </PopoverContent>
      </Popover>

      <ScheduleDialog editRoomCode={m.roomCode} open={editing} onOpenChange={setEditing} onScheduled={onChanged} />

      <AlertDialog open={confirm} onOpenChange={(o) => !cancelling && setConfirm(o)}>
        <AlertDialogContent className="rounded-3xl sm:max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel "{m.title}"?</AlertDialogTitle>
            <AlertDialogDescription>
              {m.invitedCount
                ? `${m.invitedCount} ${m.invitedCount === 1 ? "guest gets" : "guests get"} a cancellation email and it's removed from their calendar. `
                : ""}
              The link stops working. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling} className="rounded-xl">
              Keep meeting
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={cancelling}
              onClick={(e) => {
                e.preventDefault(); // stay open until it's done
                void cancel();
              }}
              className="rounded-xl bg-red-500 text-white hover:bg-red-600"
            >
              {cancelling && <Loader2 className="size-4 animate-spin" />} Cancel meeting
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
