import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { errorMessage, meetingsApi, type HostState } from "@/lib/api";
import { getHostKey } from "@/lib/meetingAccess";

export type HostControls = ReturnType<typeof useHostControls>;

const POLL_MS = 3000;

/** Host only: who's waiting to join, the "Ask to join" / lock switches, and mute / remove. */
export function useHostControls(roomCode: string) {
  const hostKey = getHostKey(roomCode);
  const [state, setState] = useState<HostState | null>(null);
  const announced = useRef(new Set<string>());

  const refresh = useCallback(async () => {
    try {
      setState(await meetingsApi.hostState(roomCode, hostKey));
    } catch {
      /* try again on the next tick */
    }
  }, [roomCode, hostKey]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const answer = useCallback(
    async (id: string, admit: boolean) => {
      toast.dismiss(`wait-${id}`);
      setState((s) => s && { ...s, waiting: s.waiting.filter((w) => w.id !== id) });
      try {
        await meetingsApi.answerRequest(roomCode, id, admit, hostKey);
      } catch (err) {
        toast.error(errorMessage(err));
      }
      void refresh();
    },
    [roomCode, hostKey, refresh],
  );

  // A toast with Admit / Deny for each new person knocking (the People panel lists them too).
  useEffect(() => {
    for (const w of state?.waiting ?? []) {
      if (announced.current.has(w.id)) continue;
      announced.current.add(w.id);
      toast(`${w.name} wants to join`, {
        id: `wait-${w.id}`,
        duration: 20_000,
        action: { label: "Admit", onClick: () => void answer(w.id, true) },
        cancel: { label: "Deny", onClick: () => void answer(w.id, false) },
      });
    }
  }, [state?.waiting, answer]);

  async function setSetting(change: { waitingRoom?: boolean; locked?: boolean }) {
    setState((s) => s && { ...s, ...change });
    try {
      await meetingsApi.updateSettings(roomCode, change, hostKey);
      if (change.locked !== undefined) toast(change.locked ? "Meeting locked. Nobody new can join." : "Meeting unlocked");
    } catch (err) {
      toast.error(errorMessage(err));
    }
    void refresh();
  }

  async function mute(id: string, name: string) {
    try {
      await meetingsApi.muteParticipant(roomCode, id, hostKey);
      toast(`${name} is muted`);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function remove(id: string, name: string) {
    try {
      await meetingsApi.removeParticipant(roomCode, id, hostKey);
      toast(`${name} was removed`);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return { state, answer, setSetting, mute, remove };
}
