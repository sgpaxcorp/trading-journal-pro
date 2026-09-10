import "server-only";

import { normalizeNotebookScope, stripNotebookHtml, type NotebookScope } from "@/lib/notebookKnowledge";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";

export type NotebookCitation = {
  id: string;
  sourceType: "page" | "daily_review" | "journal";
  label: string;
  excerpt: string;
  href: string;
  date?: string | null;
};

function clip(value: unknown, max = 420) {
  const clean = stripNotebookHtml(value);
  return clean.length <= max ? clean : `${clean.slice(0, max).trim()}...`;
}

function isMissingColumn(error: { code?: string; message?: string } | null) {
  return Boolean(error && (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    /column .* does not exist|schema cache/i.test(error.message ?? "")
  ));
}

function safeSearchTerm(value: string) {
  return value.replace(/[,%()'":]/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);
}

export async function resolveNotebookBookIds(params: {
  userId: string;
  scope?: unknown;
  accountId?: string | null;
}) {
  const scope = normalizeNotebookScope(params.scope);
  let query = supabaseAdmin
    .from("ntj_notebook_books")
    .select("id")
    .eq("user_id", params.userId)
    .eq("scope", scope)
    .is("deleted_at", null);
  query = scope === "business"
    ? query.is("account_id", null)
    : query.eq("account_id", params.accountId ?? "");
  let result = await query;
  if (isMissingColumn(result.error)) {
    let fallback = supabaseAdmin
      .from("ntj_notebook_books")
      .select("id")
      .eq("user_id", params.userId);
    fallback = scope === "business"
      ? fallback.is("account_id", null)
      : fallback.eq("account_id", params.accountId ?? "");
    result = await fallback;
  }
  if (result.error) throw result.error;
  return {
    scope,
    bookIds: (result.data ?? []).map((row) => row.id),
  };
}

async function searchPages(params: {
  userId: string;
  bookIds: string[];
  query: string;
  limit: number;
}) {
  if (params.bookIds.length === 0) return [];
  const term = safeSearchTerm(params.query);
  const extendedColumns = "id,notebook_id,section_id,title,content,page_type,status,tags,source_type,source_id,updated_at";
  let result = term
    ? await supabaseAdmin
        .from("ntj_notebook_pages")
        .select(extendedColumns)
        .eq("user_id", params.userId)
        .in("notebook_id", params.bookIds)
        .is("deleted_at", null)
        .textSearch("search_document", term, { config: "simple", type: "websearch" })
        .order("updated_at", { ascending: false })
        .limit(params.limit)
    : await supabaseAdmin
        .from("ntj_notebook_pages")
        .select(extendedColumns)
        .eq("user_id", params.userId)
        .in("notebook_id", params.bookIds)
        .is("deleted_at", null)
        .order("is_pinned", { ascending: false })
        .order("updated_at", { ascending: false })
        .limit(params.limit);

  if (isMissingColumn(result.error)) {
    let fallback = supabaseAdmin
      .from("ntj_notebook_pages")
      .select("id,notebook_id,section_id,title,content,updated_at")
      .eq("user_id", params.userId)
      .in("notebook_id", params.bookIds)
      .order("updated_at", { ascending: false })
      .limit(params.limit);
    if (term) fallback = fallback.or(`title.ilike.%${term}%,content.ilike.%${term}%`);
    const legacy = await fallback;
    if (legacy.error) throw legacy.error;
    return legacy.data ?? [];
  }
  if (result.error) throw result.error;

  if (term && (result.data?.length ?? 0) === 0) {
    const fallback = await supabaseAdmin
      .from("ntj_notebook_pages")
      .select(extendedColumns)
      .eq("user_id", params.userId)
      .in("notebook_id", params.bookIds)
      .is("deleted_at", null)
      .or(`title.ilike.%${term}%,content.ilike.%${term}%`)
      .order("updated_at", { ascending: false })
      .limit(params.limit);
    if (!fallback.error) return fallback.data ?? [];
  }
  return result.data ?? [];
}

async function searchDaily(params: {
  userId: string;
  accountId: string;
  query: string;
  limit: number;
}) {
  let query = supabaseAdmin
    .from("ntj_notebook_free_notes")
    .select("id,entry_date,content,updated_at")
    .eq("user_id", params.userId)
    .eq("account_id", params.accountId)
    .order("entry_date", { ascending: false })
    .limit(params.limit);
  const term = safeSearchTerm(params.query);
  if (term) query = query.ilike("content", `%${term}%`);
  const result = await query;
  if (result.error) throw result.error;
  return result.data ?? [];
}

export async function searchNotebookKnowledge(params: {
  userId: string;
  scope?: unknown;
  accountId?: string | null;
  query?: string;
  limit?: number;
}): Promise<{ scope: NotebookScope; citations: NotebookCitation[] }> {
  const limit = Math.min(30, Math.max(1, params.limit ?? 12));
  const query = String(params.query ?? "").trim();
  const { scope, bookIds } = await resolveNotebookBookIds(params);
  const [pages, daily] = await Promise.all([
    searchPages({ userId: params.userId, bookIds, query, limit }),
    scope === "account" && params.accountId
      ? searchDaily({ userId: params.userId, accountId: params.accountId, query, limit: Math.min(8, limit) })
      : Promise.resolve([]),
  ]);

  const citations: NotebookCitation[] = [];
  for (const page of pages) {
    citations.push({
      id: `page:${page.id}`,
      sourceType: "page",
      label: String(page.title || "Untitled page"),
      excerpt: clip(page.content),
      href: `/notebook?page=${page.id}`,
      date: page.updated_at ?? null,
    });
  }
  for (const note of daily) {
    citations.push({
      id: `daily:${note.id}`,
      sourceType: "daily_review",
      label: `Daily review · ${note.entry_date}`,
      excerpt: clip(note.content),
      href: `/notebook?view=daily&date=${note.entry_date}`,
      date: note.entry_date,
    });
  }
  return { scope, citations: citations.slice(0, limit) };
}

export async function getNotebookAiEvidence(params: {
  userId: string;
  scope?: unknown;
  accountId?: string | null;
  question: string;
  selectedPageId?: string | null;
  selectedDate?: string | null;
}) {
  const result = await searchNotebookKnowledge({
    userId: params.userId,
    scope: params.scope,
    accountId: params.accountId,
    query: params.question,
    limit: 14,
  });
  const byId = new Map(result.citations.map((citation) => [citation.id, citation]));
  if (byId.size < 4) {
    const recent = await searchNotebookKnowledge({
      userId: params.userId,
      scope: params.scope,
      accountId: params.accountId,
      query: "",
      limit: 10,
    });
    for (const citation of recent.citations) byId.set(citation.id, citation);
  }

  if (params.selectedPageId) {
    const page = await supabaseAdmin
      .from("ntj_notebook_pages")
      .select("id,title,content,updated_at")
      .eq("id", params.selectedPageId)
      .eq("user_id", params.userId)
      .maybeSingle();
    if (!page.error && page.data) {
      byId.set(`page:${page.data.id}`, {
        id: `page:${page.data.id}`,
        sourceType: "page",
        label: page.data.title || "Selected page",
        excerpt: clip(page.data.content, 1200),
        href: `/notebook?page=${page.data.id}`,
        date: page.data.updated_at,
      });
    }
  }

  if (result.scope === "account" && params.accountId) {
    const from = new Date();
    from.setUTCDate(from.getUTCDate() - 30);
    let journalQuery = supabaseAdmin
      .from("journal_entries")
      .select("date,pnl,instrument,direction,notes,emotion,tags,respected_plan")
      .eq("user_id", params.userId)
      .eq("account_id", params.accountId)
      .gte("date", from.toISOString().slice(0, 10))
      .order("date", { ascending: false })
      .limit(80);
    if (params.selectedDate) journalQuery = journalQuery.eq("date", params.selectedDate);
    const journal = await journalQuery;
    if (!journal.error && journal.data?.length) {
      const pnl = journal.data.reduce((sum, row) => sum + (Number(row.pnl) || 0), 0);
      const respected = journal.data.filter((row) => row.respected_plan === true).length;
      const violated = journal.data.filter((row) => row.respected_plan === false).length;
      const dates = journal.data.map((row) => String(row.date)).sort();
      const noteExcerpts = journal.data.map((row) => clip(row.notes, 240)).filter(Boolean).slice(0, 8);
      const dateLabel = params.selectedDate || `${dates[0]} to ${dates[dates.length - 1]}`;
      byId.set(`journal:${params.accountId}:${dateLabel}`, {
        id: `journal:${params.accountId}:${dateLabel}`,
        sourceType: "journal",
        label: `Execution evidence · ${dateLabel}`,
        excerpt: [
          `${journal.data.length} execution records; net recorded P/L ${pnl.toFixed(2)}; plan respected ${respected}; plan violated ${violated}.`,
          ...noteExcerpts,
        ].join(" "),
        href: params.selectedDate ? `/journal/${params.selectedDate}` : "/journal",
        date: params.selectedDate || dates[dates.length - 1],
      });
    }
  }

  return { scope: result.scope, citations: Array.from(byId.values()).slice(0, 18) };
}
