// One-time Stripe setup (TEST mode only): the "MeetApp Pro" and "MeetApp Business" products, a monthly and a
// yearly price for each (INR), and the customer-portal settings (switch plan or period, update card, cancel,
// invoices). Safe to run again: it reuses what already exists (prices are found by their lookup key).
// Usage: npm run stripe:setup   (reads STRIPE_SECRET_KEY from server/.env)
import Stripe from "stripe";

const key = process.env.STRIPE_SECRET_KEY;
if (!key?.startsWith("sk_test_")) {
  console.error("Set STRIPE_SECRET_KEY=sk_test_... in server/.env first (this script only runs in Stripe test mode).");
  process.exit(1);
}
const stripe = new Stripe(key);

// Amounts in paise (INR has 2 decimals in Stripe). Yearly = about 2 months free.
const PLANS = [
  {
    name: "MeetApp Pro",
    description: "Up to 50 people per call, unlimited recordings, 200 AI questions a day, 10 teams.",
    env: ["STRIPE_PRICE_MONTHLY", "STRIPE_PRICE_YEARLY"],
    prices: [
      { lookup: "meetapp_pro_monthly_inr", interval: "month" as const, amount: 49_900, nickname: "Pro monthly" },
      { lookup: "meetapp_pro_yearly_inr", interval: "year" as const, amount: 499_900, nickname: "Pro yearly" },
    ],
  },
  {
    name: "MeetApp Business",
    description: "Up to 100 people per call, unlimited recordings, 1,000 AI questions a day, 25 teams of 200.",
    env: ["STRIPE_PRICE_BUSINESS_MONTHLY", "STRIPE_PRICE_BUSINESS_YEARLY"],
    prices: [
      { lookup: "meetapp_business_monthly_inr", interval: "month" as const, amount: 149_900, nickname: "Business monthly" },
      { lookup: "meetapp_business_yearly_inr", interval: "year" as const, amount: 1_499_900, nickname: "Business yearly" },
    ],
  },
];

const lines: string[] = [];
const portalProducts: { product: string; prices: string[] }[] = [];
for (const plan of PLANS) {
  const existing = await stripe.prices.list({ lookup_keys: plan.prices.map((p) => p.lookup), expand: ["data.product"], limit: 10 });
  let product = existing.data[0]?.product as Stripe.Product | undefined;
  if (!product) {
    product = await stripe.products.create({ name: plan.name, description: plan.description });
    console.log(`Created product ${plan.name}: ${product.id}`);
  }
  const ids: string[] = [];
  for (const [i, p] of plan.prices.entries()) {
    const found = existing.data.find((x) => x.lookup_key === p.lookup);
    const price =
      found ??
      (await stripe.prices.create({
        product: product.id,
        currency: "inr",
        unit_amount: p.amount,
        recurring: { interval: p.interval },
        lookup_key: p.lookup,
        nickname: p.nickname,
      }));
    ids.push(price.id);
    lines.push(`${plan.env[i]}=${price.id}`);
    console.log(`${found ? "Found" : "Created"} ${p.nickname}: ${price.id}`);
  }
  portalProducts.push({ product: product.id, prices: ids });
}

// Customer portal: what people can do from "Manage subscription" (incl. moving between Pro and Business)
const configs = await stripe.billingPortal.configurations.list({ is_default: true, limit: 1 });
const features: Stripe.BillingPortal.ConfigurationCreateParams.Features = {
  customer_update: { enabled: true, allowed_updates: ["email", "name", "address"] },
  invoice_history: { enabled: true },
  payment_method_update: { enabled: true },
  subscription_cancel: { enabled: true, mode: "at_period_end" },
  subscription_update: {
    enabled: true,
    default_allowed_updates: ["price"],
    proration_behavior: "create_prorations",
    products: portalProducts,
  },
};
if (configs.data[0]) await stripe.billingPortal.configurations.update(configs.data[0].id, { features });
else await stripe.billingPortal.configurations.create({ features, business_profile: { headline: "MeetApp" } });
console.log("Customer portal settings saved.");

console.log(`\nAdd these to server/.env (and to Vercel's environment variables):\n${lines.join("\n")}`);
