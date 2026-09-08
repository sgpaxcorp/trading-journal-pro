import { beforeEach, describe, expect, it, vi } from "vitest";

const supabaseMocks = vi.hoisted(() => {
  const insert = vi.fn();
  const single = vi.fn();
  const chain = {
    insert,
    select: vi.fn(),
    single,
  };
  insert.mockReturnValue(chain);
  chain.select.mockReturnValue(chain);
  return { chain, insert, single };
});

vi.mock("@/lib/supaBaseClient", () => ({
  supabaseBrowser: {
    from: vi.fn(() => supabaseMocks.chain),
  },
}));

import { fireTestEventFromRule } from "@/lib/alertsSupabase";

describe("alert test events", () => {
  beforeEach(() => {
    supabaseMocks.insert.mockClear();
    supabaseMocks.single.mockReset();
  });

  it("always includes a valid date in the primary insert", async () => {
    supabaseMocks.single.mockResolvedValueOnce({ data: { id: "event-1" }, error: null });

    const result = await fireTestEventFromRule("user-1", "rule-1");

    expect(result.ok).toBe(true);
    expect(supabaseMocks.insert).toHaveBeenCalledTimes(1);
    expect(supabaseMocks.insert.mock.calls[0]?.[0]?.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("keeps the required date when the compatibility insert is used", async () => {
    supabaseMocks.single
      .mockResolvedValueOnce({ data: null, error: { message: "Primary insert failed" } })
      .mockResolvedValueOnce({ data: { id: "event-2" }, error: null });

    const result = await fireTestEventFromRule("user-1", "rule-1");

    expect(result.ok).toBe(true);
    expect(supabaseMocks.insert).toHaveBeenCalledTimes(2);
    expect(supabaseMocks.insert.mock.calls[1]?.[0]?.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(supabaseMocks.insert.mock.calls[1]?.[0]?.date).not.toBeNull();
  });
});
