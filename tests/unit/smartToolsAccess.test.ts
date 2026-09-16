import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  getUserById: vi.fn(),
  isAdminAccount: vi.fn(),
}));

vi.mock("@/lib/adminAuth", () => ({
  isAdminAccount: authMocks.isAdminAccount,
}));

vi.mock("@/lib/supaBaseAdmin", () => ({
  supabaseAdmin: {
    auth: {
      admin: {
        getUserById: authMocks.getUserById,
      },
    },
  },
}));

import { isSmartToolsOwner } from "@/lib/smartToolsAccess";

describe("Smart Tools access", () => {
  const originalAdminEmails = process.env.ADMIN_EMAILS;
  const originalOwnerEmails = process.env.SMART_TOOLS_OWNER_EMAILS;

  beforeEach(() => {
    authMocks.getUserById.mockReset();
    authMocks.isAdminAccount.mockReset();
    process.env.ADMIN_EMAILS = "admin@example.com";
    process.env.SMART_TOOLS_OWNER_EMAILS = "owner@example.com";
  });

  afterEach(() => {
    if (originalAdminEmails === undefined) delete process.env.ADMIN_EMAILS;
    else process.env.ADMIN_EMAILS = originalAdminEmails;
    if (originalOwnerEmails === undefined) delete process.env.SMART_TOOLS_OWNER_EMAILS;
    else process.env.SMART_TOOLS_OWNER_EMAILS = originalOwnerEmails;
  });

  it("allows an active platform admin even when the email is not in the owner list", async () => {
    authMocks.isAdminAccount.mockResolvedValueOnce(true);

    await expect(
      isSmartToolsOwner({ userId: "admin-user", email: "database-admin@example.com" })
    ).resolves.toBe(true);

    expect(authMocks.isAdminAccount).toHaveBeenCalledWith(
      "admin-user",
      "database-admin@example.com"
    );
    expect(authMocks.getUserById).not.toHaveBeenCalled();
  });

  it("allows a database admin when no email allowlist is configured", async () => {
    delete process.env.ADMIN_EMAILS;
    delete process.env.SMART_TOOLS_OWNER_EMAILS;
    authMocks.isAdminAccount.mockResolvedValueOnce(true);

    await expect(isSmartToolsOwner({ userId: "database-admin" })).resolves.toBe(true);

    expect(authMocks.isAdminAccount).toHaveBeenCalledWith("database-admin", null);
    expect(authMocks.getUserById).not.toHaveBeenCalled();
  });

  it("keeps ADMIN_EMAILS authorized when a separate owner list is configured", async () => {
    await expect(
      isSmartToolsOwner({ userId: "env-admin", email: "ADMIN@example.com" })
    ).resolves.toBe(true);

    expect(authMocks.isAdminAccount).not.toHaveBeenCalled();
    expect(authMocks.getUserById).not.toHaveBeenCalled();
  });

  it("allows an explicitly configured Smart Tools owner", async () => {
    await expect(
      isSmartToolsOwner({ userId: "owner-user", email: "owner@example.com" })
    ).resolves.toBe(true);

    expect(authMocks.isAdminAccount).not.toHaveBeenCalled();
  });

  it("denies a non-admin user outside both allowlists", async () => {
    authMocks.isAdminAccount.mockResolvedValueOnce(false);
    authMocks.getUserById.mockResolvedValueOnce({
      data: { user: { email: "member@example.com" } },
      error: null,
    });

    await expect(
      isSmartToolsOwner({ userId: "member-user", email: "member@example.com" })
    ).resolves.toBe(false);
  });
});
