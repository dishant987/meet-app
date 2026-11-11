import { SunIcon, type SunIconHandle } from "@animateicons/react/lucide/sun-icon";
import { MoonIcon } from "@animateicons/react/lucide/moon-icon";
import { MonitorIcon } from "@animateicons/react/lucide/monitor-icon";
import { useIconHover } from "@/lib/useIconHover";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { setChoice, useTheme, type ThemeChoice } from "@/lib/theme";
import { cn } from "@/lib/utils";

const OPTIONS: { value: ThemeChoice; label: string; Icon: typeof SunIcon }[] = [
  { value: "light", label: "Light", Icon: SunIcon },
  { value: "dark", label: "Dark", Icon: MoonIcon },
  { value: "system", label: "Same as device", Icon: MonitorIcon },
];

function Option({ value, label, Icon, checked }: (typeof OPTIONS)[number] & { checked: boolean }) {
  const { ref, hover } = useIconHover<SunIconHandle>();
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={() => setChoice(value)}
      {...hover}
      className={cn(
        "flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none",
        checked && "bg-muted font-medium",
      )}
    >
      <Icon ref={ref} size={16} className="flex" /> {label}
      {checked && <span className="ml-auto size-2 rounded-full bg-brand" aria-hidden />}
    </button>
  );
}

/** Header button: pick Light, Dark, or follow the device. */
export function ThemeToggle() {
  const { choice, dark } = useTheme();
  const Current = dark ? MoonIcon : SunIcon;
  const trigger = useIconHover<SunIconHandle>();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Theme: ${OPTIONS.find((o) => o.value === choice)!.label}`}
          {...trigger.hover}
          className="flex size-10 items-center justify-center rounded-xl border border-border bg-card transition hover:border-brand focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
        >
          <Current ref={trigger.ref} size={16} className="flex" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-48 rounded-2xl p-1.5" role="radiogroup" aria-label="Theme">
        {OPTIONS.map((o) => (
          <Option key={o.value} {...o} checked={choice === o.value} />
        ))}
      </PopoverContent>
    </Popover>
  );
}
