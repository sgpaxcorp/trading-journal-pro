import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supaBaseAdmin", () => ({ supabaseAdmin: {} }));

import {
  emergencyLockdownDraft,
  enforceAiTradeProposalControl,
  isEmergencyControlRelaxation,
  serializeEmergencyPortfolioControlDraft,
  type EmergencyPortfolioControlState,
} from "@/lib/emergencyPortfolioControls";

const operatingState: EmergencyPortfolioControlState = {
  aiTradeProposalsEnabled: true,
  brokerConnectivityEnabled: true,
  newOrdersEnabled: true,
  readOnly: false,
  investorTransactionsEnabled: true,
  manualReconciliationRequired: false,
  version: 1,
  updatedAt: null,
  updatedBy: null,
  failSafe: false,
};

describe("Emergency Portfolio Control System", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a complete restrictive lockdown state", () => {
    expect(emergencyLockdownDraft()).toEqual({
      aiTradeProposalsEnabled: false,
      brokerConnectivityEnabled: false,
      newOrdersEnabled: false,
      readOnly: true,
      investorTransactionsEnabled: false,
      manualReconciliationRequired: true,
    });
  });

  it("does not classify additional restrictions as re-enablement", () => {
    expect(isEmergencyControlRelaxation(operatingState, emergencyLockdownDraft())).toBe(false);
  });

  it.each([
    ["AI proposals", { aiTradeProposalsEnabled: true }],
    ["broker connectivity", { brokerConnectivityEnabled: true }],
    ["new orders", { newOrdersEnabled: true }],
    ["writable mode", { readOnly: false }],
    ["investor transactions", { investorTransactionsEnabled: true }],
    ["reconciliation clearance", { manualReconciliationRequired: false }],
  ])("requires human re-enablement for %s", (_label, change) => {
    const locked = { ...operatingState, ...emergencyLockdownDraft(), version: 2 };
    expect(
      isEmergencyControlRelaxation(locked, {
        ...emergencyLockdownDraft(),
        ...change,
      })
    ).toBe(true);
  });

  it("serializes only database control fields", () => {
    expect(serializeEmergencyPortfolioControlDraft(emergencyLockdownDraft())).toEqual({
      ai_trade_proposals_enabled: false,
      broker_connectivity_enabled: false,
      new_orders_enabled: false,
      read_only: true,
      investor_transactions_enabled: false,
      manual_reconciliation_required: true,
    });
  });

  it("removes AI-generated proposal language while preserving research", () => {
    const result = enforceAiTradeProposalControl(
      [
        "Revenue evidence remains incomplete.",
        "Decision state: PROPOSE",
        "Decision support suggests considering adding shares.",
      ].join("\n"),
      false
    );

    expect(result.text).toContain("Revenue evidence remains incomplete.");
    expect(result.text).toContain("AI-GENERATED TRADE PROPOSALS ARE DISABLED");
    expect(result.text).not.toContain("PROPOSE");
    expect(result.text).not.toContain("adding shares");
    expect(result.blockedProposalCount).toBe(2);
  });

  it("keeps AI output unchanged when proposal generation is enabled", () => {
    const text = "Decision state: PROPOSE";
    expect(enforceAiTradeProposalControl(text, true)).toEqual({
      text,
      blockedProposalCount: 0,
    });
  });

  it("defines database-enforced immutable and human-approved transitions", () => {
    const sql = readFileSync(
      join(
        process.cwd(),
        "supabase/migrations/20260916000400_emergency_portfolio_controls.sql"
      ),
      "utf8"
    );

    expect(sql).toContain("before update or delete on public.portfolio_emergency_control_events");
    expect(sql).toContain("Emergency portfolio controls can only be changed through the authorized transition function");
    expect(sql).toContain("RE-ENABLE FINANCIAL ACTIONS");
    expect(sql).toContain("p_actor_type <> 'human_admin'");
    expect(sql).toContain("previous_event_hash");
    expect(sql).toContain("event_hash");
    expect(sql).toContain("emergency_portfolio_read_only");
    expect(sql).toContain("emergency_investor_transaction_freeze");
    expect(sql).toContain("emergency_broker_connectivity");
  });
});
