// Stripe webhook: signature check and plan changes. No network: events are signed locally with a test secret.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";

process.env.STRIPE_SECRET_KEY = "sk_test_offline_dummy";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_offline_secret";
process.env.STRIPE_PRICE_MONTHLY = "price_test_month";
process.env.STRIPE_PRICE_YEARLY = "price_test_year";
process.env.STRIPE_PRICE_BUSINESS_MONTHLY = "price_test_biz_month";
process.env.STRIPE_PRICE_BUSINESS_YEARLY = "price_test_biz_year";
const { default: Stripe } = await import("stripe");
const { app } = await import("./app.js");
const { prisma } = await import("./config/db.js");
const server = app.listen(0);
const base = `http://localhost:${(server.address() as AddressInfo).port}/api`;
after(async () => {
  server.close();
  await prisma.$disconnect();
});

const stripe = new Stripe("sk_test_offline_dummy");
async function send(event: object, secret = "whsec_test_offline_secret") {
  const payload = JSON.stringify(event);
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret });
  return fetch(`${base}/billing/webhook`, { method: "POST", headers: { "content-type": "application/json", "stripe-signature": header }, body: payload });
}
const subscription = (customer: string, status: string, cancel = false, price = "price_test_year") => ({
  id: "evt_test",
  object: "event",
  type: status === "canceled" ? "customer.subscription.deleted" : "customer.subscription.updated",
  data: {
    object: {
      id: "sub_test_1",
      object: "subscription",
      customer,
      status,
      cancel_at_period_end: cancel,
      items: { data: [{ price: { id: price, recurring: { interval: "year" } }, current_period_end: 1_900_000_000 }] },
    },
  },
});

test("stripe webhook: bad signature refused; subscription events set the plan", async () => {
  const email = `pay${Date.now()}@example.com`;
  const user = await prisma.user.create({ data: { name: "Payer", email, stripeCustomerId: `cus_test_${Date.now()}` } });

  assert.equal((await send(subscription(user.stripeCustomerId!, "active"), "whsec_wrong")).status, 400);
  assert.equal((await fetch(`${base}/billing/webhook`, { method: "POST", body: "{}" })).status, 400);

  assert.equal((await send(subscription(user.stripeCustomerId!, "active"))).status, 200);
  let u = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  assert.equal(u.plan, "PRO");
  assert.equal(u.planInterval, "year");
  assert.equal(u.planRenewsAt?.getTime(), 1_900_000_000_000);

  await send(subscription(user.stripeCustomerId!, "active", true)); // cancelled at period end: still Pro until then
  u = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  assert.equal(u.plan, "PRO");
  assert.equal(u.cancelAtPeriodEnd, true);

  // newer Stripe: cancelling sets cancel_at (the end date) and leaves cancel_at_period_end false
  const cancelAt = { ...subscription(user.stripeCustomerId!, "active"), id: "evt_test_2" };
  (cancelAt.data.object as Record<string, unknown>).cancel_at = 1_950_000_000;
  await send(cancelAt);
  u = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  assert.equal(u.plan, "PRO"); // paid until then
  assert.equal(u.cancelAtPeriodEnd, true);
  assert.equal(u.planRenewsAt?.getTime(), 1_950_000_000_000); // shows the real end date

  // switched to a Business price in the portal
  await send(subscription(user.stripeCustomerId!, "active", false, "price_test_biz_month"));
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).plan, "BUSINESS");

  await send(subscription(user.stripeCustomerId!, "canceled"));
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).plan, "FREE");
});
