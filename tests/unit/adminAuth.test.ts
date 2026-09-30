import { beforeEach, describe, expect, it, vi } from "vitest";

const adminMocks = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/supaBaseAdmin", () => ({
  supabaseAdmin: {
    from: adminMocks.from,
  },
}));

import { getAdminAccess } from "@/lib/adminAuth";

function adminQuery(result: { data: unknown; error: unknown }) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  return query;
}

describe("admin auth", () => {
  beforeEach(() => {
    adminMocks.from.mockReset();
  });

  it("falls back to the legacy admin schema when permissions is not migrated yet", async () => {
    const currentSchema = adminQuery({
      data: null,
      error: {
        code: "42703",
        message: "column admin_users.permissions does not exist",
      },
    });
    const legacySchema = adminQuery({
      data: { user_id: "admin-user", active: true, role: "admin" },
      error: null,
    });
    adminMocks.from.mockReturnValueOnce(currentSchema).mockReturnValueOnce(legacySchema);

    await expect(getAdminAccess("admin-user", "admin@example.com")).resolves.toMatchObject({
      isAdmin: true,
      role: "owner",
      source: "database",
    });
  });
});
