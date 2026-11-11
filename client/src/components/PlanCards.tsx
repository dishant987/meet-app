import type { ReactNode } from "react";
import { Check, Star } from "lucide-react";
import { cn } from "cn";
import type { PlanId, PublicPlan } from "@/lib/api";

export type Period = "month" | "year";

export const money = (amount: number, currency: string, whole = false) =>
  new Intl.NumberFormat(currency.toLowerCase() === "inr" ? "en-IN" : undefined, {
    style: "currency",
    currency: currency.toUpperCase(),
    maximumFractionDigits: whole || amount % 100 === 0 ? 0 : 2,
  }).format(amount / 100);

const TAGLINE: Record<PlanId, string> = {
  FREE: "For trying MeetApp and small calls.",
  PRO: "For people who meet every day.",
  BUSINESS: "For growing companies and big teams.",
};

/** What each plan gives, written from its limits (one source of truth: the server). */
function features(p: PublicPlan) {
  const n = (x: number) => x.toLocaleString("en-IN");
  return [
    `Up to ${n(p.people)} people in a call`,
    p.recordingsPerMonth === null ? "Unlimited recordings" : `${p.recordingsPerMonth} recordings a month`,
    `${n(p.aiPerDay)} Ask AI questions a day`,
    p.teamsOwned === 1 ? `1 team of up to ${p.teamMembers} people` : `${p.teamsOwned} teams of up to ${n(p.teamMembers)} people`,
    "Live captions, AI notes, search",
  ];
}

/** Monthly / Yearly switch with the yearly saving. */
export function PeriodSwitch({ value, onChange, saving }: { value: Period; onChange: (p: Period) => void; saving: number }) {
  return (
    <div role="radiogroup" aria-label="Billing period" className="inline-flex rounded-2xl border border-border bg-muted p-1 text-sm">
      {(["month", "year"] as const).map((p) => (
        <button
          key={p}
          type="button"
          role="radio"
          aria-checked={value === p}
          onClick={() => onChange(p)}
          className={cn(
            "flex items-center gap-1.5 rounded-xl px-4 py-2 font-medium transition-all focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none",
            value === p ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {p === "month" ? "Monthly" : "Yearly"}
          {p === "year" && saving > 0 && <span className="rounded-md bg-brand px-1.5 py-0.5 text-[11px] font-semibold text-ink-950">-{saving}%</span>}
        </button>
      ))}
    </div>
  );
}

/** Biggest yearly saving across paid plans, in %. */
export const yearlySaving = (plans: PublicPlan[]) =>
  Math.max(0, ...plans.map((p) => (p.prices ? Math.round((1 - p.prices.year.amount / (p.prices.month.amount * 12)) * 100) : 0)));

/**
 * The three plans side by side (stacked on phones). Pro is the highlighted one.
 * `action` draws each card's button (landing: sign up; billing: checkout / current plan).
 */
export function PlanCards({
  plans,
  period,
  current,
  action,
  className,
}: {
  plans: PublicPlan[];
  period: Period;
  current?: PlanId;
  action: (p: PublicPlan, featured: boolean) => ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid items-stretch gap-4 md:grid-cols-3", className)}>
      {plans.map((p) => {
        const featured = p.id === "PRO";
        const price = p.prices?.[period];
        const isCurrent = current === p.id;
        return (
          <div
            key={p.id}
            className={cn(
              "relative flex flex-col rounded-3xl border bg-card p-6 transition-shadow",
              featured ? "border-brand shadow-[0_0_0_1px_var(--color-brand),0_20px_60px_-25px_var(--color-brand)] md:-my-2 md:py-8" : "border-border hover:shadow-lg",
            )}
          >
            {featured && (
              <span className="absolute -top-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 rounded-full bg-brand px-3 py-1 text-xs font-semibold whitespace-nowrap text-ink-950 shadow">
                <Star className="size-3.5 fill-current" aria-hidden /> Most popular
              </span>
            )}
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-lg font-semibold">{p.name}</h3>
              {isCurrent && <span className="rounded-lg bg-brand/25 px-2 py-0.5 text-xs font-semibold text-brand-ink">Your plan</span>}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{TAGLINE[p.id]}</p>

            <div className="mt-5 min-h-[4.5rem]">
              {p.id === "FREE" ? (
                <>
                  <p className="text-4xl font-semibold tracking-tight">₹0</p>
                  <p className="text-sm text-muted-foreground">Free forever, no card needed</p>
                </>
              ) : price ? (
                <>
                  <p className="text-4xl font-semibold tracking-tight">
                    {money(period === "year" ? Math.round(price.amount / 1200) * 100 : price.amount, price.currency, true)}
                    <span className="text-base font-normal text-muted-foreground"> / month</span>
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {period === "year" ? `${money(price.amount, price.currency)} billed yearly` : "Billed monthly, cancel any time"}
                  </p>
                </>
              ) : (
                <p className="pt-2 text-sm text-muted-foreground">Prices coming soon</p>
              )}
            </div>

            <ul className="mt-5 flex-1 space-y-2.5 text-sm">
              {features(p).map((f) => (
                <li key={f} className="flex gap-2.5">
                  <span className={cn("mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full", featured ? "bg-brand text-ink-950" : "bg-muted")}>
                    <Check className="size-3" strokeWidth={3} aria-hidden />
                  </span>
                  {f}
                </li>
              ))}
            </ul>
            <div className="mt-6">{action(p, featured)}</div>
          </div>
        );
      })}
    </div>
  );
}

export const planButton = (featured: boolean) =>
  cn(
    "flex h-11 w-full items-center justify-center gap-2 rounded-2xl text-sm font-semibold transition focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-card focus-visible:outline-none disabled:opacity-60",
    featured ? "bg-brand text-ink-950 hover:brightness-95" : "border border-border hover:border-brand",
  );
