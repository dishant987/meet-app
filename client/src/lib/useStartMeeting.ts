import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { errorMessage, meetingsApi } from "@/lib/api";
import { saveHostKey } from "@/lib/meetingAccess";

/** Creates a meeting (this browser keeps the host key). `start()` opens it; `createLink()` copies its link for later. */
export function useStartMeeting() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState<"start" | "link" | null>(null);

  async function create(kind: "start" | "link") {
    setBusy(kind);
    try {
      const m = await meetingsApi.create();
      saveHostKey(m.roomCode, m.hostKey);
      if (kind === "start") return navigate(`/m/${m.roomCode}`);
      const link = `${location.origin}/m/${m.roomCode}`;
      try {
        await navigator.clipboard.writeText(link);
        toast.success("Meeting link copied. Share it now, start it any time.");
      } catch {
        toast(`Meeting link: ${link}`, { duration: 20_000 });
      }
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return { busy, start: () => create("start"), createLink: () => create("link") };
}
