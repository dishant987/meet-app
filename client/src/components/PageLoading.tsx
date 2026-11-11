import { Loader2 } from "lucide-react";
import { cn } from "cn";
import { Skeleton } from "@/components/ui/skeleton";

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

/** Placeholder shaped like a page (title, toolbar, cards) while its code downloads. */
export function PageSkeleton() {
  return (
    <div role="status" aria-label="Loading" className="mx-auto w-full max-w-[1400px] space-y-6 px-4 py-8 sm:px-6 lg:px-10">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-9 w-64 max-w-full" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-36 rounded-3xl" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-3xl" />
    </div>
  );
}
