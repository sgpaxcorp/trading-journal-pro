import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import Stripe from "stripe";

function loadLocalEnv() {
  try {
    const source = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of source.split(/\r?\n/)) {
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match || process.env[match[1]]) continue;
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[match[1]] = value;
    }
  } catch {
    // CI can provide configuration directly.
  }
}

loadLocalEnv();

const secret = process.env.STRIPE_SECRET_KEY;
if (!secret) throw new Error("STRIPE_SECRET_KEY is required.");

const couponId = String(process.env.WAITLIST_ANNUAL_PROMO_CODE || "NEURO30")
  .trim()
  .toUpperCase();
const annualPriceIds = [
  process.env.STRIPE_PRICE_CORE_ANNUAL,
  process.env.STRIPE_PRICE_ADVANCED_ANNUAL,
].filter(Boolean);
if (annualPriceIds.length !== 2) throw new Error("Both annual Stripe price IDs are required.");

const stripe = new Stripe(secret, {});
const products = [];
for (const priceId of annualPriceIds) {
  const price = await stripe.prices.retrieve(priceId);
  const productId = typeof price.product === "string" ? price.product : price.product.id;
  if (!products.includes(productId)) products.push(productId);
}

let existing = null;
try {
  existing = await stripe.coupons.retrieve(couponId);
} catch (error) {
  if (Number(error?.statusCode || error?.status) !== 404) throw error;
}

if (existing) {
  const existingProducts = [...(existing.applies_to?.products || [])].sort();
  const expectedProducts = [...products].sort();
  const valid =
    existing.valid &&
    Number(existing.percent_off) === 30 &&
    existing.duration === "once" &&
    JSON.stringify(existingProducts) === JSON.stringify(expectedProducts);
  if (!valid) throw new Error(`Existing coupon ${couponId} does not match the approved launch terms.`);
  console.log(JSON.stringify({ ok: true, created: false, couponId, percentOff: 30, duration: "once" }));
  process.exit(0);
}

await stripe.coupons.create({
  id: couponId,
  name: "NeuroTrader annual launch 30%",
  percent_off: 30,
  duration: "once",
  applies_to: { products },
  metadata: {
    campaign: "2026_launch_waitlist",
    eligibility: "first_500_verified_waitlist_emails",
  },
});

console.log(JSON.stringify({ ok: true, created: true, couponId, percentOff: 30, duration: "once" }));
