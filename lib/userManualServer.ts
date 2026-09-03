import "server-only";

import fs from "node:fs";
import path from "node:path";

export type UserManualLocale = "en" | "es";

export type UserManualSource = {
  slug: string;
  title: string;
  href: string;
  excerpt: string;
};

type ManualDocument = {
  slug: string;
  titles: Record<UserManualLocale, string>;
  keywords: string[];
  routes: string[];
};

const DOCS_ROOT = path.resolve(process.cwd(), "docs", "user-manual");

const MANUAL_DOCUMENTS: ManualDocument[] = [
  {
    slug: "overview",
    titles: { en: "Platform overview", es: "Resumen de la plataforma" },
    keywords: ["overview", "platform", "workspace", "features", "resumen", "plataforma", "funciones"],
    routes: ["/dashboard"],
  },
  {
    slug: "getting-started",
    titles: { en: "Getting started", es: "Primeros pasos" },
    keywords: ["start", "setup", "account", "login", "signup", "onboarding", "empezar", "cuenta", "registro", "inicio"],
    routes: ["/confirmed", "/dashboard-tour", "/quick-tour", "/account"],
  },
  {
    slug: "assistant",
    titles: { en: "Neuro Guide", es: "Guía Neuro" },
    keywords: ["neuro guide", "assistant", "help chat", "guia neuro", "asistente", "chat", "ayuda"],
    routes: ["/help/assistant"],
  },
  {
    slug: "growth-plan",
    titles: { en: "Trading Business Plan", es: "Plan de Empresa de Trading" },
    keywords: ["growth plan", "business plan", "goal", "checkpoint", "capital", "target", "projection", "plan", "meta", "proyeccion", "capital", "objetivo"],
    routes: ["/growth-plan", "/performance/plan-summary"],
  },
  {
    slug: "journal",
    titles: { en: "Journal", es: "Journal" },
    keywords: ["journal", "premarket", "inside trade", "after trade", "session", "entry", "exit", "sesion", "entrada", "salida"],
    routes: ["/journal"],
  },
  {
    slug: "neuro-layer",
    titles: { en: "Neuro Layer", es: "Neuro Layer" },
    keywords: ["neuro layer", "emotion", "mindset", "trigger", "psychology", "emocion", "psicologia", "impulso"],
    routes: ["/journal"],
  },
  {
    slug: "workflows",
    titles: { en: "Daily workflows", es: "Flujos de trabajo" },
    keywords: ["workflow", "routine", "before trade", "during trade", "after trade", "flujo", "rutina", "antes", "durante", "despues"],
    routes: ["/dashboard", "/journal"],
  },
  {
    slug: "dashboard-widgets",
    titles: { en: "Business Center", es: "Centro Empresarial" },
    keywords: ["dashboard", "widget", "account progress", "plan progress", "daily summary", "weekly pnl", "centro empresarial", "progreso", "resumen"],
    routes: ["/dashboard"],
  },
  {
    slug: "analytics",
    titles: { en: "Analytics and performance", es: "Analítica y desempeño" },
    keywords: ["analytics", "performance", "metric", "kpi", "win rate", "profit factor", "expectancy", "drawdown", "analitica", "desempeno", "metrica", "rendimiento"],
    routes: ["/performance/analytics-statistics", "/performance/balance-chart"],
  },
  {
    slug: "kpis",
    titles: { en: "KPIs in plain language", es: "KPIs en lenguaje sencillo" },
    keywords: ["kpi", "metric", "pnl", "win rate", "profit factor", "expectancy", "drawdown", "duration", "metrica", "ganancia", "perdida", "duracion"],
    routes: ["/help/kpis", "/performance/analytics-statistics"],
  },
  {
    slug: "ai-coaching",
    titles: { en: "Business AI Coach", es: "Coach Empresarial IA" },
    keywords: ["ai coach", "coaching", "action plan", "pattern", "coach ia", "patron", "plan de accion"],
    routes: ["/performance/ai-coaching"],
  },
  {
    slug: "notebook",
    titles: { en: "Business Notebook", es: "Notebook Empresarial" },
    keywords: ["notebook", "note", "section", "page", "ink", "libreta", "nota", "seccion", "pagina", "tinta"],
    routes: ["/notebook"],
  },
  {
    slug: "back-study",
    titles: { en: "Strategy Review Lab", es: "Laboratorio de Estrategias" },
    keywords: ["back study", "back-study", "replay", "chart", "strategy", "setup", "grafica", "estrategia", "revision"],
    routes: ["/back-study"],
  },
  {
    slug: "audit",
    titles: { en: "Execution Audit", es: "Auditoría de Ejecución" },
    keywords: ["audit", "order history", "stop", "oco", "fill", "execution", "auditoria", "orden", "ejecucion"],
    routes: ["/audit", "/back-study/audit"],
  },
  {
    slug: "rules-alarms",
    titles: { en: "Business Protection System", es: "Sistema de Protección Empresarial" },
    keywords: ["rule", "alarm", "alert", "reminder", "notification", "protection", "regla", "alarma", "recordatorio", "notificacion", "proteccion"],
    routes: ["/rules-alarms"],
  },
  {
    slug: "data-inputs",
    titles: { en: "Data inputs and imports", es: "Datos e importaciones" },
    keywords: ["import", "csv", "broker", "sync", "data", "trade data", "importar", "datos", "sincronizar"],
    routes: ["/import", "/broker-import"],
  },
  {
    slug: "profit-loss-track",
    titles: { en: "Business P&L Office", es: "Oficina de P&L Empresarial" },
    keywords: ["profit loss", "p&l", "expense", "vendor", "budget", "cashflow", "cost", "gasto", "presupuesto", "flujo de efectivo", "costo"],
    routes: ["/performance/profit-loss", "/cashflow"],
  },
  {
    slug: "option-flow",
    titles: { en: "Option Flow Intelligence", es: "Option Flow Intelligence" },
    keywords: ["option flow", "options", "calls", "puts", "flow", "opciones", "flujo"],
    routes: ["/option-flow"],
  },
  {
    slug: "reports",
    titles: { en: "Reports", es: "Reportes" },
    keywords: ["report", "export", "summary", "reporte", "exportar", "resumen"],
    routes: ["/reports", "/option-flow/reports"],
  },
  {
    slug: "post-mortem",
    titles: { en: "Post-session review", es: "Revisión posterior" },
    keywords: ["post mortem", "post-mortem", "review", "lesson", "mistake", "revision", "leccion", "error"],
    routes: ["/post-mortem", "/journal"],
  },
  {
    slug: "settings",
    titles: { en: "Settings", es: "Ajustes" },
    keywords: ["settings", "language", "theme", "profile", "password", "ajustes", "idioma", "tema", "perfil", "contrasena"],
    routes: ["/account", "/settings", "/reset-password"],
  },
  {
    slug: "billing",
    titles: { en: "Billing and plans", es: "Billing y planes" },
    keywords: ["billing", "plan", "subscription", "renewal", "cancel", "payment", "invoice", "receipt", "facturacion", "suscripcion", "renovacion", "cancelar", "pago", "recibo"],
    routes: ["/billing", "/pricing", "/plans-comparison"],
  },
  {
    slug: "forum",
    titles: { en: "Community Forum", es: "Comunidad" },
    keywords: ["forum", "community", "post", "comment", "foro", "comunidad", "publicacion", "comentario"],
    routes: ["/forum"],
  },
];

const STOP_WORDS = new Set([
  "about", "after", "como", "con", "cuando", "donde", "esta", "este", "esto", "from", "have", "help",
  "para", "pero", "porque", "puedo", "que", "the", "this", "tiene", "una", "what", "when", "where", "with",
]);

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9%$./-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function queryTerms(value: string) {
  return Array.from(
    new Set(
      normalize(value)
        .split(" ")
        .filter((term) => term.length >= 3 && !STOP_WORDS.has(term))
    )
  );
}

function isRouteMatch(pathname: string, route: string) {
  return pathname === route || pathname.startsWith(`${route}/`);
}

function resolveDocumentPath(locale: UserManualLocale, slug: string) {
  const fullPath = path.resolve(DOCS_ROOT, locale, `${slug}.md`);
  const localeRoot = path.resolve(DOCS_ROOT, locale);
  if (!fullPath.startsWith(`${localeRoot}${path.sep}`)) {
    throw new Error("Invalid user manual path.");
  }
  return fullPath;
}

function readDocument(locale: UserManualLocale, slug: string) {
  try {
    return fs.readFileSync(resolveDocumentPath(locale, slug), "utf8").trim();
  } catch {
    return "";
  }
}

function splitIntoSections(markdown: string) {
  const sections: Array<{ heading: string; content: string }> = [];
  let heading = "Overview";
  let lines: string[] = [];

  const push = () => {
    const content = lines.join("\n").trim();
    if (content) sections.push({ heading, content });
    lines = [];
  };

  for (const line of markdown.split(/\r?\n/)) {
    const match = line.match(/^#{1,3}\s+(.+)$/);
    if (match) {
      push();
      heading = match[1].trim();
    } else {
      lines.push(line);
    }
  }
  push();
  return sections;
}

function documentScore(document: ManualDocument, normalizedQuery: string, pathname: string) {
  let score = document.routes.some((route) => isRouteMatch(pathname, route)) ? 20 : 0;
  for (const keyword of document.keywords) {
    if (normalizedQuery.includes(normalize(keyword))) score += keyword.includes(" ") ? 7 : 4;
  }
  for (const term of queryTerms(normalizedQuery)) {
    if (normalize(document.titles.en).includes(term) || normalize(document.titles.es).includes(term)) score += 3;
  }
  return score;
}

export function buildUserManualContext(params: {
  locale: UserManualLocale;
  question: string;
  pathname?: string | null;
  maxChars?: number;
  maxChunks?: number;
}): { context: string; sources: UserManualSource[] } {
  const locale = params.locale;
  const pathname = String(params.pathname || "").trim();
  const normalizedQuery = normalize(`${params.question} ${pathname}`);
  const terms = queryTerms(normalizedQuery);
  const maxChars = Math.max(2000, Math.min(24000, params.maxChars ?? 14000));
  const maxChunks = Math.max(2, Math.min(10, params.maxChunks ?? 6));

  const rankedDocs = MANUAL_DOCUMENTS
    .map((document) => ({ document, score: documentScore(document, normalizedQuery, pathname) }))
    .sort((a, b) => b.score - a.score);

  const candidates = rankedDocs.filter((item) => item.score > 0).slice(0, 6);
  if (!candidates.length) {
    for (const slug of ["overview", "getting-started", "assistant"]) {
      const item = rankedDocs.find((candidate) => candidate.document.slug === slug);
      if (item) candidates.push(item);
    }
  }

  const chunks = candidates.flatMap(({ document, score: docScore }) => {
    const markdown = readDocument(locale, document.slug);
    return splitIntoSections(markdown).map((section, index) => {
      const searchable = normalize(`${section.heading} ${section.content}`);
      const overlap = terms.reduce((total, term) => total + (searchable.includes(term) ? 1 : 0), 0);
      return {
        document,
        section,
        score: docScore + overlap * 2 + (index === 0 ? 1 : 0),
      };
    });
  });

  chunks.sort((a, b) => b.score - a.score);

  const selected: typeof chunks = [];
  const perDocument = new Map<string, number>();
  let usedChars = 0;
  for (const chunk of chunks) {
    if (selected.length >= maxChunks) break;
    const usedForDoc = perDocument.get(chunk.document.slug) ?? 0;
    if (usedForDoc >= 3) continue;
    const excerpt = chunk.section.content.slice(0, 4200);
    if (usedChars + excerpt.length > maxChars && selected.length >= 2) continue;
    selected.push({ ...chunk, section: { ...chunk.section, content: excerpt } });
    perDocument.set(chunk.document.slug, usedForDoc + 1);
    usedChars += excerpt.length;
  }

  const sourceMap = new Map<string, UserManualSource>();
  const context = selected
    .map((chunk) => {
      const href = chunk.document.slug === "overview" ? "/help" : `/help/${chunk.document.slug}`;
      if (!sourceMap.has(chunk.document.slug)) {
        sourceMap.set(chunk.document.slug, {
          slug: chunk.document.slug,
          title: chunk.document.titles[locale],
          href,
          excerpt: chunk.section.content.slice(0, 280),
        });
      }
      return [
        `SOURCE: ${chunk.document.titles[locale]} (${href})`,
        `SECTION: ${chunk.section.heading}`,
        chunk.section.content,
      ].join("\n");
    })
    .join("\n\n---\n\n")
    .slice(0, maxChars);

  return { context, sources: Array.from(sourceMap.values()) };
}
