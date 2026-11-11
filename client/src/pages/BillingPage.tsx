import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import { ArrowUpRight, CircleSlash, CreditCard, Crown, Download, ExternalLink, Loader2, Receipt, X } from "lucide-react";
import { cn } from "cn";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Skeleton } from "@/components/ui/skeleton";
import { PeriodSwitch, PlanCards, money, planButton, yearlySaving, type Period } from "@/components/PlanCards";
import { billingApi, errorMessage, type BillingOverview, type PaidPlan, type PublicPlan } from "@/lib/api";
import { CheckoutResult, type CheckoutState } from "@/components/billing/CheckoutResult";
import { confetti } from "@/lib/confetti";
import { useAuth } from "@/lib/auth";
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

const STATUS: Record<string, { text: string; cls: string }> = {
  paid: { text: "Paid", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  open: { text: "Due", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  void: { text: "Void", cls: "bg-muted text-muted-foreground" },
  uncollectible: { text: "Failed", cls: "bg-red-500/15 text-red-700 dark:text-red-300" },
  draft: { text: "Draft", cls: "bg-muted text-muted-foreground" },
};

function Meter({ label, used, max }: { label: string; used: number; max: number | null }) {
  const pct = max ? Math.min(100, Math.round((used / max) * 100)) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between gap-2 text-sm">
        <span>{label}</span>
        <span className="text-muted-foreground">{max === null ? `${used} · unlimited` : `${used} of ${max}`}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={label} aria-valuenow={used} aria-valuemax={max ?? undefined}>
        <div className={cn("h-full rounded-full", pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-brand")} style={{ width: max === null ? "8%" : `${pct}%` }} />
      </div>
    </div>
  );
}

export function BillingPage() {
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState<BillingOverview | null>(null);
  const [error, setError] = useState("");
  const [plans, setPlans] = useState<PublicPlan[] | null>(null);
  const [period, setPeriod] = useState<Period>(params.get("period") === "month" ? "month" : "year");
  const [busy, setBusy] = useState<PaidPlan | "portal" | null>(null);

  async function checkout(plan: PaidPlan, p: Period = period) {
    setBusy(plan);
    try {
      window.location.href = await billingApi.checkout(plan, p);
    } catch (err) {
      toast.error(errorMessage(err));
      setBusy(null);
    }
  }
  async function go(_kind: "portal") {
    setBusy("portal");
    try {
      window.location.href = await billingApi.portal();
    } catch (err) {
      toast.error(errorMessage(err));
      setBusy(null);
    }
  }

  const { user } = useAuth();
  const [result, setResult] = useState<CheckoutState>(null);
  const [cancelledNote, setCancelledNote] = useState(false);

  useEffect(() => {
    const back = params.get("checkout");
    // from the landing page's pricing: /billing?upgrade=PRO&period=year starts that checkout straight away
    const upgrade = params.get("upgrade");
    if (back === "success") setResult("confirming");
    if (back === "cancelled") setCancelledNote(true);
    let tries = 0;
    let stop = false;
    // back from a payment: ask until Stripe says the plan is on (a few seconds), then celebrate
    const load = (): Promise<void> =>
      billingApi.overview().then((d) => {
        if (stop) return;
        setData(d);
        if (back !== "success") {
          if ((upgrade === "PRO" || upgrade === "BUSINESS") && d.plan === "FREE" && d.billing) void checkout(upgrade, period);
          return;
        }
        if (d.plan !== "FREE") {
          setResult("success");
          confetti();
          return;
        }
        if (++tries >= 8) return setResult("slow");
        return new Promise<void>((r) => setTimeout(r, 2000)).then(load);
      });
    load().catch((err) => setError(errorMessage(err)));
    if (back || upgrade) setParams({}, { replace: true });
    billingApi.plans().then(setPlans).catch(() => setPlans([]));
    return () => {
      stop = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once; the flags are read on arrival
  }, []);

  const b = data?.billing;
  const paid = !!data && data.plan !== "FREE";

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 px-4 py-8 sm:px-6 lg:px-10">
      <div className="space-y-3">
        <Breadcrumbs items={[{ label: "Home", to: "/dashboard" }, { label: "Billing" }]} />
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Billing</h1>
          <p className="text-muted-foreground">Your plan, what you've used, and your payments.</p>
        </div>
      </div>

      {cancelledNote && (
        <div role="status" className="flex items-start gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-sm">
          <CircleSlash className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <p className="flex-1">
            <span className="font-medium">Checkout cancelled.</span> <span className="text-muted-foreground">No charge was made. You can upgrade any time.</span>
          </p>
          <button type="button" aria-label="Dismiss" onClick={() => setCancelledNote(false)} className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>
      )}

      {error ? (
        <p role="alert" className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>
      ) : !data ? (
        <div role="status" aria-label="Loading billing" className="grid gap-4 lg:grid-cols-[1fr_1fr]">
          <Skeleton className="h-56 rounded-3xl" />
          <Skeleton className="h-56 rounded-3xl" />
          <Skeleton className="h-64 rounded-3xl lg:col-span-2" />
        </div>
      ) : (
        <>

          <div className="grid items-start gap-4 lg:grid-cols-2">
            {/* current plan */}
            <section className="rounded-3xl border border-border bg-card p-5 sm:p-6">
              <p className="text-sm text-muted-foreground">Current plan</p>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-2xl font-semibold">
                {paid && <Crown className="size-5 text-brand-ink" aria-hidden />} {data.limits.name}
                {paid && b?.interval && <span className="text-base font-normal text-muted-foreground">· billed {b.interval === "year" ? "yearly" : "monthly"}</span>}
                {paid && b?.cancelAtPeriodEnd && (
                  <span className="rounded-lg bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-300">Cancelled</span>
                )}
              </p>
              {paid && b?.renewsAt &&
                (b.cancelAtPeriodEnd ? (
                  <div className="mt-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
                    <p className="font-medium">
                      {data.limits.name} ends on {day(b.renewsAt)}. You won't be charged again.
                    </p>
                    <p className="mt-0.5 text-muted-foreground">You keep everything until then, then move to Free. Changed your mind? Renew below.</p>
                  </div>
                ) : (
                  <p className="mt-1 text-sm text-muted-foreground">Renews on {day(b.renewsAt)}.</p>
                ))}
              {b?.status === "past_due" && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">Your last payment failed. Update your card to keep your plan.</p>
              )}
              {!paid && <p className="mt-1 text-sm text-muted-foreground">Everything you need to start. Upgrade when you outgrow it.</p>}
              {b?.canManage && (
                <button type="button" onClick={() => go("portal")} disabled={!!busy}
                  className="mt-4 flex h-10 items-center gap-2 rounded-xl border border-border px-3 text-sm font-medium transition hover:border-brand focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none disabled:opacity-60">
                  {busy === "portal" ? <Loader2 className="size-4 animate-spin" /> : <CreditCard className="size-4" />}{" "}
                  {paid && b.cancelAtPeriodEnd ? "Renew subscription" : "Manage subscription"}
                  <ExternalLink className="size-3.5 text-muted-foreground" aria-hidden />
                </button>
              )}
            </section>

            {/* usage */}
            <section className="space-y-4 rounded-3xl border border-border bg-card p-5 sm:p-6">
              <h2 className="text-lg font-semibold">Usage</h2>
              <Meter label="Recordings this month" used={data.used.recordingsThisMonth} max={data.limits.recordingsPerMonth} />
              <Meter label="AI questions (last 24 hours)" used={data.used.aiQuestionsToday} max={data.limits.aiPerDay} />
              <Meter label="Teams you own" used={data.used.teamsOwned} max={data.limits.teamsOwned} />
            </section>
          </div>

          {/* plans */}
          <section aria-labelledby="plans-h" className="rounded-3xl border border-border bg-card p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="plans-h" className="text-lg font-semibold">Plans</h2>
              {plans && <PeriodSwitch value={period} onChange={setPeriod} saving={yearlySaving(plans)} />}
            </div>
            {!plans ? (
              <div className="mt-5 grid gap-4 md:grid-cols-3">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-96 rounded-3xl" />
                ))}
              </div>
            ) : (
              <PlanCards
                className="mt-8"
                plans={plans}
                period={period}
                current={data.plan}
                action={(p, featured) =>
                  p.id === data.plan ? (
                    <button type="button" disabled className={planButton(false)}>
                      Current plan
                    </button>
                  ) : p.id === "FREE" ? (
                    <p className="text-center text-sm text-muted-foreground">To move to Free, cancel in Manage subscription.</p>
                  ) : paid ? (
                    <button type="button" onClick={() => go("portal")} disabled={!!busy || !p.prices} className={planButton(featured)}>
                      {busy === "portal" && <Loader2 className="size-4 animate-spin" />} {p.prices ? `Switch to ${p.name}` : "Coming soon"}
                    </button>
                  ) : (
                    <button type="button" onClick={() => checkout(p.id as PaidPlan)} disabled={!!busy || !p.prices} className={planButton(featured)}>
                      {busy === p.id ? <Loader2 className="size-4 animate-spin" /> : <ArrowUpRight className="size-4" />}
                      {p.prices ? `Upgrade to ${p.name}` : "Coming soon"}
                    </button>
                  )
                }
              />
            )}
          </section>

          {/* payment history */}
          <section aria-labelledby="history-h" className="rounded-3xl border border-border bg-card p-5 sm:p-6">
            <h2 id="history-h" className="text-lg font-semibold">Payment history</h2>
            {!b?.invoices.length ? (
              <div className="mt-4 flex flex-col items-center gap-2 py-6 text-center">
                <Receipt className="size-7 text-muted-foreground" aria-hidden />
                <p className="text-sm text-muted-foreground">No payments yet. Your invoices will show up here.</p>
              </div>
            ) : (
              <div className="relative mt-4 overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="py-2 pr-3 font-medium">Date</th>
                      <th className="py-2 pr-3 font-medium">Description</th>
                      <th className="py-2 pr-3 font-medium">Amount</th>
                      <th className="py-2 pr-3 font-medium">Status</th>
                      <th className="py-2 font-medium"><span className="sr-only">Invoice</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {b.invoices.map((i) => {
                      const st = STATUS[i.status ?? ""] ?? { text: i.status ?? "-", cls: "bg-muted text-muted-foreground" };
                      return (
                        <tr key={i.id} className="border-b border-border last:border-0">
                          <td className="py-3 pr-3 whitespace-nowrap">{day(i.date)}</td>
                          <td className="py-3 pr-3">
                            <span className="line-clamp-1">{i.description}</span>
                            {i.number && <span className="block text-xs text-muted-foreground">{i.number}</span>}
                          </td>
                          <td className="py-3 pr-3 font-medium whitespace-nowrap">{money(i.amount, i.currency)}</td>
                          <td className="py-3 pr-3"><span className={cn("rounded-lg px-2 py-0.5 text-xs font-semibold", st.cls)}>{st.text}</span></td>
                          <td className="py-3 text-right whitespace-nowrap">
                            {i.pdfUrl && (
                              <a href={i.pdfUrl} target="_blank" rel="noreferrer"
                                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-medium hover:bg-muted focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none">
                                <Download className="size-3.5" aria-hidden /> PDF
                              </a>
                            )}
                            {i.hostedUrl && (
                              <a href={i.hostedUrl} target="_blank" rel="noreferrer"
                                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-medium hover:bg-muted focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none">
                                View <ExternalLink className="size-3.5" aria-hidden />
                              </a>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
      <CheckoutResult state={result} data={data} email={user?.email} onClose={() => setResult(null)} />
    </div>
  );
}
