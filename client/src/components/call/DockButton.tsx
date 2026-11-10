import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "cn";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type Tone = "default" | "off" | "on" | "danger" | "ghost";

const TONES: Record<Tone, string> = {
  default: "bg-white/[0.07] text-white hover:bg-white/[0.13]",
  ghost: "bg-transparent text-ink-300 hover:bg-white/[0.08] hover:text-white",
  on: "bg-brand text-ink-950 hover:brightness-95",
  off: "bg-red-500/15 text-red-300 ring-1 ring-inset ring-red-400/30 hover:bg-red-500/25",
  danger: "bg-red-500 text-white hover:bg-red-600",
};

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  shortcut?: string;
  tone?: Tone;
  badge?: ReactNode;
  /** Visible text next to the icon (hidden on small screens). */
  text?: string;
};

/** Rounded-square icon button with tooltip, used in the call dock and the join screen. */
export const DockButton = forwardRef<HTMLButtonElement, Props>(function DockButton(
  { label, shortcut, tone = "default", badge, text, className, children, ...rest },
  ref,
) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          ref={ref}
          type="button"
          aria-label={label}
          className={cn(
            "relative flex h-11 min-w-11 shrink-0 items-center justify-center gap-2 rounded-2xl px-3 text-sm font-medium transition-[background-color,transform,filter] duration-150 active:scale-95 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none sm:h-12 sm:min-w-12 [&_svg]:size-5",
            TONES[tone],
            className,
          )}
          {...rest}
        >
          {children}
          {text && <span className="hidden sm:inline">{text}</span>}
          {badge}
        </button>
      </TooltipTrigger>
      <TooltipContent>
        {label}
        {shortcut && <span className="ml-2 opacity-60">{shortcut}</span>}
      </TooltipContent>
    </Tooltip>
  );
});
