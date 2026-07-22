import type Stripe from "stripe";

export type StripeBillingCycle = "monthly" | "annual";

type StripePriceLookup = {
  label: string;
  configuredId?: string | null;
  billingCycle: StripeBillingCycle;
  unitAmount: number;
  currency?: string;
  productNames?: string[];
};

export const STRIPE_PRICE_CONFIG_ERROR =
  "Secure payment is temporarily unavailable. NeuroTrader support needs to verify the Stripe pricing configuration.";

function intervalForCycle(cycle: StripeBillingCycle) {
  return cycle === "annual" ? "year" : "month";
}

function getProductName(price: Stripe.Price) {
  const product = price.product;
  if (typeof product === "object" && product && "name" in product) {
    return String(product.name ?? "");
  }
  return "";
}

function normalizedNames(names?: string[]) {
  return new Set((names ?? []).map((name) => name.trim().toLowerCase()).filter(Boolean));
}

function hasExpectedBasics(price: Stripe.Price, lookup: StripePriceLookup) {
  return (
    price.active &&
    price.currency.toLowerCase() === (lookup.currency ?? "usd").toLowerCase() &&
    Number(price.unit_amount ?? -1) === lookup.unitAmount &&
    price.recurring?.interval === intervalForCycle(lookup.billingCycle)
  );
}

function productNameMatches(price: Stripe.Price, lookup: StripePriceLookup) {
  const expected = normalizedNames(lookup.productNames);
  if (!expected.size) return true;
  return expected.has(getProductName(price).trim().toLowerCase());
}

export function isMissingStripePriceError(err: any) {
  const code = String(err?.code ?? err?.raw?.code ?? "");
  const type = String(err?.type ?? err?.raw?.type ?? "");
  const param = String(err?.param ?? err?.raw?.param ?? "");
  const message = String(err?.message ?? err?.raw?.message ?? "").toLowerCase();
  return (
    (code === "resource_missing" || type === "StripeInvalidRequestError") &&
    (param === "line_items[0][price]" ||
      param.includes("[price]") ||
      message.includes("no such price"))
  );
}

export async function resolveStripePriceId(
  stripe: Stripe,
  lookup: StripePriceLookup
) {
  const configuredId = String(lookup.configuredId ?? "").trim();

  if (configuredId) {
    try {
      const configuredPrice = await stripe.prices.retrieve(configuredId, {
        expand: ["product"],
      });
      if (hasExpectedBasics(configuredPrice, lookup)) {
        return configuredPrice.id;
      }
      console.warn("[Stripe pricing] Configured price has unexpected metadata", {
        label: lookup.label,
        priceId: configuredId,
        active: configuredPrice.active,
        currency: configuredPrice.currency,
        unitAmount: configuredPrice.unit_amount,
        interval: configuredPrice.recurring?.interval,
        product: getProductName(configuredPrice),
      });
    } catch (err) {
      if (!isMissingStripePriceError(err)) throw err;
      console.warn("[Stripe pricing] Configured price was not found", {
        label: lookup.label,
        priceId: configuredId,
      });
    }
  }

  const prices = await stripe.prices.list({
    active: true,
    limit: 100,
    expand: ["data.product"],
  });

  const basicMatches = prices.data.filter((price) => hasExpectedBasics(price, lookup));
  const namedMatches = basicMatches.filter((price) => productNameMatches(price, lookup));
  const matches = namedMatches.length > 0 ? namedMatches : basicMatches;

  if (matches.length === 1) {
    const fallback = matches[0];
    console.warn("[Stripe pricing] Resolved active fallback price", {
      label: lookup.label,
      priceId: fallback.id,
      product: getProductName(fallback),
    });
    return fallback.id;
  }

  console.error("[Stripe pricing] Could not resolve a unique price", {
    label: lookup.label,
    configuredId: configuredId || null,
    billingCycle: lookup.billingCycle,
    unitAmount: lookup.unitAmount,
    matchingPrices: matches.map((price) => ({
      id: price.id,
      product: getProductName(price),
      unitAmount: price.unit_amount,
      interval: price.recurring?.interval,
    })),
  });
  return null;
}
