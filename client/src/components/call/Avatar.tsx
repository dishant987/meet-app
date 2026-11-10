import { cn } from "cn";

// Gradient per person, picked from their name so it stays the same everywhere.
const GRADIENTS = [
  "from-lime-300 to-emerald-500",
  "from-violet-400 to-fuchsia-500",
  "from-amber-300 to-orange-500",
  "from-sky-300 to-indigo-500",
  "from-rose-300 to-pink-500",
  "from-teal-300 to-cyan-600",
];

function hash(name: string) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "?";

const SIZES = {
  sm: "size-9 rounded-xl text-sm",
  md: "size-14 rounded-2xl text-xl",
  lg: "size-20 rounded-[1.75rem] text-3xl sm:size-28 sm:rounded-[2.25rem] sm:text-4xl",
};

export function Avatar({ name, size = "lg", speaking }: { name: string; size?: keyof typeof SIZES; speaking?: boolean }) {
  return (
    <div
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center bg-gradient-to-br font-semibold text-ink-950",
        SIZES[size],
        GRADIENTS[hash(name) % GRADIENTS.length],
        speaking && "animate-speak",
      )}
    >
      {initials(name)}
    </div>
  );
}
