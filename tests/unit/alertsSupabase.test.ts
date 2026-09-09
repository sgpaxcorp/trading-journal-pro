import { beforeEach, describe, expect, it, vi } from "vitest";

const supabaseMocks = vi.hoisted(() => {
  const upsert = vi.fn();
  const single = vi.fn();
  const chain = {
    upsert,
    select: vi.fn(),
    single,
  };
  upsert.mockReturnValue(chain);
  chain.select.mockReturnValue(chain);
  return { chain, upsert, single };
});

vi.mock("@/lib/supaBaseClient", () => ({
  supabaseBrowser: {
    from: vi.fn(() => supabaseMocks.chain),
  },
}));

import { fireTestEventFromRule } from "@/lib/alertsSupabase";

describe("alert test events", () => {
  beforeEach(() => {
    supabaseMocks.upsert.mockClear();
    supabaseMocks.single.mockReset();
  });

  it("upserts a dated event using the daily uniqueness key", async () => {
    supabaseMocks.single.mockResolvedValueOnce({ data: { id: "event-1" }, error: null });

    const result = await fireTestEventFromRule("user-1", "rule-1");

    expect(result.ok).toBe(true);
    expect(supabaseMocks.upsert).toHaveBeenCalledTimes(1);
    expect(supabaseMocks.upsert.mock.calls[0]?.[0]?.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(supabaseMocks.upsert.mock.calls[0]?.[1]).toEqual({ onConflict: "user_id,rule_id,date" });
  });

  it("keeps the required date and conflict key in the compatibility upsert", async () => {
    supabaseMocks.single
      .mockResolvedValueOnce({ data: null, error: { message: "Primary insert failed" } })
      .mockResolvedValueOnce({ data: { id: "event-2" }, error: null });

    const result = await fireTestEventFromRule("user-1", "rule-1");

    expect(result.ok).toBe(true);
    expect(supabaseMocks.upsert).toHaveBeenCalledTimes(2);
    expect(supabaseMocks.upsert.mock.calls[1]?.[0]?.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(supabaseMocks.upsert.mock.calls[1]?.[0]?.date).not.toBeNull();
    expect(supabaseMocks.upsert.mock.calls[1]?.[1]).toEqual({ onConflict: "user_id,rule_id,date" });
  });
});
