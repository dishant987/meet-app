import { useEffect, useRef, useState, type FormEvent } from "react";
import { Track, type Participant } from "livekit-client";
import { useIsMuted, useIsSpeaking, useParticipantAttributes, type ReceivedChatMessage } from "@livekit/components-react";
import { ArrowUp, Check, Hand, Link2, Mic, MicOff, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { Avatar } from "./Avatar";
import { displayName } from "./ParticipantTile";
import type { Panel } from "./ControlBar";

function PersonRow({ participant }: { participant: Participant }) {
  const muted = useIsMuted({ participant, source: Track.Source.Microphone });
  const speaking = useIsSpeaking(participant);
  const { attributes } = useParticipantAttributes({ participant });
  const name = displayName(participant);
  return (
    <li className="flex items-center gap-3 rounded-2xl px-2 py-2 hover:bg-white/[0.04]">
      <Avatar name={name} size="sm" />
      <span className="min-w-0 flex-1 truncate text-sm">
        {name}
        {participant.isLocal && <span className="text-ink-500"> · you</span>}
      </span>
      {attributes?.hand === "up" && <Hand className="size-4 text-amber-300" aria-label="Hand raised" />}
      {muted ? (
        <MicOff className="size-4 text-red-300" aria-label="Microphone off" />
      ) : (
        <Mic className={cn("size-4", speaking ? "text-brand" : "text-ink-500")} aria-label="Microphone on" />
      )}
    </li>
  );
}

function People({ participants }: { participants: Participant[] }) {
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
      <p className="px-2 text-xs text-ink-500">{participants.length} in this call</p>
      <ul className="min-h-0 flex-1 overflow-y-auto">
        {sorted.map((p) => (
          <PersonRow key={p.identity} participant={p} />
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
    const msg = text.trim();
    if (!msg) return;
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
            No messages yet. Messages are visible to everyone in the call and disappear when it ends.
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
};

/** One floating card with People / Chat tabs. Desktop: right side. Phone: covers the video area. */
export function SidePanel({ panel, setPanel, unreadChat, participants, chat }: Props) {
  const tabs = [
    { id: "people" as const, label: `People · ${participants.length}` },
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
      {panel === "people" ? <People participants={participants} /> : <Chat {...chat} />}
    </aside>
  );
}
