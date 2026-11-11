import { useEffect, useRef, useState, type FormEvent } from "react";
import { Track, type Participant } from "livekit-client";
import { useIsMuted, useIsSpeaking, useParticipantAttributes, type ReceivedChatMessage } from "@livekit/components-react";
import { ArrowUp, Check, Crown, DoorOpen, Hand, Link2, Lock, Mic, MicOff, MoreVertical, UserMinus, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { Avatar } from "./Avatar";
import { assetUrl } from "@/lib/api";
import { displayName } from "./ParticipantTile";
import type { Panel } from "./ControlBar";
import type { HostControls } from "./useHostControls";
import { chatMessageForm, check } from "@/lib/validation";
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

const menuItem =
  "flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm hover:bg-white/[0.06] focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none disabled:opacity-40";

/** Host's menu on someone else's row: mute their mic, or remove them (asks first). */
function PersonMenu({ name, muted, onMute, onRemove }: { name: string; muted: boolean; onMute: () => void; onRemove: () => void }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`Options for ${name}`}
            className="flex size-8 items-center justify-center rounded-lg text-ink-300 hover:bg-white/[0.08] hover:text-white focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
          >
            <MoreVertical className="size-4" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="dark w-52 rounded-2xl border-white/10 bg-ink-900 p-1.5 text-white">
          <button
            type="button"
            disabled={muted}
            className={menuItem}
            onClick={() => {
              setOpen(false);
              onMute();
            }}
          >
            <MicOff className="size-4" /> {muted ? "Already muted" : "Mute microphone"}
          </button>
          <button
            type="button"
            className={cn(menuItem, "text-red-300")}
            onClick={() => {
              setOpen(false);
              setConfirm(true);
            }}
          >
            <UserMinus className="size-4" /> Remove from call
          </button>
        </PopoverContent>
      </Popover>
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent className="dark rounded-3xl border-white/10 bg-ink-900 text-white sm:max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {name}?</AlertDialogTitle>
            <AlertDialogDescription className="text-ink-300">
              They leave the call right away. Turn on "Ask to join" or lock the meeting to stop them coming back.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="border-white/10 bg-white/[0.03]">
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onRemove} className="rounded-xl bg-red-500 text-white hover:bg-red-600">
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** On/off switch with a label and a one-line explanation. */
function SettingSwitch({
  icon: Icon,
  label,
  hint,
  on,
  onChange,
}: {
  icon: typeof Lock;
  label: string;
  hint: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2 hover:bg-white/[0.04]">
      <Icon className={cn("size-4 shrink-0 transition-colors", on ? "text-brand" : "text-ink-500")} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-ink-500">{hint}</span>
      </span>
      <input type="checkbox" role="switch" checked={on} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span
        aria-hidden
        className="relative h-6 w-10 shrink-0 rounded-full bg-white/15 transition-colors peer-checked:bg-brand peer-focus-visible:ring-2 peer-focus-visible:ring-brand after:absolute after:top-1 after:left-1 after:size-4 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-4 peer-checked:after:bg-ink-950"
      />
    </label>
  );
}

/** Host-only block at the top of People: the two switches and anyone waiting to get in. */
function HostBlock({ host }: { host: HostControls }) {
  const { state } = host;
  if (!state) return null;
  return (
    <div className="space-y-1 rounded-2xl border border-white/[0.08] bg-ink-950/60 p-2">
      <p className="px-2 pt-1 text-xs font-medium tracking-wide text-ink-500 uppercase">Host controls</p>
      <SettingSwitch
        icon={DoorOpen}
        label="Ask to join"
        hint="People wait until you let them in"
        on={state.waitingRoom}
        onChange={(v) => void host.setSetting({ waitingRoom: v })}
      />
      <SettingSwitch
        icon={Lock}
        label="Lock meeting"
        hint="Nobody new can join"
        on={state.locked}
        onChange={(v) => void host.setSetting({ locked: v })}
      />
      {state.waiting.length > 0 && (
        <div className="space-y-1 border-t border-white/[0.06] pt-2" aria-live="polite">
          <div className="flex items-center justify-between px-2">
            <p className="text-sm font-medium text-amber-300">Waiting to join · {state.waiting.length}</p>
            {state.waiting.length > 1 && (
              <button
                type="button"
                onClick={() => state.waiting.forEach((w) => void host.answer(w.id, true))}
                className="rounded-lg px-2 py-1 text-xs font-medium text-brand hover:bg-white/[0.06] focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
              >
                Admit all
              </button>
            )}
          </div>
          <ul>
            {state.waiting.map((w) => (
              <li key={w.id} className="animate-pop-in flex items-center gap-2 rounded-xl px-2 py-1.5">
                <Avatar name={w.name} size="sm" src={assetUrl(w.avatarUrl ?? undefined)} />
                <span className="min-w-0 flex-1 truncate text-sm">{w.name}</span>
                <button
                  type="button"
                  onClick={() => void host.answer(w.id, false)}
                  className="h-8 rounded-lg px-2.5 text-xs font-medium text-ink-300 hover:bg-white/[0.08] hover:text-white focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
                >
                  Deny
                </button>
                <button
                  type="button"
                  onClick={() => void host.answer(w.id, true)}
                  className="h-8 rounded-lg bg-brand px-3 text-xs font-semibold text-ink-950 hover:brightness-95 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-ink-900 focus-visible:outline-none"
                >
                  Admit
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function PersonRow({ participant, host }: { participant: Participant; host?: HostControls | null }) {
  const muted = useIsMuted({ participant, source: Track.Source.Microphone });
  const speaking = useIsSpeaking(participant);
  const { attributes } = useParticipantAttributes({ participant });
  const name = displayName(participant);
  return (
    <li className="flex items-center gap-3 rounded-2xl px-2 py-2 hover:bg-white/[0.04]">
      <Avatar name={name} size="sm" src={assetUrl(attributes?.avatar)} />
      <span className="min-w-0 flex-1 truncate text-sm">
        {name}
        {participant.isLocal && <span className="text-ink-500"> · you</span>}
      </span>
      {attributes?.role === "host" && (
        <span className="flex items-center gap-1 rounded-lg bg-brand/15 px-1.5 py-0.5 text-[11px] font-medium text-brand">
          <Crown className="size-3" aria-hidden /> Host
        </span>
      )}
      {attributes?.hand === "up" && <Hand className="size-4 text-amber-300" aria-label="Hand raised" />}
      {muted ? (
        <MicOff className="size-4 text-red-300" aria-label="Microphone off" />
      ) : (
        <Mic className={cn("size-4", speaking ? "text-brand" : "text-ink-500")} aria-label="Microphone on" />
      )}
      {host && !participant.isLocal && attributes?.role !== "host" && (
        <PersonMenu
          name={name}
          muted={muted}
          onMute={() => void host.mute(participant.identity, name)}
          onRemove={() => void host.remove(participant.identity, name)}
        />
      )}
    </li>
  );
}

function People({ participants, host }: { participants: Participant[]; host?: HostControls | null }) {
  const [copied, setCopied] = useState(false);
  const raised = (p: Participant) => (p.attributes?.hand === "up" ? 0 : 1);
  const sorted = [...participants].sort((a, b) => raised(a) - raised(b));

  async function copy() {
    try {
      await navigator.clipboard.writeText(location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy. Copy the link from the address bar instead.");
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
      <button
        type="button"
        onClick={copy}
        className="flex items-center gap-3 rounded-2xl border border-dashed border-white/15 p-3 text-left hover:border-brand/60 hover:bg-brand-soft focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
      >
        <span className="flex size-9 items-center justify-center rounded-xl bg-brand text-ink-950">
          {copied ? <Check className="size-4" /> : <Link2 className="size-4" />}
        </span>
        <span>
          <span className="block text-sm font-medium">{copied ? "Link copied" : "Invite people"}</span>
          <span className="block text-xs text-ink-300">Copy the meeting link and share it</span>
        </span>
      </button>
      {host && <HostBlock host={host} />}
      <p className="px-2 text-xs text-ink-500">{participants.length} in this call</p>
      <ul className="min-h-0 flex-1 overflow-y-auto">
        {sorted.map((p) => (
          <PersonRow key={p.identity} participant={p} host={host} />
        ))}
      </ul>
    </div>
  );
}

function Chat({
  messages,
  send,
  isSending,
}: {
  messages: ReceivedChatMessage[];
  send: (text: string) => Promise<unknown>;
  isSending: boolean;
}) {
  const [text, setText] = useState("");
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const result = check(chatMessageForm, { message: text });
    if (result.errors) {
      if (text.trim()) toast.error(result.errors.message!); // empty: just do nothing
      return;
    }
    const msg = result.data.message;
    setText("");
    try {
      await send(msg);
    } catch {
      setText(msg); // put it back so nothing is lost
      toast.error("Message not sent. Check your connection and try again.");
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ul ref={listRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3" aria-live="polite">
        {messages.length === 0 && (
          <li className="mt-6 px-4 text-center text-sm text-ink-500">
            No messages yet. Messages are visible to everyone in the call and are kept with the meeting notes.
          </li>
        )}
        {messages.map((m, i) => {
          const mine = !!m.from?.isLocal;
          const sameAsPrev = messages[i - 1]?.from?.identity === m.from?.identity;
          return (
            <li key={m.id} className={cn("flex flex-col", mine ? "items-end" : "items-start")}>
              {!sameAsPrev && (
                <span className="mb-1 px-1 text-xs text-ink-500">
                  {mine ? "You" : m.from ? displayName(m.from) : "Someone"} ·{" "}
                  {new Date(m.timestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                </span>
              )}
              <p
                className={cn(
                  "max-w-[85%] rounded-2xl px-3 py-2 text-sm break-words whitespace-pre-wrap",
                  mine ? "rounded-br-md bg-brand text-ink-950" : "rounded-bl-md bg-white/[0.07] text-white",
                )}
              >
                {m.message}
              </p>
            </li>
          );
        })}
      </ul>
      <form onSubmit={submit} className="flex items-center gap-2 p-3">
        <input
          aria-label="Message"
          placeholder="Write a message…"
          maxLength={1000}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="h-11 min-w-0 flex-1 rounded-2xl border border-white/10 bg-ink-950 px-4 text-sm text-white placeholder:text-ink-500 focus-visible:border-brand/60 focus-visible:outline-none"
        />
        <button
          type="submit"
          aria-label="Send message"
          disabled={!text.trim() || isSending}
          className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-brand text-ink-950 transition-opacity hover:brightness-95 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-ink-900 focus-visible:outline-none disabled:opacity-30"
        >
          <ArrowUp className="size-5" />
        </button>
      </form>
    </div>
  );
}

type Props = {
  panel: Exclude<Panel, null>;
  setPanel: (p: Panel) => void;
  unreadChat: number;
  participants: Participant[];
  chat: { messages: ReceivedChatMessage[]; send: (text: string) => Promise<unknown>; isSending: boolean };
  /** Present only for the host. */
  host?: HostControls | null;
};

/** One floating card with People / Chat tabs. Desktop: right side. Phone: covers the video area. */
export function SidePanel({ panel, setPanel, unreadChat, participants, chat, host }: Props) {
  const waiting = host?.state?.waiting.length ?? 0;
  const tabs = [
    { id: "people" as const, label: waiting ? `People · ${waiting} waiting` : `People · ${participants.length}` },
    { id: "chat" as const, label: unreadChat ? `Chat · ${unreadChat} new` : "Chat" },
  ];
  return (
    <aside
      aria-label="Meeting side panel"
      className="animate-pop-in absolute inset-0 z-20 flex flex-col overflow-hidden rounded-3xl border border-white/[0.08] bg-ink-900 text-white sm:static sm:ml-3 sm:w-[22rem] sm:shrink-0"
    >
      <div className="flex items-center gap-2 p-2">
        <div role="tablist" aria-label="Panel" className="flex flex-1 rounded-2xl bg-ink-950 p-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              type="button"
              aria-selected={panel === t.id}
              onClick={() => setPanel(t.id)}
              className={cn(
                "flex-1 rounded-xl px-3 py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none",
                panel === t.id ? "bg-ink-800 text-white" : "text-ink-300 hover:text-white",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setPanel(null)}
          aria-label="Close panel"
          className="flex size-10 items-center justify-center rounded-xl text-ink-300 hover:bg-white/[0.06] hover:text-white focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
        >
          <X className="size-5" />
        </button>
      </div>
      {panel === "people" ? <People participants={participants} host={host} /> : <Chat {...chat} />}
    </aside>
  );
}
