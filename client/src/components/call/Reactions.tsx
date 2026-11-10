import { useCallback, useRef, useState } from "react";
import { useDataChannel } from "@livekit/components-react";

export const REACTION_EMOJIS = ["💖", "👍", "🎉", "👏", "😂", "😮", "😢", "🤔", "👎"];

type Floating = { id: number; emoji: string; name: string; left: number };
const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Sends emoji reactions to everyone and keeps the list of emojis currently floating on screen. */
export function useReactions() {
  const [floating, setFloating] = useState<Floating[]>([]);
  const lastSent = useRef(0);
  const nextId = useRef(0);

  const show = useCallback((emoji: string, name: string) => {
    if (!REACTION_EMOJIS.includes(emoji)) return; // ignore anything that isn't one of ours
    const id = nextId.current++;
    setFloating((f) => [...f.slice(-30), { id, emoji, name, left: 6 + Math.random() * 28 }]);
    setTimeout(() => setFloating((f) => f.filter((x) => x.id !== id)), 3700);
  }, []);

  const onMessage = useCallback(
    (msg: { payload: Uint8Array; from?: { name?: string } }) => {
      try {
        const { emoji } = JSON.parse(decoder.decode(msg.payload));
        show(emoji, msg.from?.name || "Someone");
      } catch {
        /* ignore malformed messages */
      }
    },
    [show],
  );
  const { send } = useDataChannel("reaction", onMessage);

  const react = useCallback(
    (emoji: string) => {
      const now = Date.now();
      if (now - lastSent.current < 300) return; // light spam guard
      lastSent.current = now;
      show(emoji, "You");
      send(encoder.encode(JSON.stringify({ emoji })), { reliable: false }).catch(() => {});
    },
    [send, show],
  );

  return { floating, react };
}

export function FloatingReactions({ items }: { items: Floating[] }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-live="polite">
      {items.map((r) => (
        <div key={r.id} className="animate-float-up absolute bottom-4 flex flex-col items-center" style={{ left: `${r.left}%` }}>
          <span className="text-4xl drop-shadow-[0_6px_16px_rgb(0_0_0/0.5)] sm:text-5xl">{r.emoji}</span>
          <span className="mt-1 rounded-lg bg-ink-950/70 px-2 py-0.5 text-xs font-medium text-white backdrop-blur">{r.name}</span>
        </div>
      ))}
    </div>
  );
}
