import { Loader2 } from "lucide-react";
import { cn } from "cn";

/** Shown for a moment while a page's code downloads. `dark`: the call screen, which is always dark. */
export function PageLoading({ dark = false, inline = false }: { dark?: boolean; inline?: boolean }) {
  return (
    <div
      role="status"
      className={cn(
        "flex items-center justify-center",
        inline ? "py-24" : "min-h-dvh",
        dark ? "bg-ink-950 text-brand" : !inline && "bg-background text-muted-foreground",
      )}
    >
      <Loader2 className="size-7 animate-spin" aria-hidden />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
