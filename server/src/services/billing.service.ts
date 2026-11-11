// Billing with Stripe (test mode for now): Pro or Business by the month or year through Stripe Checkout, changes and
// cancelling in Stripe's customer portal, payment history from Stripe's invoices.
// The plan is kept in sync two ways: the webhook (production) and a check against Stripe whenever the
// Billing page loads or a checkout returns (so it also works locally without the Stripe CLI).
import Stripe from "stripe";
import { prisma } from "../config/db.js";
import { env } from "../config/env.js";
import { AppError } from "../utils/AppError.js";
import { logger } from "../utils/logger.js";
import { PLANS, usage, type PlanId } from "./plan.service.js";
import { waitUntil } from "@vercel/functions";
import { cancelScheduledEmail, paymentFailedEmail, planEndedEmail, receiptEmail, sendEmail, type Email } from "./email.service.js";

export type Interval = "month" | "year";
export type PaidPlan = Exclude<PlanId, "FREE">;
const PAID_STATUSES = new Set(["active", "trialing", "past_due"]); // past_due: Stripe is still retrying the card

let client: Stripe | null = null;
function stripe() {
  if (!env.STRIPE_SECRET_KEY || !env.STRIPE_PRICE_MONTHLY || !env.STRIPE_PRICE_YEARLY)
    throw new AppError(503, "BILLING_NOT_CONFIGURED", "Payments aren't set up yet.");
  client ??= new Stripe(env.STRIPE_SECRET_KEY);
  return client;
}
export const billingConfigured = () => !!(env.STRIPE_SECRET_KEY && env.STRIPE_PRICE_MONTHLY && env.STRIPE_PRICE_YEARLY);
/** Stripe price ids per paid plan (Business is optional: hidden until its prices are set). */
const priceIds = (): Record<PaidPlan, Record<Interval, string | undefined>> => ({
  PRO: { month: env.STRIPE_PRICE_MONTHLY, year: env.STRIPE_PRICE_YEARLY },
  BUSINESS: { month: env.STRIPE_PRICE_BUSINESS_MONTHLY, year: env.STRIPE_PRICE_BUSINESS_YEARLY },
});
/** Which plan a Stripe price belongs to (unknown prices count as Pro). */
const planForPrice = (priceId?: string): PaidPlan =>
  (Object.entries(priceIds()).find(([, p]) => p.month === priceId || p.year === priceId)?.[0] as PaidPlan | undefined) ?? "PRO";

async function customerFor(userId: string) {
  const u = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, name: true, email: true, stripeCustomerId: true } });
  if (u.stripeCustomerId) return u.stripeCustomerId;
  const c = await stripe().customers.create({ email: u.email, name: u.name, metadata: { userId: u.id } });
  // two tabs at once: keep whichever customer was saved first
  const saved = await prisma.user.updateMany({ where: { id: u.id, stripeCustomerId: null }, data: { stripeCustomerId: c.id } });
  if (!saved.count) return (await prisma.user.findUniqueOrThrow({ where: { id: u.id }, select: { stripeCustomerId: true } })).stripeCustomerId!;
  return c.id;
}

/** Stripe Checkout for a paid plan. Returns the page to send the browser to. */
export async function startCheckout(userId: string, plan: PaidPlan, interval: Interval) {
  const price = priceIds()[plan][interval];
  if (!price) throw new AppError(503, "BILLING_NOT_CONFIGURED", `The ${PLANS[plan].name} plan isn't available yet.`);
  const me = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { plan: true, subscriptionStatus: true } });
  // one subscription per account: switching plans happens in the portal (Stripe works out the difference)
  if (me.plan !== "FREE" && PAID_STATUSES.has(me.subscriptionStatus ?? ""))
    throw new AppError(409, "ALREADY_SUBSCRIBED", "You already have a subscription. Use Manage subscription to switch plans or cancel.");
  const customer = await customerFor(userId);
  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer,
    line_items: [{ price, quantity: 1 }],
    client_reference_id: userId,
    subscription_data: { metadata: { userId } },
    allow_promotion_codes: true,
    success_url: `${env.CLIENT_URL}/billing?checkout=success`,
    cancel_url: `${env.CLIENT_URL}/billing?checkout=cancelled`,
  });
  return { url: session.url! };
}

/** Stripe's customer portal: switch plan or monthly/yearly, change card, cancel, download invoices. */
export async function openPortal(userId: string) {
  const u = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { stripeCustomerId: true } });
  if (!u.stripeCustomerId) throw new AppError(409, "NO_SUBSCRIPTION", "There's no subscription to manage yet.");
  const session = await stripe().billingPortal.sessions.create({ customer: u.stripeCustomerId, return_url: `${env.CLIENT_URL}/billing` });
  return { url: session.url };
}

// ---------- billing emails (each one exactly once) ----------

type Notice = "receipt" | "cancel" | "failed" | "ended";
const billingLink = () => `${env.CLIENT_URL}/billing`;
const customerOf = (c: string | { id: string } | null) => (typeof c === "string" ? c : (c?.id ?? ""));
const money = (amount: number, currency: string) =>
  new Intl.NumberFormat(currency === "inr" ? "en-IN" : "en-US", { style: "currency", currency: currency.toUpperCase() }).format(amount / 100);
const day = (unix: number) => new Date(unix * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/**
 * Claim a billing email: records `key` under `kind` only if it isn't already there (one atomic UPDATE),
 * so the webhook and a page sync seeing the same thing at once can't both send it.
 */
async function claim(userId: string, kind: Notice, key: string) {
  const n = await prisma.$executeRaw`
    UPDATE "User" SET "billingEmails" = "billingEmails" || jsonb_build_object(${kind}::text, ${key}::text)
    WHERE id = ${userId} AND ("billingEmails"->>${kind}::text) IS DISTINCT FROM ${key}`;
  return n === 1;
}
const release = (userId: string, kind: Notice) =>
  prisma.$executeRaw`UPDATE "User" SET "billingEmails" = "billingEmails" - ${kind}::text WHERE id = ${userId}`;

/** Claim, then send after the response; a failed send releases the claim so the next check tries again. */
async function notify(user: { id: string; email: string }, kind: Notice, key: string, mail: () => Omit<Email, "to">) {
  if (!(await claim(user.id, kind, key))) return;
  waitUntil(
    sendEmail({ to: user.email, ...mail() }).catch(async (err) => {
      logger.error({ err, kind }, "Billing email failed");
      await release(user.id, kind);
    }),
  );
}

/** Receipt for a paid invoice (the first invoice of a subscription is the welcome email). */
async function sendReceipt(invoice: Stripe.Invoice) {
  if (invoice.status !== "paid" || !invoice.amount_paid) return;
  const user = await prisma.user.findUnique({
    where: { stripeCustomerId: customerOf(invoice.customer) },
    select: { id: true, email: true, name: true, plan: true },
  });
  if (!user) return;
  const line = invoice.lines.data[0] as (Stripe.InvoiceLineItem & { pricing?: { price_details?: { price?: string } } }) | undefined;
  const priceId = line?.pricing?.price_details?.price;
  const plan = PLANS[priceId ? planForPrice(priceId) : user.plan === "BUSINESS" ? "BUSINESS" : "PRO"].name;
  await notify(user, "receipt", invoice.id!, () =>
    receiptEmail(
      user.name,
      {
        plan,
        amount: money(invoice.amount_paid, invoice.currency),
        period: line ? `${day(line.period.start)} – ${day(line.period.end)}` : day(invoice.created),
        number: invoice.number,
        date: day(invoice.status_transitions?.paid_at ?? invoice.created),
        invoiceUrl: invoice.hosted_invoice_url ?? null,
        pdfUrl: invoice.invoice_pdf ?? null,
      },
      billingLink(),
      invoice.billing_reason === "subscription_create",
    ),
  );
}

/** Save a subscription's state on its user (from the webhook or a sync), and send the emails a change calls for. */
async function applySubscription(sub: Stripe.Subscription) {
  const customer = customerOf(sub.customer);
  const before = await prisma.user.findUnique({
    where: { stripeCustomerId: customer },
    select: { id: true, email: true, name: true, plan: true, cancelAtPeriodEnd: true },
  });
  const item = sub.items.data[0];
  const paid = PAID_STATUSES.has(sub.status);
  // Cancelling in the portal: newer Stripe versions set `cancel_at` (the end date) and leave
  // `cancel_at_period_end` false, so either one means "ends then, doesn't renew".
  const cancelling = sub.cancel_at_period_end || !!sub.cancel_at;
  const endsAt = sub.cancel_at ? sub.cancel_at : item?.current_period_end;
  const plan = paid ? planForPrice(item?.price.id) : "FREE";
  await prisma.user.updateMany({
    where: { stripeCustomerId: customer },
    data: {
      plan,
      subscriptionId: sub.id,
      subscriptionStatus: sub.status,
      planInterval: item?.price.recurring?.interval ?? null,
      planRenewsAt: endsAt ? new Date(endsAt * 1000) : null,
      cancelAtPeriodEnd: cancelling,
    },
  });
  if (!before) return;

  if (paid && cancelling && endsAt)
    await notify(before, "cancel", String(endsAt), () => cancelScheduledEmail(before.name, PLANS[plan].name, day(endsAt), billingLink()));
  // renewed after cancelling: a later cancellation should email again
  if (paid && !cancelling && before.cancelAtPeriodEnd) await release(before.id, "cancel");
  if (sub.status === "past_due") {
    const inv = typeof sub.latest_invoice === "string" ? sub.latest_invoice : sub.latest_invoice?.id;
    if (inv) await notify(before, "failed", inv, () => paymentFailedEmail(before.name, PLANS[plan].name, money(item?.price.unit_amount ?? 0, item?.price.currency ?? "inr"), billingLink()));
  }
  // ended: only when we knew them as paying (an old, long-cancelled subscription found by a first sync stays quiet)
  if (sub.status === "canceled" && before.plan !== "FREE")
    await notify(before, "ended", sub.id, () => planEndedEmail(before.name, PLANS[planForPrice(item?.price.id)].name, billingLink()));
}

/** Ask Stripe for the customer's current subscription and newest paid invoice, save them, send any missing emails. */
export async function syncFromStripe(userId: string) {
  const u = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { stripeCustomerId: true } });
  if (!u.stripeCustomerId || !billingConfigured()) return;
  const [subs, paidInvoices] = await Promise.all([
    stripe().subscriptions.list({ customer: u.stripeCustomerId, status: "all", limit: 10 }),
    stripe().invoices.list({ customer: u.stripeCustomerId, status: "paid", limit: 1 }),
  ]);
  const pick = subs.data.find((s) => PAID_STATUSES.has(s.status)) ?? subs.data[0];
  if (pick) await applySubscription(pick);
  if (paidInvoices.data[0]) await sendReceipt(paidInvoices.data[0]);
}

/** Webhook from Stripe (signature checked with STRIPE_WEBHOOK_SECRET). */
export async function handleWebhook(raw: Buffer, signature: string | undefined) {
  if (!env.STRIPE_WEBHOOK_SECRET) throw new AppError(503, "BILLING_NOT_CONFIGURED", "Webhook secret isn't set.");
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(raw, signature ?? "", env.STRIPE_WEBHOOK_SECRET);
  } catch {
    throw new AppError(400, "BAD_SIGNATURE", "Webhook signature didn't match.");
  }
  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await applySubscription(event.data.object);
      break;
    case "checkout.session.completed": {
      const s = event.data.object;
      if (s.subscription) await applySubscription(await stripe().subscriptions.retrieve(typeof s.subscription === "string" ? s.subscription : s.subscription.id));
      break;
    }
    case "invoice.paid":
      await sendReceipt(event.data.object);
      break;
    case "invoice.payment_failed": {
      const inv = event.data.object;
      const user = await prisma.user.findUnique({ where: { stripeCustomerId: customerOf(inv.customer) }, select: { id: true, email: true, name: true, plan: true } });
      if (user)
        await notify(user, "failed", inv.id!, () =>
          paymentFailedEmail(user.name, PLANS[user.plan === "BUSINESS" ? "BUSINESS" : "PRO"].name, money(inv.amount_due, inv.currency), billingLink()),
        );
      break;
    }
    default:
      logger.debug({ type: event.type }, "Stripe event ignored");
  }
  return { received: true };
}

/** Everything the Billing page shows: plan, renewal, usage vs limits, prices, payment history. */
export async function overview(userId: string) {
  if (billingConfigured()) await syncFromStripe(userId).catch((err) => logger.warn({ err }, "Stripe sync failed"));
  const me = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { stripeCustomerId: true, subscriptionStatus: true, planInterval: true, planRenewsAt: true, cancelAtPeriodEnd: true },
  });
  const use = await usage(userId);
  if (!billingConfigured()) return { ...use, billing: null };

  const [prices, invoices] = await Promise.all([
    planPrices(),
    me.stripeCustomerId ? stripe().invoices.list({ customer: me.stripeCustomerId, limit: 24 }) : Promise.resolve({ data: [] as Stripe.Invoice[] }),
  ]);
  return {
    ...use,
    billing: {
      testMode: env.STRIPE_SECRET_KEY!.startsWith("sk_test_"),
      status: me.subscriptionStatus,
      interval: me.planInterval,
      renewsAt: me.planRenewsAt,
      cancelAtPeriodEnd: me.cancelAtPeriodEnd,
      canManage: !!me.stripeCustomerId,
      prices,
      invoices: invoices.data.map((i) => ({
        id: i.id,
        number: i.number,
        date: new Date(i.created * 1000),
        amount: i.status === "paid" ? i.amount_paid : i.amount_due,
        currency: i.currency,
        status: i.status, // draft | open | paid | uncollectible | void
        description: i.lines.data[0]?.description ?? "MeetApp Pro",
        hostedUrl: i.hosted_invoice_url ?? null,
        pdfUrl: i.invoice_pdf ?? null,
      })),
    },
  };
}

type Money = { amount: number; currency: string };
let priceCache: { at: number; value: Partial<Record<PaidPlan, Record<Interval, Money>>> } | null = null;

/** Prices from Stripe for each paid plan that's set up (kept 10 minutes: they rarely change). */
async function planPrices() {
  if (priceCache && Date.now() - priceCache.at < 10 * 60_000) return priceCache.value;
  const value: Partial<Record<PaidPlan, Record<Interval, Money>>> = {};
  for (const [plan, ids] of Object.entries(priceIds()) as [PaidPlan, Record<Interval, string | undefined>][]) {
    if (!ids.month || !ids.year) continue;
    const [m, y] = await Promise.all([stripe().prices.retrieve(ids.month), stripe().prices.retrieve(ids.year)]);
    value[plan] = { month: { amount: m.unit_amount ?? 0, currency: m.currency }, year: { amount: y.unit_amount ?? 0, currency: y.currency } };
  }
  priceCache = { at: Date.now(), value };
  return value;
}

/** For the landing page (no sign-in): every plan's limits and, when payments are set up, its prices. */
export async function publicPlans() {
  const prices = billingConfigured() ? await planPrices().catch((err) => (logger.warn({ err }, "Stripe prices failed"), {})) : {};
  return (Object.keys(PLANS) as PlanId[]).map((id) => ({
    id,
    ...PLANS[id],
    prices: id === "FREE" ? null : ((prices as Partial<Record<PaidPlan, Record<Interval, Money>>>)[id] ?? null),
  }));
}
