import { Monitor, Moon, Sun } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { setChoice, useTheme, type ThemeChoice } from "@/lib/theme";
import { cn } from "@/lib/utils";

const OPTIONS: { value: ThemeChoice; label: string; Icon: typeof Sun }[] = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "Same as device", Icon: Monitor },
];

/** Header button: pick Light, Dark, or follow the device. */
export function ThemeToggle() {
  const { choice, dark } = useTheme();
  const Current = dark ? Moon : Sun;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Theme: ${OPTIONS.find((o) => o.value === choice)!.label}`}
          className="flex size-10 items-center justify-center rounded-xl border border-border bg-card transition hover:border-brand focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
        >
          <Current className="size-4" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-48 rounded-2xl p-1.5" role="radiogroup" aria-label="Theme">
        {OPTIONS.map(({ value, label, Icon }) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={choice === value}
            onClick={() => setChoice(value)}
            className={cn(
              "flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none",
              choice === value && "bg-muted font-medium",
            )}
          >
            <Icon className="size-4" aria-hidden /> {label}
            {choice === value && <span className="ml-auto size-2 rounded-full bg-brand" aria-hidden />}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
