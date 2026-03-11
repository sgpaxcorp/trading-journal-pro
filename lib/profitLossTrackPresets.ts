import type { BillingCycle, CostCategory, TraderType } from "@/lib/profitLossTrackSupabase";

export type SuggestedCostPreset = {
  presetKey: string;
  traderTypes: TraderType[];
  name: string;
  vendor?: string;
  category: CostCategory;
  billingCycle: BillingCycle;
  amount: number;
  notes?: string;
  includeInBreakEven?: boolean;
  amortizationMonths?: number | null;
};

export const TRADER_TYPE_LABELS: Record<TraderType, { en: string; es: string }> = {
  minimal: { en: "Minimal setup", es: "Setup minimo" },
  options: { en: "Options trader", es: "Trader de opciones" },
  futures: { en: "Futures trader", es: "Trader de futuros" },
  funded: { en: "Funded trader", es: "Trader fondeado" },
  swing: { en: "Swing trader", es: "Swing trader" },
};

export const SUGGESTED_COST_PRESETS: SuggestedCostPreset[] = [
  {
    presetKey: "journal-core",
    traderTypes: ["minimal", "options", "futures", "funded", "swing"],
    name: "Trading journal",
    vendor: "Neuro Trader Journal",
    category: "software",
    billingCycle: "monthly",
    amount: 26.99,
    notes: "Core journaling and performance review stack.",
  },
  {
    presetKey: "charting-platform",
    traderTypes: ["minimal", "options", "futures", "swing"],
    name: "Charting platform",
    vendor: "TradingView",
    category: "software",
    billingCycle: "monthly",
    amount: 29.95,
    notes: "Primary charting and alerting platform.",
  },
  {
    presetKey: "market-data-feed",
    traderTypes: ["minimal", "options", "futures", "funded", "swing"],
    name: "Market data feed",
    vendor: "Broker / data vendor",
    category: "data",
    billingCycle: "monthly",
    amount: 15,
    notes: "Real-time market data or news feed.",
  },
  {
    presetKey: "options-flow-tool",
    traderTypes: ["options"],
    name: "Option flow tool",
    vendor: "Flow vendor",
    category: "data",
    billingCycle: "monthly",
    amount: 79,
    notes: "Options flow and unusual activity scanner.",
  },
  {
    presetKey: "futures-orderflow",
    traderTypes: ["futures"],
    name: "Order flow software",
    vendor: "Bookmap / DOM tool",
    category: "software",
    billingCycle: "monthly",
    amount: 39,
    notes: "Tape, depth, or order-flow visualization.",
  },
  {
    presetKey: "mentor-community",
    traderTypes: ["options", "futures", "funded", "swing"],
    name: "Mentor or community",
    vendor: "Discord / private room",
    category: "mentorship",
    billingCycle: "monthly",
    amount: 149,
    notes: "Coaching room, mentor access, or paid community.",
  },
  {
    presetKey: "funding-fees",
    traderTypes: ["funded"],
    name: "Funding / challenge fees",
    vendor: "Prop firm",
    category: "funding",
    billingCycle: "monthly",
    amount: 95,
    notes: "Average monthly burden from evaluations or resets.",
  },
  {
    presetKey: "education-course",
    traderTypes: ["options", "futures", "funded", "swing"],
    name: "Course or training",
    vendor: "Education vendor",
    category: "education",
    billingCycle: "one_time",
    amount: 497,
    notes: "One-time education investment spread over time.",
    amortizationMonths: 12,
  },
  {
    presetKey: "backoffice-admin",
    traderTypes: ["funded", "swing"],
    name: "Admin and business tools",
    vendor: "Cloud / docs / bookkeeping",
    category: "admin",
    billingCycle: "monthly",
    amount: 18,
    notes: "Storage, docs, and business admin tooling.",
  },
  {
    presetKey: "broker-execution-fees",
    traderTypes: ["options", "futures", "funded", "swing"],
    name: "Broker platform fees",
    vendor: "Broker",
    category: "broker",
    billingCycle: "monthly",
    amount: 12,
    notes: "Platform, routing, or account activity fees not already in trade costs.",
    includeInBreakEven: false,
  },
];
