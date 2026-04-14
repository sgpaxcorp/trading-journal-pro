import {
  isActiveEntitlementStatus,
  PLATFORM_ACCESS_ENTITLEMENT,
} from "@/lib/accessControl";

export type AccessGrantKey =
  | typeof PLATFORM_ACCESS_ENTITLEMENT
  | "page_dashboard"
  | "page_growth_plan"
  | "page_journal"
  | "page_import"
  | "page_order_audit"
  | "page_analytics"
  | "page_ai_coaching"
  | "page_profit_loss_track"
  | "option_flow"
  | "broker_sync"
  | "page_notebook"
  | "page_back_study"
  | "page_rules_alarms"
  | "page_challenges"
  | "page_forum"
  | "page_global_ranking";

export type AccessGrantDefinition = {
  key: AccessGrantKey;
  group: "core" | "performance" | "tools" | "community" | "addons";
  label: {
    en: string;
    es: string;
  };
  description: {
    en: string;
    es: string;
  };
  primaryPath: string;
  paths: string[];
};

type EntitlementLike = {
  entitlement_key?: string | null;
  status?: string | null;
};

const MEMBER_UTILITY_PATHS = ["/account", "/messages"];

export const ACCESS_GRANTS: AccessGrantDefinition[] = [
  {
    key: PLATFORM_ACCESS_ENTITLEMENT,
    group: "core",
    label: { en: "Core app access", es: "Acceso principal a la app" },
    description: {
      en: "Unlocks the main private workspace and standard core pages.",
      es: "Desbloquea el workspace privado principal y las páginas core estándar.",
    },
    primaryPath: "/dashboard",
    paths: ["/dashboard", "/growth-plan", "/journal", "/import", "/audit/order-history"],
  },
  {
    key: "page_dashboard",
    group: "core",
    label: { en: "Dashboard", es: "Dashboard" },
    description: {
      en: "Dashboard and account overview.",
      es: "Dashboard y visión general de la cuenta.",
    },
    primaryPath: "/dashboard",
    paths: ["/dashboard"],
  },
  {
    key: "page_growth_plan",
    group: "core",
    label: { en: "Growth Plan", es: "Growth Plan" },
    description: {
      en: "Growth plan and checkpoint planning.",
      es: "Growth plan y planificación de checkpoints.",
    },
    primaryPath: "/growth-plan",
    paths: ["/growth-plan"],
  },
  {
    key: "page_journal",
    group: "core",
    label: { en: "Daily Journal", es: "Daily Journal" },
    description: {
      en: "Journal planning, in-trade logging, and after-trade review.",
      es: "Planificación del journal, registro en-trade y revisión post-trade.",
    },
    primaryPath: "/journal",
    paths: ["/journal"],
  },
  {
    key: "page_import",
    group: "tools",
    label: { en: "Imports", es: "Imports" },
    description: {
      en: "Manual imports and broker statement ingestion.",
      es: "Imports manuales e ingestión de statements de broker.",
    },
    primaryPath: "/import",
    paths: ["/import"],
  },
  {
    key: "broker_sync",
    group: "addons",
    label: { en: "Broker Sync", es: "Broker Sync" },
    description: {
      en: "Broker connection and sync-related access.",
      es: "Conexión de broker y acceso relacionado al sync.",
    },
    primaryPath: "/import",
    paths: ["/import"],
  },
  {
    key: "page_order_audit",
    group: "tools",
    label: { en: "Order Audit", es: "Order Audit" },
    description: {
      en: "Order history audit and execution review.",
      es: "Auditoría de order history y revisión de ejecución.",
    },
    primaryPath: "/audit/order-history",
    paths: ["/audit/order-history"],
  },
  {
    key: "page_analytics",
    group: "performance",
    label: { en: "Analytics", es: "Analytics" },
    description: {
      en: "Statistics, charts, and plan analytics pages.",
      es: "Estadísticas, charts y páginas de analytics del plan.",
    },
    primaryPath: "/performance/analytics-statistics",
    paths: [
      "/performance/analytics-statistics",
      "/performance/balance-chart",
      "/performance/plan-summary",
      "/performance/plan",
    ],
  },
  {
    key: "page_ai_coaching",
    group: "performance",
    label: { en: "AI Coaching", es: "AI Coaching" },
    description: {
      en: "AI coaching and review workflow.",
      es: "Coaching con IA y flujo de revisión.",
    },
    primaryPath: "/performance/ai-coaching",
    paths: ["/performance/ai-coaching"],
  },
  {
    key: "page_profit_loss_track",
    group: "performance",
    label: { en: "Profit & Loss Track", es: "Profit & Loss Track" },
    description: {
      en: "Business costs and profitability tracker.",
      es: "Tracker de costos y rentabilidad del negocio.",
    },
    primaryPath: "/performance/profit-loss-track",
    paths: ["/performance/profit-loss-track"],
  },
  {
    key: "option_flow",
    group: "addons",
    label: { en: "Option Flow", es: "Option Flow" },
    description: {
      en: "Option Flow workspace and outcomes.",
      es: "Workspace de Option Flow y outcomes.",
    },
    primaryPath: "/option-flow",
    paths: ["/option-flow"],
  },
  {
    key: "page_notebook",
    group: "tools",
    label: { en: "Notebook", es: "Notebook" },
    description: {
      en: "Freeform notes and research notebook.",
      es: "Notas libres y notebook de research.",
    },
    primaryPath: "/notebook",
    paths: ["/notebook"],
  },
  {
    key: "page_back_study",
    group: "tools",
    label: { en: "Back-Study", es: "Back-Study" },
    description: {
      en: "Back-study and replay workflows.",
      es: "Back-study y flujos de replay.",
    },
    primaryPath: "/back-study",
    paths: ["/back-study"],
  },
  {
    key: "page_rules_alarms",
    group: "tools",
    label: { en: "Rules & Alarms", es: "Rules & Alarms" },
    description: {
      en: "Rules, alarms, and reminders pages.",
      es: "Páginas de reglas, alarmas y reminders.",
    },
    primaryPath: "/rules-alarms/alarms",
    paths: ["/rules-alarms/alarms", "/rules-alarms/reminders"],
  },
  {
    key: "page_challenges",
    group: "community",
    label: { en: "Challenges", es: "Challenges" },
    description: {
      en: "Challenges hub and individual challenge pages.",
      es: "Hub de challenges y páginas individuales de challenge.",
    },
    primaryPath: "/challenges",
    paths: ["/challenges"],
  },
  {
    key: "page_forum",
    group: "community",
    label: { en: "Forum", es: "Forum" },
    description: {
      en: "Community feed and discussions.",
      es: "Feed de comunidad y discusiones.",
    },
    primaryPath: "/forum/community-feed",
    paths: ["/forum"],
  },
  {
    key: "page_global_ranking",
    group: "community",
    label: { en: "Global Ranking", es: "Global Ranking" },
    description: {
      en: "Leaderboard and trophies ranking views.",
      es: "Leaderboard y vistas de ranking de trofeos.",
    },
    primaryPath: "/globalranking",
    paths: ["/globalranking"],
  },
];

const ACCESS_GRANT_KEYS = new Set<string>(ACCESS_GRANTS.map((item) => item.key));

function normalizePathname(pathname: string): string {
  const value = String(pathname || "").trim();
  if (!value) return "/";
  if (value.length > 1 && value.endsWith("/")) return value.slice(0, -1);
  return value;
}

function pathMatches(pathname: string, basePath: string): boolean {
  const path = normalizePathname(pathname);
  const base = normalizePathname(basePath);
  return path === base || path.startsWith(`${base}/`);
}

export function isAccessGrantKey(value: string): value is AccessGrantKey {
  return ACCESS_GRANT_KEYS.has(String(value || ""));
}

export function getAccessGrantDefinition(key: AccessGrantKey): AccessGrantDefinition | undefined {
  return ACCESS_GRANTS.find((item) => item.key === key);
}

export function getActiveAccessGrantKeys(entitlements: EntitlementLike[]): Set<AccessGrantKey> {
  const out = new Set<AccessGrantKey>();
  for (const row of entitlements ?? []) {
    const key = String(row?.entitlement_key ?? "");
    if (!isAccessGrantKey(key)) continue;
    if (!isActiveEntitlementStatus(row?.status)) continue;
    out.add(key);
  }
  return out;
}

export function hasAnyRecognizedAccessGrant(entitlements: EntitlementLike[]): boolean {
  return getActiveAccessGrantKeys(entitlements).size > 0;
}

export function canAccessPrivatePath(
  pathname: string,
  entitlements: EntitlementLike[],
  opts?: { fallbackAllowAll?: boolean }
): boolean {
  if (opts?.fallbackAllowAll) return true;

  const path = normalizePathname(pathname);
  const active = getActiveAccessGrantKeys(entitlements);

  if (!active.size) return false;
  if (path.startsWith("/admin") || path.startsWith("/billing")) return true;
  if (MEMBER_UTILITY_PATHS.some((base) => pathMatches(path, base))) return true;
  if (active.has(PLATFORM_ACCESS_ENTITLEMENT)) return true;

  const matchedGrants = ACCESS_GRANTS.filter(
    (item) => item.key !== PLATFORM_ACCESS_ENTITLEMENT && item.paths.some((base) => pathMatches(path, base))
  );

  if (!matchedGrants.length) return false;
  return matchedGrants.some((item) => active.has(item.key));
}

export function firstAccessiblePrivatePath(entitlements: EntitlementLike[]): string {
  const active = getActiveAccessGrantKeys(entitlements);

  if (active.has(PLATFORM_ACCESS_ENTITLEMENT)) return "/dashboard";

  for (const grant of ACCESS_GRANTS) {
    if (active.has(grant.key)) return grant.primaryPath;
  }

  return "/account";
}
