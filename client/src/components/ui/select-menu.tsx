import type { ComponentType } from "react";
import { Select } from "radix-ui";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "cn";

type Option<T extends string> = { value: T; label: string };

/**
 * A styled dropdown (Radix Select): matches the app's inputs, keyboard and screen-reader friendly,
 * and its menu looks the same in every browser (unlike a native <select>).
 */
export function SelectMenu<T extends string>({
  value,
  onChange,
  options,
  label,
  icon: Icon,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: readonly Option<T>[];
  /** Read by screen readers (there's no visible label). */
  label: string;
  icon?: ComponentType<{ className?: string }>;
  className?: string;
}) {
  return (
    <Select.Root value={value} onValueChange={(v) => onChange(v as T)}>
      <Select.Trigger
        aria-label={label}
        className={cn(
          "group flex h-11 min-w-0 items-center gap-2 rounded-2xl border border-border bg-card px-3.5 text-sm font-medium transition-colors hover:border-brand/60 focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/30 focus-visible:outline-none data-[state=open]:border-brand",
          className,
        )}
      >
        {Icon && <Icon className="size-4 shrink-0 text-muted-foreground" />}
        <span className="min-w-0 flex-1 truncate text-left">
          <Select.Value />
        </span>
        <Select.Icon asChild>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          position="popper"
          sideOffset={6}
          align="end"
          className="z-50 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-2xl border border-border bg-popover p-1.5 text-popover-foreground shadow-xl data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        >
          <Select.Viewport>
            {options.map((o) => (
              <Select.Item
                key={o.value}
                value={o.value}
                className="relative flex cursor-pointer items-center rounded-xl py-2 pr-9 pl-3 text-sm outline-none select-none data-[highlighted]:bg-muted data-[state=checked]:font-medium"
              >
                <Select.ItemText>{o.label}</Select.ItemText>
                <Select.ItemIndicator className="absolute right-3">
                  <Check className="size-4 text-brand-ink" />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
