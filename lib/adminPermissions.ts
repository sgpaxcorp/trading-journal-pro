export const ADMIN_ROLES = [
  "owner",
  "operations",
  "finance",
  "support",
  "marketing",
  "auditor",
] as const;

export type AdminRole = (typeof ADMIN_ROLES)[number];

export const ADMIN_PERMISSIONS = [
  "dashboard.read",
  "metrics.read",
  "finance.read",
  "finance.write",
  "operations.read",
  "operations.write",
  "communications.read",
  "communications.write",
  "users.read",
  "users.write",
  "users.destructive",
  "support.read",
  "support.write",
  "audit.read",
  "admins.manage",
] as const;

export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];

const ALL_PERMISSIONS = [...ADMIN_PERMISSIONS] as AdminPermission[];

export const ADMIN_ROLE_PERMISSIONS: Record<AdminRole, readonly AdminPermission[]> = {
  owner: ALL_PERMISSIONS,
  operations: [
    "dashboard.read",
    "metrics.read",
    "operations.read",
    "operations.write",
    "users.read",
    "audit.read",
  ],
  finance: [
    "dashboard.read",
    "metrics.read",
    "finance.read",
    "finance.write",
    "users.read",
    "audit.read",
  ],
  support: [
    "dashboard.read",
    "users.read",
    "users.write",
    "support.read",
    "support.write",
  ],
  marketing: [
    "dashboard.read",
    "metrics.read",
    "communications.read",
    "communications.write",
    "users.read",
  ],
  auditor: [
    "dashboard.read",
    "metrics.read",
    "finance.read",
    "operations.read",
    "users.read",
    "support.read",
    "audit.read",
  ],
};

const LEGACY_ROLE_MAP: Record<string, AdminRole> = {
  admin: "owner",
  superadmin: "owner",
  super_admin: "owner",
  administrator: "owner",
};

export function normalizeAdminRole(value: unknown): AdminRole {
  const normalized = String(value ?? "").trim().toLowerCase();
  if ((ADMIN_ROLES as readonly string[]).includes(normalized)) {
    return normalized as AdminRole;
  }
  return LEGACY_ROLE_MAP[normalized] ?? "owner";
}

export function normalizeAdminPermissions(value: unknown): AdminPermission[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set<string>(ADMIN_PERMISSIONS);
  return Array.from(
    new Set(
      value
        .map((item) => String(item ?? "").trim())
        .filter((item): item is AdminPermission => allowed.has(item))
    )
  );
}

export function permissionsForAdmin(
  roleValue: unknown,
  customPermissions?: unknown
): AdminPermission[] {
  const role = normalizeAdminRole(roleValue);
  return Array.from(
    new Set([
      ...ADMIN_ROLE_PERMISSIONS[role],
      ...normalizeAdminPermissions(customPermissions),
    ])
  );
}

export function adminHasPermission(
  permissions: readonly string[] | null | undefined,
  permission: AdminPermission
) {
  return Boolean(permissions?.includes(permission));
}

export const ADMIN_ROLE_LABELS: Record<AdminRole, { en: string; es: string }> = {
  owner: { en: "Owner", es: "Propietario" },
  operations: { en: "Operations", es: "Operaciones" },
  finance: { en: "Finance", es: "Finanzas" },
  support: { en: "Support", es: "Soporte" },
  marketing: { en: "Marketing", es: "Mercadeo" },
  auditor: { en: "Read-only auditor", es: "Auditor de solo lectura" },
};
