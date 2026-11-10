import { Languages } from "lucide-react";
import { CAPTION_LANGUAGES } from "@/lib/speech";
import type { CaptionEntry } from "./useCaptions";
import { Avatar } from "./Avatar";

type Props = { captions: CaptionEntry[] };

/** Last `max` characters, cut at a word boundary, so long run-on speech stays short. */
function tail(text: string, max: number) {
  if (text.length <= max) return text;
  const cut = text.slice(-max);
  const space = cut.indexOf(" ");
  return "…" + (space > 0 && space < 20 ? cut.slice(space + 1) : cut);
}

/**
 * Subtitles above the name labels. Per speaker: avatar, name, the last finished sentence (dim) and the
 * words being spoken now (bright) — never more than about two short lines.
 */
export function CaptionsOverlay({ captions }: Props) {
  if (captions.length === 0) return null;
  return (
    <div
      role="log"
      aria-live="polite"
      aria-label="Live captions"
      className="pointer-events-none absolute inset-x-3 bottom-12 z-10 mx-auto flex max-w-2xl flex-col gap-1.5"
    >
      {captions.map((c) => {
        const current = c.current || c.previous; // after a sentence ends, keep showing it until new words come
        const previous = c.current ? c.previous : "";
        return (
          <div
            key={c.identity}
            className="animate-pop-in flex items-start gap-3 rounded-2xl border border-white/[0.06] bg-ink-950/75 px-3 py-2.5 shadow-lg shadow-black/30 backdrop-blur-md"
          >
            <Avatar name={c.name} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-brand">{c.name}</p>
              <p className="text-[15px] leading-snug sm:text-base">
                {previous && <span className="text-ink-300">{tail(previous, 60)} </span>}
                <span className="text-white">{tail(current, previous ? 80 : 130)}</span>
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** "The language I speak" picker shown next to the Captions-on label. */
export function LanguagePicker({ lang, setLang }: { lang: string; setLang: (code: string) => void }) {
  const known = CAPTION_LANGUAGES.some((l) => l.code === lang);
  return (
    <label className="pointer-events-auto flex items-center gap-1.5 rounded-xl bg-ink-950/70 px-2 py-1 text-xs text-ink-300 backdrop-blur focus-within:ring-2 focus-within:ring-brand">
        <Languages className="size-3.5" aria-hidden />
        <span className="sr-only">Caption language (the language you speak)</span>
        <select
          value={known ? lang : ""}
          onChange={(e) => setLang(e.target.value)}
          className="max-w-[8.5rem] truncate bg-transparent text-xs text-white focus:outline-none sm:max-w-none [&>option]:bg-ink-900"
          title="The language you speak"
        >
          {!known && <option value="">{lang}</option>}
          {CAPTION_LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              I speak {l.label}
            </option>
          ))}
        </select>
    </label>
  );
}
