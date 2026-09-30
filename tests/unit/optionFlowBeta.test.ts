import { beforeEach, describe, expect, it, vi } from "vitest";

const accessMocks = vi.hoisted(() => ({
  isSmartToolsOwner: vi.fn(),
  from: vi.fn(),
}));

vi.mock("@/lib/smartToolsAccess", () => ({
  isSmartToolsOwner: accessMocks.isSmartToolsOwner,
}));

vi.mock("@/lib/supaBaseAdmin", () => ({
  supabaseAdmin: {
    from: accessMocks.from,
  },
}));

import { hasOptionFlowBetaAccess } from "@/lib/optionFlowBeta";

function entitlementQuery(result: { data: unknown; error: unknown }) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    limit: vi.fn().mockResolvedValue(result),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.in.mockReturnValue(query);
  return query;
}

describe("Option Flow beta access", () => {
  beforeEach(() => {
    accessMocks.isSmartToolsOwner.mockReset();
    accessMocks.from.mockReset();
    process.env.SMART_TOOLS_CLOSED_BETA = "true";
  });

  it("honors an active manual entitlement during closed beta", async () => {
    accessMocks.isSmartToolsOwner.mockResolvedValue(false);
    accessMocks.from.mockReturnValue(
      entitlementQuery({ data: [{ status: "active" }], error: null })
    );

    await expect(hasOptionFlowBetaAccess("member-user")).resolves.toBe(true);
  });
});
