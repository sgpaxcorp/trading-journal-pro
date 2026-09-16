import "server-only";

import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supaBaseAdmin";

export const EMERGENCY_PORTFOLIO_SETTING_KEY = "emergency_portfolio_controls";
export const RE_ENABLE_FINANCIAL_ACTIONS_CONFIRMATION =
  "RE-ENABLE FINANCIAL ACTIONS";

export type EmergencyPortfolioControlState = {
  aiTradeProposalsEnabled: boolean;
  brokerConnectivityEnabled: boolean;
  newOrdersEnabled: boolean;
  readOnly: boolean;
  investorTransactionsEnabled: boolean;
  manualReconciliationRequired: boolean;
  version: number;
  updatedAt: string | null;
  updatedBy: string | null;
  failSafe: boolean;
};

export type EmergencyPortfolioControlDraft = Pick<
  EmergencyPortfolioControlState,
  | "aiTradeProposalsEnabled"
  | "brokerConnectivityEnabled"
  | "newOrdersEnabled"
  | "readOnly"
  | "investorTransactionsEnabled"
  | "manualReconciliationRequired"
>;

const FAIL_SAFE_CONTROLS: EmergencyPortfolioControlState = {
  aiTradeProposalsEnabled: false,
  brokerConnectivityEnabled: false,
  newOrdersEnabled: false,
  readOnly: true,
  investorTransactionsEnabled: false,
  manualReconciliationRequired: true,
  version: 0,
  updatedAt: null,
  updatedBy: null,
  failSafe: true,
};

function normalizeStoredControls(value: unknown): EmergencyPortfolioControlState | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const booleanKeys = [
    "ai_trade_proposals_enabled",
    "broker_connectivity_enabled",
    "new_orders_enabled",
    "read_only",
    "investor_transactions_enabled",
    "manual_reconciliation_required",
  ] as const;
  if (booleanKeys.some((key) => typeof row[key] !== "boolean")) return null;
  const version = Number(row.version);
  if (!Number.isInteger(version) || version < 1) return null;
  return {
    aiTradeProposalsEnabled: row.ai_trade_proposals_enabled as boolean,
    brokerConnectivityEnabled: row.broker_connectivity_enabled as boolean,
    newOrdersEnabled: row.new_orders_enabled as boolean,
    readOnly: row.read_only as boolean,
    investorTransactionsEnabled: row.investor_transactions_enabled as boolean,
    manualReconciliationRequired: row.manual_reconciliation_required as boolean,
    version,
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
    updatedBy: typeof row.updated_by === "string" ? row.updated_by : null,
    failSafe: false,
  };
}

export function serializeEmergencyPortfolioControlDraft(
  draft: EmergencyPortfolioControlDraft
) {
  return {
    ai_trade_proposals_enabled: draft.aiTradeProposalsEnabled,
    broker_connectivity_enabled: draft.brokerConnectivityEnabled,
    new_orders_enabled: draft.newOrdersEnabled,
    read_only: draft.readOnly,
    investor_transactions_enabled: draft.investorTransactionsEnabled,
    manual_reconciliation_required: draft.manualReconciliationRequired,
  };
}

export function emergencyPortfolioControlDraft(
  state: EmergencyPortfolioControlState
): EmergencyPortfolioControlDraft {
  return {
    aiTradeProposalsEnabled: state.aiTradeProposalsEnabled,
    brokerConnectivityEnabled: state.brokerConnectivityEnabled,
    newOrdersEnabled: state.newOrdersEnabled,
    readOnly: state.readOnly,
    investorTransactionsEnabled: state.investorTransactionsEnabled,
    manualReconciliationRequired: state.manualReconciliationRequired,
  };
}

export function emergencyLockdownDraft(): EmergencyPortfolioControlDraft {
  return {
    aiTradeProposalsEnabled: false,
    brokerConnectivityEnabled: false,
    newOrdersEnabled: false,
    readOnly: true,
    investorTransactionsEnabled: false,
    manualReconciliationRequired: true,
  };
}

export function isEmergencyControlRelaxation(
  current: EmergencyPortfolioControlState,
  next: EmergencyPortfolioControlDraft
) {
  return (
    (!current.aiTradeProposalsEnabled && next.aiTradeProposalsEnabled) ||
    (!current.brokerConnectivityEnabled && next.brokerConnectivityEnabled) ||
    (!current.newOrdersEnabled && next.newOrdersEnabled) ||
    (current.readOnly && !next.readOnly) ||
    (!current.investorTransactionsEnabled && next.investorTransactionsEnabled) ||
    (current.manualReconciliationRequired && !next.manualReconciliationRequired)
  );
}

export async function getEmergencyPortfolioControls(): Promise<EmergencyPortfolioControlState> {
  const { data, error } = await supabaseAdmin
    .from("admin_settings")
    .select("value_json")
    .eq("key", EMERGENCY_PORTFOLIO_SETTING_KEY)
    .maybeSingle();

  if (error) {
    console.error("[emergency-portfolio-controls] Failed to load controls:", error.message);
    return { ...FAIL_SAFE_CONTROLS };
  }
  if (!data?.value_json) {
    console.error("[emergency-portfolio-controls] Controls are not initialized; entering fail-safe mode.");
    return { ...FAIL_SAFE_CONTROLS };
  }
  const controls = normalizeStoredControls(data.value_json);
  if (!controls) {
    console.error("[emergency-portfolio-controls] Control state is malformed; entering fail-safe mode.");
    return { ...FAIL_SAFE_CONTROLS };
  }
  return controls;
}

function blockedResponse(code: string, error: string, status = 423) {
  return NextResponse.json(
    { error, code, emergencyControlActive: true },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

export async function requirePortfolioWriteAccess() {
  const controls = await getEmergencyPortfolioControls();
  if (!controls.readOnly) return null;
  return blockedResponse(
    "portfolio_read_only",
    "The investment system is in READ ONLY mode. Financial and research mutations are blocked."
  );
}

export async function requireAiTradeProposalsAccess() {
  const controls = await getEmergencyPortfolioControls();
  if (controls.aiTradeProposalsEnabled && !controls.readOnly) return null;
  return blockedResponse(
    controls.readOnly ? "portfolio_read_only" : "ai_trade_proposals_disabled",
    controls.readOnly
      ? "The investment system is in READ ONLY mode."
      : "AI-generated trade proposals are disabled by an emergency portfolio control."
  );
}

export async function requireBrokerConnectivityAccess() {
  const controls = await getEmergencyPortfolioControls();
  if (controls.brokerConnectivityEnabled) return null;
  return blockedResponse(
    "broker_connectivity_emergency_disabled",
    "Broker connectivity is disabled by an emergency portfolio control.",
    503
  );
}

export async function requireNewOrdersAccess() {
  const controls = await getEmergencyPortfolioControls();
  if (
    controls.newOrdersEnabled &&
    !controls.readOnly &&
    !controls.manualReconciliationRequired
  ) {
    return null;
  }
  const code = controls.manualReconciliationRequired
    ? "manual_reconciliation_required"
    : controls.readOnly
      ? "portfolio_read_only"
      : "new_orders_disabled";
  return blockedResponse(
    code,
    controls.manualReconciliationRequired
      ? "New orders are blocked until manual reconciliation is completed and approved by an authorized human administrator."
      : controls.readOnly
        ? "The investment system is in READ ONLY mode."
        : "New orders are disabled by an emergency portfolio control."
  );
}

export async function requireInvestorTransactionProcessingAccess() {
  const controls = await getEmergencyPortfolioControls();
  if (
    controls.investorTransactionsEnabled &&
    !controls.readOnly &&
    !controls.manualReconciliationRequired
  ) {
    return null;
  }
  const code = controls.manualReconciliationRequired
    ? "manual_reconciliation_required"
    : controls.readOnly
      ? "portfolio_read_only"
      : "investor_transactions_frozen";
  return blockedResponse(
    code,
    controls.manualReconciliationRequired
      ? "Investor transaction processing is frozen pending manual reconciliation and authorized human approval."
      : controls.readOnly
        ? "The investment system is in READ ONLY mode."
        : "Investor transaction processing is frozen by an emergency portfolio control."
  );
}

const AI_TRADE_PROPOSAL_PATTERNS = [
  /^\s*(?:[-*]\s*)?(?:decision state|estado de decisi[oó]n)\s*:?\s*propose\b/i,
  /\b(?:consider|considering|considerar)\s+(?:adding|increasing|buying|add|increase|añadir|aumentar|comprar)\b/i,
  /\b(?:proposed?|proposal|propuesta)\s+(?:position|position size|allocation|posición|tamaño|asignación)\b/i,
];

export function enforceAiTradeProposalControl(text: string, enabled: boolean) {
  const input = String(text ?? "");
  if (enabled) return { text: input, blockedProposalCount: 0 };

  let blockedProposalCount = 0;
  const replacement =
    "AI-GENERATED TRADE PROPOSALS ARE DISABLED - research evidence is available for human review only.";
  const output: string[] = [];
  for (const line of input.split("\n")) {
    const blocked = AI_TRADE_PROPOSAL_PATTERNS.some((pattern) => pattern.test(line));
    if (!blocked) {
      output.push(line);
      continue;
    }
    blockedProposalCount += 1;
    if (output.at(-1) !== replacement) output.push(replacement);
  }
  return { text: output.join("\n"), blockedProposalCount };
}

export const AI_TRADE_PROPOSAL_DISABLED_PROMPT = `
EMERGENCY PORTFOLIO CONTROL (MANDATORY):
- AI-generated trade proposals are disabled.
- Continue objective research, but do not output PROPOSE as a decision state.
- Do not suggest adding, increasing, buying, sizing, allocating, or opening a position.
- Do not create a position-size proposal or an Investment Committee proposal.
- State that the research is available for authorized human review only.
`.trim();
