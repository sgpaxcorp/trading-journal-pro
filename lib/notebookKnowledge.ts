export const NOTEBOOK_PAGE_TYPES = [
  "general",
  "daily_review",
  "lesson",
  "setup_playbook",
  "risk_rule",
  "research",
  "decision",
  "funded_program",
] as const;

export const NOTEBOOK_PAGE_STATUSES = [
  "draft",
  "candidate",
  "validated",
  "active",
  "retired",
  "archived",
] as const;

export const NOTEBOOK_SCOPES = ["business", "account"] as const;

export type NotebookPageType = (typeof NOTEBOOK_PAGE_TYPES)[number];
export type NotebookPageStatus = (typeof NOTEBOOK_PAGE_STATUSES)[number];
export type NotebookScope = (typeof NOTEBOOK_SCOPES)[number];

export type NotebookBook = {
  id: string;
  user_id?: string;
  account_id: string | null;
  scope: NotebookScope;
  name: string;
  description: string | null;
  sort_order: number;
  archived_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string | null;
};

export type NotebookSection = {
  id: string;
  user_id?: string;
  notebook_id: string;
  name: string;
  created_at: string;
  updated_at: string | null;
};

export type NotebookPageSummary = {
  id: string;
  user_id?: string;
  notebook_id: string;
  section_id: string | null;
  title: string;
  page_type: NotebookPageType;
  status: NotebookPageStatus;
  tags: string[];
  summary: string | null;
  source_type: string | null;
  source_id: string | null;
  template_key: string | null;
  is_pinned: boolean;
  review_due_at: string | null;
  validated_at: string | null;
  version: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string | null;
};

export type NotebookPageDetail = NotebookPageSummary & {
  content: string;
  ink: unknown;
  links?: NotebookLink[];
  assets?: NotebookAsset[];
  versions?: NotebookVersion[];
};

export type NotebookLink = {
  id: string;
  page_id: string;
  target_type: string;
  target_id: string;
  label: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type NotebookAsset = {
  id: string;
  page_id: string | null;
  note_id: string | null;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  caption: string | null;
  created_at: string;
  signed_url?: string | null;
};

export type NotebookVersion = {
  id: string;
  page_id: string;
  version: number;
  title: string;
  content: string;
  page_type: NotebookPageType;
  status: NotebookPageStatus;
  tags: string[];
  summary: string | null;
  created_at: string;
};

export type NotebookLibrary = {
  scope: NotebookScope;
  accountId: string | null;
  books: NotebookBook[];
  sections: NotebookSection[];
  pages: NotebookPageSummary[];
};

export type NotebookTemplate = {
  key: string;
  pageType: NotebookPageType;
  title: { en: string; es: string };
  description: { en: string; es: string };
  content: { en: string; es: string };
};

export const NOTEBOOK_TEMPLATES: NotebookTemplate[] = [
  {
    key: "blank",
    pageType: "general",
    title: { en: "Blank page", es: "Página en blanco" },
    description: { en: "Start without a predefined structure.", es: "Empieza sin una estructura predefinida." },
    content: { en: "", es: "" },
  },
  {
    key: "daily-review",
    pageType: "daily_review",
    title: { en: "Daily execution review", es: "Revisión diaria de ejecución" },
    description: { en: "Separate facts, decisions, behavior, and the next action.", es: "Separa hechos, decisiones, conducta y la próxima acción." },
    content: {
      en: "<h2>Facts</h2><p></p><h2>Decision quality</h2><p></p><h2>Risk and rule adherence</h2><p></p><h2>What repeats</h2><p></p><h2>Next-session action</h2><p></p>",
      es: "<h2>Hechos</h2><p></p><h2>Calidad de decisiones</h2><p></p><h2>Riesgo y cumplimiento de reglas</h2><p></p><h2>Qué se repite</h2><p></p><h2>Acción para la próxima sesión</h2><p></p>",
    },
  },
  {
    key: "lesson",
    pageType: "lesson",
    title: { en: "Trading lesson", es: "Lección de trading" },
    description: { en: "Turn one observation into a testable lesson.", es: "Convierte una observación en una lección verificable." },
    content: {
      en: "<h2>Observation</h2><p></p><h2>Evidence</h2><p></p><h2>Why it matters</h2><p></p><h2>What would disprove it</h2><p></p><h2>Next test</h2><p></p>",
      es: "<h2>Observación</h2><p></p><h2>Evidencia</h2><p></p><h2>Por qué importa</h2><p></p><h2>Qué la refutaría</h2><p></p><h2>Próxima prueba</h2><p></p>",
    },
  },
  {
    key: "setup-playbook",
    pageType: "setup_playbook",
    title: { en: "Setup playbook", es: "Playbook de setup" },
    description: { en: "Define permission, entry, risk, management, and invalidation.", es: "Define permiso, entrada, riesgo, manejo e invalidación." },
    content: {
      en: "<h2>Market context</h2><p></p><h2>Required conditions</h2><p></p><h2>Entry trigger</h2><p></p><h2>Invalidation</h2><p></p><h2>Risk and management</h2><p></p><h2>Evidence and examples</h2><p></p>",
      es: "<h2>Contexto de mercado</h2><p></p><h2>Condiciones requeridas</h2><p></p><h2>Trigger de entrada</h2><p></p><h2>Invalidación</h2><p></p><h2>Riesgo y manejo</h2><p></p><h2>Evidencia y ejemplos</h2><p></p>",
    },
  },
  {
    key: "risk-rule",
    pageType: "risk_rule",
    title: { en: "Risk rule candidate", es: "Regla de riesgo candidata" },
    description: { en: "Document a proposed rule before activating it.", es: "Documenta una regla propuesta antes de activarla." },
    content: {
      en: "<h2>Rule statement</h2><p></p><h2>Problem controlled</h2><p></p><h2>Evidence</h2><p></p><h2>Trigger and response</h2><p></p><h2>Exceptions</h2><p></p><h2>Review date</h2><p></p>",
      es: "<h2>Declaración de la regla</h2><p></p><h2>Problema que controla</h2><p></p><h2>Evidencia</h2><p></p><h2>Trigger y respuesta</h2><p></p><h2>Excepciones</h2><p></p><h2>Fecha de revisión</h2><p></p>",
    },
  },
  {
    key: "research-thesis",
    pageType: "research",
    title: { en: "Research thesis", es: "Tesis de investigación" },
    description: { en: "Keep thesis, evidence, catalysts, and invalidation together.", es: "Mantén tesis, evidencia, catalizadores e invalidación juntos." },
    content: {
      en: "<h2>Question</h2><p></p><h2>Current thesis</h2><p></p><h2>Supporting evidence</h2><p></p><h2>Contradicting evidence</h2><p></p><h2>Catalysts</h2><p></p><h2>Invalidation</h2><p></p>",
      es: "<h2>Pregunta</h2><p></p><h2>Tesis actual</h2><p></p><h2>Evidencia a favor</h2><p></p><h2>Evidencia en contra</h2><p></p><h2>Catalizadores</h2><p></p><h2>Invalidación</h2><p></p>",
    },
  },
  {
    key: "decision-log",
    pageType: "decision",
    title: { en: "Decision record", es: "Registro de decisión" },
    description: { en: "Record what was decided, why, and when to review it.", es: "Registra qué se decidió, por qué y cuándo revisarlo." },
    content: {
      en: "<h2>Decision</h2><p></p><h2>Context</h2><p></p><h2>Options considered</h2><p></p><h2>Evidence used</h2><p></p><h2>Expected result</h2><p></p><h2>Review trigger</h2><p></p>",
      es: "<h2>Decisión</h2><p></p><h2>Contexto</h2><p></p><h2>Opciones consideradas</h2><p></p><h2>Evidencia utilizada</h2><p></p><h2>Resultado esperado</h2><p></p><h2>Trigger de revisión</h2><p></p>",
    },
  },
  {
    key: "funded-program",
    pageType: "funded_program",
    title: { en: "Funded program operating notes", es: "Notas operativas del programa fondeado" },
    description: { en: "Track interpretations and operational implications without replacing official rules.", es: "Registra interpretaciones e implicaciones sin sustituir las reglas oficiales." },
    content: {
      en: "<h2>Program and stage</h2><p></p><h2>Official rule source</h2><p></p><h2>Operational interpretation</h2><p></p><h2>Current constraints</h2><p></p><h2>Questions to verify</h2><p></p>",
      es: "<h2>Programa y etapa</h2><p></p><h2>Fuente oficial de reglas</h2><p></p><h2>Interpretación operativa</h2><p></p><h2>Restricciones actuales</h2><p></p><h2>Preguntas por verificar</h2><p></p>",
    },
  },
];

export function normalizeNotebookScope(value: unknown): NotebookScope {
  return value === "business" ? "business" : "account";
}

export function normalizeNotebookPageType(value: unknown): NotebookPageType {
  return NOTEBOOK_PAGE_TYPES.includes(value as NotebookPageType)
    ? (value as NotebookPageType)
    : "general";
}

export function normalizeNotebookPageStatus(value: unknown): NotebookPageStatus {
  return NOTEBOOK_PAGE_STATUSES.includes(value as NotebookPageStatus)
    ? (value as NotebookPageStatus)
    : "draft";
}

export function normalizeNotebookTags(value: unknown): string[] {
  const rows = Array.isArray(value) ? value : String(value ?? "").split(",");
  return Array.from(
    new Set(rows.map((tag) => String(tag).trim().toLowerCase()).filter(Boolean))
  ).slice(0, 20);
}

export function stripNotebookHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

export function notebookTemplateByKey(key: unknown) {
  return NOTEBOOK_TEMPLATES.find((template) => template.key === key) ?? NOTEBOOK_TEMPLATES[0];
}
