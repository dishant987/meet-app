import { useState } from "react";
import { Aperture, Check } from "lucide-react";
import { cn } from "cn";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { BACKGROUND_OPTIONS, setBackground, useBackgroundMode, useBackgroundSupported } from "@/lib/background";
import { DockButton } from "./DockButton";

/** Dock button + menu: no effect / slight blur / strong blur. Hidden on browsers that can't blur. */
export function BackgroundPicker({ className }: { className?: string }) {
  const supported = useBackgroundSupported();
  const mode = useBackgroundMode();
  const [open, setOpen] = useState(false);
  if (!supported) return null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <DockButton label="Background effects" tone={mode !== "off" ? "on" : open ? "on" : "default"} className={className}>
          <Aperture />
        </DockButton>
      </PopoverTrigger>
      <PopoverContent side="top" sideOffset={12} className="dark w-64 rounded-2xl border-white/10 bg-ink-900/95 p-1.5 text-white backdrop-blur-xl" role="radiogroup" aria-label="Background">
        <p className="px-2.5 pt-1.5 pb-1 text-xs text-ink-500">Background · done on your device</p>
        {BACKGROUND_OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={mode === o.value}
            onClick={() => {
              setBackground(o.value);
              setOpen(false);
            }}
            className={cn(
              "flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left hover:bg-white/[0.06] focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none",
              mode === o.value && "bg-white/[0.06]",
            )}
          >
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{o.label}</span>
              <span className="block text-xs text-ink-500">{o.hint}</span>
            </span>
            {mode === o.value && <Check className="size-4 text-brand" aria-hidden />}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
