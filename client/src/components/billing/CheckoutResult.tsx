import { Link } from "react-router";
import { Check, Download, ExternalLink, Loader2, Mail, Video } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { money } from "@/components/PlanCards";
import type { BillingOverview } from "@/lib/api";

export type CheckoutState = "confirming" | "success" | "slow" | null;

/** What happens right after Stripe Checkout: confirming → welcome (with the receipt), or "still processing". */
export function CheckoutResult({ state, data, email, onClose }: { state: CheckoutState; data: BillingOverview | null; email?: string; onClose: () => void }) {
  if (!state) return null;
  const invoice = data?.billing?.invoices.find((i) => i.status === "paid");
  const plan = data?.limits;
  const unlocked = plan
    ? [
        `Up to ${plan.people} people in a call`,
        plan.recordingsPerMonth === null ? "Unlimited recordings" : `${plan.recordingsPerMonth} recordings a month`,
        `${plan.aiPerDay.toLocaleString("en-IN")} Ask AI questions a day`,
        `${plan.teamsOwned} teams of up to ${plan.teamMembers.toLocaleString("en-IN")} people`,
      ]
    : [];

  return (
    <Dialog open onOpenChange={(o) => !o && state !== "confirming" && onClose()}>
      <DialogContent
        className="sm:max-w-md"
        onInteractOutside={(e) => state === "confirming" && e.preventDefault()}
        // start on the main action, not the small close button
        onOpenAutoFocus={(e) => {
          const main = (e.currentTarget as HTMLElement | null)?.querySelector<HTMLElement>("[data-primary]");
          if (main) {
            e.preventDefault();
            main.focus();
          }
        }}
      >
        {state === "confirming" ? (
          <div role="status" className="flex flex-col items-center gap-4 py-6 text-center">
            <Loader2 className="size-10 animate-spin text-brand-ink" aria-hidden />
            <DialogTitle>Confirming your payment…</DialogTitle>
            <DialogDescription>This takes a few seconds. Please keep this page open.</DialogDescription>
          </div>
        ) : state === "slow" ? (
          <div className="flex flex-col items-center gap-4 py-4 text-center">
            <span className="flex size-14 items-center justify-center rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-300">
              <Loader2 className="size-7 animate-spin" aria-hidden />
            </span>
            <DialogTitle>Payment received, still processing</DialogTitle>
            <DialogDescription>
              Stripe is finishing up. Your plan switches on in a minute and the receipt comes by email. You can keep using MeetApp.
            </DialogDescription>
            <button
              type="button"
              onClick={() => location.reload()}
              className="flex h-10 items-center gap-2 rounded-xl border border-border px-4 text-sm font-medium transition hover:border-brand focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
            >
              Check again
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 pt-2 text-center">
            <span className="flex size-16 animate-in items-center justify-center rounded-full bg-brand text-ink-950 shadow-[0_0_0_8px_color-mix(in_oklab,var(--color-brand)_25%,transparent)] duration-500 zoom-in-50">
              <Check className="size-8" strokeWidth={3} aria-hidden />
            </span>
            <div className="space-y-1.5">
              <DialogTitle className="text-2xl">Welcome to {plan?.name}!</DialogTitle>
              <DialogDescription>
                {invoice ? `Your payment of ${money(invoice.amount, invoice.currency)} went through.` : "Your payment went through."} Everything in{" "}
                {plan?.name} is unlocked now.
              </DialogDescription>
            </div>

            <ul className="w-full space-y-2 rounded-2xl border border-border bg-muted/40 p-4 text-left text-sm">
              {unlocked.map((u) => (
                <li key={u} className="flex items-center gap-2.5">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-brand text-ink-950">
                    <Check className="size-3" strokeWidth={3} aria-hidden />
                  </span>
                  {u}
                </li>
              ))}
            </ul>

            {email && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Mail className="size-4" aria-hidden /> Receipt sent to <span className="font-medium text-foreground">{email}</span>
              </p>
            )}

            <div className="grid w-full gap-2 sm:grid-cols-2">
              <Link
                to="/dashboard"
                data-primary
                onClick={onClose}
                className="flex h-11 items-center justify-center gap-2 rounded-2xl bg-brand text-sm font-semibold text-ink-950 transition hover:brightness-95 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-popover focus-visible:outline-none"
              >
                <Video className="size-4" /> Start a meeting
              </Link>
              {invoice?.hostedUrl ? (
                <a
                  href={invoice.hostedUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex h-11 items-center justify-center gap-2 rounded-2xl border border-border text-sm font-medium transition hover:border-brand focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
                >
                  View receipt <ExternalLink className="size-3.5" />
                </a>
              ) : (
                <button
                  type="button"
                  onClick={onClose}
                  className="flex h-11 items-center justify-center rounded-2xl border border-border text-sm font-medium transition hover:border-brand focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
                >
                  Done
                </button>
              )}
            </div>
            {invoice?.pdfUrl && (
              <a href={invoice.pdfUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 hover:underline">
                <Download className="size-3.5" /> Download invoice PDF
              </a>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
