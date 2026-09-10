import { NextRequest, NextResponse } from "next/server";

import { getAuthUser } from "@/lib/authServer";
import {
  normalizeNotebookPageStatus,
  normalizeNotebookPageType,
  normalizeNotebookScope,
  normalizeNotebookTags,
  notebookTemplateByKey,
} from "@/lib/notebookKnowledge";
import { requireAdvancedPlan } from "@/lib/serverFeatureAccess";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";

export const runtime = "nodejs";

const BOOKS = "ntj_notebook_books";
const SECTIONS = "ntj_notebook_sections";
const PAGES = "ntj_notebook_pages";
const DAILY = "ntj_notebook_free_notes";

function text(value: unknown, max: number) {
  return String(value ?? "").trim().slice(0, max);
}

function nullableText(value: unknown, max: number) {
  const clean = text(value, max);
  return clean || null;
}

function dateOnly(value: unknown) {
  const clean = text(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(clean) ? clean : "";
}

function jsonBytes(value: unknown) {
  if (value == null) return 0;
  try {
    return Buffer.byteLength(JSON.stringify(value), "utf8");
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function missingExtendedSchema(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    /column .* does not exist|schema cache/i.test(error.message ?? "")
  );
}

function fail(message: string, status = 400, code?: string) {
  return NextResponse.json({ error: message, code }, { status });
}

async function authorize(req: Request) {
  const auth = await getAuthUser(req);
  if (!auth) return { response: fail("Unauthorized", 401) } as const;
  const gate = await requireAdvancedPlan(auth.userId);
  if (gate) return { response: gate } as const;
  return { userId: auth.userId } as const;
}

async function ownsAccount(userId: string, accountId: string | null) {
  if (!accountId) return false;
  const { data } = await supabaseAdmin
    .from("trading_accounts")
    .select("id")
    .eq("id", accountId)
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(data?.id);
}

async function getOwnedBook(userId: string, bookId: string) {
  const { data } = await supabaseAdmin
    .from(BOOKS)
    .select("*")
    .eq("id", bookId)
    .eq("user_id", userId)
    .maybeSingle();
  return data as Record<string, unknown> | null;
}

async function getOwnedPage(userId: string, pageId: string) {
  const { data } = await supabaseAdmin
    .from(PAGES)
    .select("*")
    .eq("id", pageId)
    .eq("user_id", userId)
    .maybeSingle();
  return data as Record<string, unknown> | null;
}

async function validSection(userId: string, notebookId: string, sectionId: string | null) {
  if (!sectionId) return true;
  const { data } = await supabaseAdmin
    .from(SECTIONS)
    .select("id")
    .eq("id", sectionId)
    .eq("notebook_id", notebookId)
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(data?.id);
}

function normalizeBook(row: Record<string, unknown>): Record<string, unknown> & { id: string; scope: "business" | "account" } {
  return {
    ...row,
    id: String(row.id ?? ""),
    scope: row.scope === "business" || !row.account_id ? "business" : "account",
    description: row.description ?? null,
    sort_order: Number(row.sort_order ?? 0),
    archived_at: row.archived_at ?? null,
    deleted_at: row.deleted_at ?? null,
  };
}

function normalizePage(row: Record<string, unknown>): Record<string, unknown> & { id: string } {
  return {
    ...row,
    id: String(row.id ?? ""),
    page_type: normalizeNotebookPageType(row.page_type),
    status: normalizeNotebookPageStatus(row.status),
    tags: normalizeNotebookTags(row.tags),
    summary: row.summary ?? null,
    source_type: row.source_type ?? null,
    source_id: row.source_id ?? null,
    template_key: row.template_key ?? null,
    is_pinned: Boolean(row.is_pinned),
    review_due_at: row.review_due_at ?? null,
    validated_at: row.validated_at ?? null,
    version: Number(row.version ?? 1),
    deleted_at: row.deleted_at ?? null,
  };
}

async function readLibrary(userId: string, scopeValue: string | null, accountId: string | null) {
  const scope = normalizeNotebookScope(scopeValue);
  if (scope === "account" && !(await ownsAccount(userId, accountId))) {
    return { error: fail("Select a valid trading account.", 400, "account_required") };
  }

  let bookQuery = supabaseAdmin
    .from(BOOKS)
    .select("id,user_id,account_id,scope,name,description,sort_order,archived_at,deleted_at,created_at,updated_at")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  bookQuery = scope === "business"
    ? bookQuery.eq("scope", "business").is("account_id", null)
    : bookQuery.eq("scope", "account").eq("account_id", accountId as string);

  const initialBooks = await bookQuery;
  let books = initialBooks.data as Record<string, unknown>[] | null;
  let bookError = initialBooks.error;
  let legacy = false;
  if (missingExtendedSchema(bookError)) {
    legacy = true;
    let fallback = supabaseAdmin
      .from(BOOKS)
      .select("id,user_id,account_id,name,created_at,updated_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });
    fallback = scope === "business"
      ? fallback.is("account_id", null)
      : fallback.eq("account_id", accountId as string);
    const result = await fallback;
    books = result.data as Record<string, unknown>[] | null;
    bookError = result.error;
  }
  if (bookError) throw bookError;

  const normalizedBooks = ((books ?? []) as Record<string, unknown>[]).map(normalizeBook);
  const bookIds = normalizedBooks.map((book) => String(book.id));
  if (bookIds.length === 0) {
    return { library: { scope, accountId: scope === "account" ? accountId : null, books: [], sections: [], pages: [], legacy } };
  }

  const [sectionResult, pageResult] = await Promise.all([
    supabaseAdmin
      .from(SECTIONS)
      .select("id,user_id,notebook_id,name,created_at,updated_at")
      .eq("user_id", userId)
      .in("notebook_id", bookIds)
      .order("created_at", { ascending: true }),
    legacy
      ? supabaseAdmin
          .from(PAGES)
          .select("id,user_id,notebook_id,section_id,title,created_at,updated_at")
          .eq("user_id", userId)
          .in("notebook_id", bookIds)
          .order("updated_at", { ascending: false })
          .limit(500)
      : supabaseAdmin
          .from(PAGES)
          .select("id,user_id,notebook_id,section_id,title,page_type,status,tags,summary,source_type,source_id,template_key,is_pinned,review_due_at,validated_at,version,deleted_at,created_at,updated_at")
          .eq("user_id", userId)
          .in("notebook_id", bookIds)
          .is("deleted_at", null)
          .order("is_pinned", { ascending: false })
          .order("updated_at", { ascending: false })
          .limit(500),
  ]);
  if (sectionResult.error) throw sectionResult.error;
  if (pageResult.error) throw pageResult.error;

  return {
    library: {
      scope,
      accountId: scope === "account" ? accountId : null,
      books: normalizedBooks,
      sections: sectionResult.data ?? [],
      pages: ((pageResult.data ?? []) as Record<string, unknown>[]).map(normalizePage),
      legacy,
    },
  };
}

async function readPage(userId: string, pageId: string) {
  const initialPage = await supabaseAdmin
    .from(PAGES)
    .select("id,user_id,notebook_id,section_id,title,content,ink,page_type,status,tags,summary,source_type,source_id,template_key,is_pinned,review_due_at,validated_at,version,deleted_at,created_at,updated_at")
    .eq("id", pageId)
    .eq("user_id", userId)
    .maybeSingle();
  let data = initialPage.data as Record<string, unknown> | null;
  let error = initialPage.error;
  let legacy = false;
  if (missingExtendedSchema(error)) {
    legacy = true;
    const fallback = await supabaseAdmin
      .from(PAGES)
      .select("id,user_id,notebook_id,section_id,title,content,ink,created_at,updated_at")
      .eq("id", pageId)
      .eq("user_id", userId)
      .maybeSingle();
    data = fallback.data as Record<string, unknown> | null;
    error = fallback.error;
  }
  if (error) throw error;
  if (!data) return { error: fail("Page not found.", 404) };

  let links: unknown[] = [];
  let assets: unknown[] = [];
  let versions: unknown[] = [];
  if (!legacy) {
    const [linkResult, assetResult, versionResult] = await Promise.all([
      supabaseAdmin.from("ntj_notebook_links").select("id,page_id,target_type,target_id,label,metadata,created_at").eq("page_id", pageId).eq("user_id", userId),
      supabaseAdmin.from("ntj_notebook_assets").select("id,page_id,note_id,storage_path,file_name,mime_type,size_bytes,caption,created_at").eq("page_id", pageId).eq("user_id", userId),
      supabaseAdmin.from("ntj_notebook_page_versions").select("id,page_id,version,title,content,page_type,status,tags,summary,created_at").eq("page_id", pageId).eq("user_id", userId).order("version", { ascending: false }).limit(20),
    ]);
    if (linkResult.error) throw linkResult.error;
    if (assetResult.error) throw assetResult.error;
    if (versionResult.error) throw versionResult.error;
    links = linkResult.data ?? [];
    versions = versionResult.data ?? [];
    assets = await Promise.all((assetResult.data ?? []).map(async (asset) => {
      const signed = await supabaseAdmin.storage.from("notebook-assets").createSignedUrl(asset.storage_path, 3600);
      return { ...asset, signed_url: signed.data?.signedUrl ?? null };
    }));
  }
  return { page: { ...normalizePage(data as Record<string, unknown>), links, assets, versions }, legacy };
}

function parseJournalNotes(raw: unknown) {
  if (raw && typeof raw === "object") return raw as Record<string, unknown>;
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

async function readDaily(userId: string, accountId: string | null, entryDate: string) {
  if (!entryDate) return { error: fail("A valid date is required.") };
  if (!(await ownsAccount(userId, accountId))) return { error: fail("Select a valid trading account.", 400, "account_required") };

  const [noteResult, journalResult] = await Promise.all([
    supabaseAdmin.from(DAILY).select("*").eq("user_id", userId).eq("account_id", accountId as string).eq("entry_date", entryDate).maybeSingle(),
    supabaseAdmin.from("journal_entries").select("*").eq("user_id", userId).eq("account_id", accountId as string).eq("date", entryDate).order("created_at", { ascending: true }).limit(250),
  ]);
  if (noteResult.error) throw noteResult.error;
  if (journalResult.error) throw journalResult.error;

  const journal = (journalResult.data ?? []) as Record<string, unknown>[];
  const parsed = journal.map((row) => parseJournalNotes(row.notes));
  const hasBlock = (key: string) => parsed.some((notes) => Boolean(String(notes?.[key] ?? "").trim()));
  const pnl = journal.reduce((sum, row) => sum + (Number(row.pnl) || 0), 0);
  const respected = journal.filter((row) => row.respected_plan === true).length;
  const violated = journal.filter((row) => row.respected_plan === false).length;

  return {
    daily: {
      note: noteResult.data ? { ...noteResult.data, version: Number((noteResult.data as Record<string, unknown>).version ?? 1) } : null,
      facts: {
        executionRecords: journal.length,
        pnl,
        outcome: pnl > 0 ? "profit" : pnl < 0 ? "loss" : journal.length ? "flat" : "no_activity",
        planRespected: respected,
        planViolated: violated,
        noteBlocks: {
          premarket: hasBlock("premarket"),
          live: hasBlock("live"),
          post: hasBlock("post"),
        },
        instruments: Array.from(new Set(journal.map((row) => text(row.instrument, 40)).filter(Boolean))),
      },
    },
  };
}

async function readTrash(userId: string, scopeValue: string | null, accountId: string | null) {
  const scope = normalizeNotebookScope(scopeValue);
  let bookQuery = supabaseAdmin
    .from(BOOKS)
    .select("id,user_id,account_id,scope,name,description,sort_order,archived_at,deleted_at,created_at,updated_at")
    .eq("user_id", userId);
  bookQuery = scope === "business"
    ? bookQuery.eq("scope", "business").is("account_id", null)
    : bookQuery.eq("scope", "account").eq("account_id", accountId ?? "");
  const booksResult = await bookQuery;
  if (missingExtendedSchema(booksResult.error)) {
    return { trash: { books: [], pages: [], available: false } };
  }
  if (booksResult.error) throw booksResult.error;
  const allBooks = ((booksResult.data ?? []) as Record<string, unknown>[]).map(normalizeBook);
  const bookIds = allBooks.map((book) => String(book.id));
  const pageResult = bookIds.length
    ? await supabaseAdmin
        .from(PAGES)
        .select("id,user_id,notebook_id,section_id,title,page_type,status,tags,summary,source_type,source_id,template_key,is_pinned,review_due_at,validated_at,version,deleted_at,created_at,updated_at")
        .eq("user_id", userId)
        .in("notebook_id", bookIds)
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false })
    : { data: [], error: null };
  if (pageResult.error) throw pageResult.error;
  return {
    trash: {
      books: allBooks.filter((book) => book.deleted_at),
      pages: ((pageResult.data ?? []) as Record<string, unknown>[]).map(normalizePage),
      available: true,
    },
  };
}

export async function GET(req: NextRequest) {
  try {
    const auth = await authorize(req);
    if ("response" in auth) return auth.response;
    const params = req.nextUrl.searchParams;
    const view = params.get("view") || "library";
    if (view === "trash") {
      const result = await readTrash(auth.userId, params.get("scope"), params.get("accountId"));
      return NextResponse.json(result);
    }
    if (view === "page") {
      const pageId = text(params.get("pageId"), 80);
      if (!pageId) return fail("pageId is required.");
      const result = await readPage(auth.userId, pageId);
      return "error" in result ? result.error : NextResponse.json(result);
    }
    if (view === "daily") {
      const result = await readDaily(auth.userId, nullableText(params.get("accountId"), 80), dateOnly(params.get("date")));
      return "error" in result ? result.error : NextResponse.json(result);
    }
    const result = await readLibrary(auth.userId, params.get("scope"), nullableText(params.get("accountId"), 80));
    return "error" in result ? result.error : NextResponse.json(result);
  } catch (error) {
    console.error("[notebook/workspace] GET", error);
    return fail(error instanceof Error ? error.message : "Unable to load the notebook.", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await authorize(req);
    if ("response" in auth) return auth.response;
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const action = text(body.action, 40);
    const userId = auth.userId;

    if (action === "create_book") {
      const scope = normalizeNotebookScope(body.scope);
      const accountId = scope === "account" ? nullableText(body.accountId, 80) : null;
      if (scope === "account" && !(await ownsAccount(userId, accountId))) return fail("Select a valid trading account.");
      const name = text(body.name, 100) || (scope === "business" ? "Business Knowledge" : "Account Notebook");
      const extended = { user_id: userId, account_id: accountId, scope, name, description: nullableText(body.description, 500) };
      let result = await supabaseAdmin.from(BOOKS).insert(extended).select("*").single();
      if (missingExtendedSchema(result.error)) {
        result = await supabaseAdmin.from(BOOKS).insert({ user_id: userId, account_id: accountId, name }).select("*").single();
      }
      if (result.error) throw result.error;
      return NextResponse.json({ book: normalizeBook(result.data as Record<string, unknown>) });
    }

    if (action === "update_book") {
      const bookId = text(body.bookId, 80);
      if (!(await getOwnedBook(userId, bookId))) return fail("Notebook not found.", 404);
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (body.name !== undefined) patch.name = text(body.name, 100) || "Untitled notebook";
      if (body.description !== undefined) patch.description = nullableText(body.description, 500);
      if (body.archived !== undefined) patch.archived_at = body.archived ? new Date().toISOString() : null;
      let result = await supabaseAdmin.from(BOOKS).update(patch).eq("id", bookId).eq("user_id", userId).select("*").single();
      if (missingExtendedSchema(result.error)) {
        delete patch.description;
        delete patch.archived_at;
        result = await supabaseAdmin.from(BOOKS).update(patch).eq("id", bookId).eq("user_id", userId).select("*").single();
      }
      if (result.error) throw result.error;
      return NextResponse.json({ book: normalizeBook(result.data as Record<string, unknown>) });
    }

    if (action === "trash_book" || action === "restore_book") {
      const bookId = text(body.bookId, 80);
      if (!(await getOwnedBook(userId, bookId))) return fail("Notebook not found.", 404);
      const result = await supabaseAdmin.from(BOOKS).update({ deleted_at: action === "trash_book" ? new Date().toISOString() : null }).eq("id", bookId).eq("user_id", userId);
      if (result.error) throw result.error;
      return NextResponse.json({ ok: true });
    }

    if (action === "delete_book_forever") {
      const bookId = text(body.bookId, 80);
      const book = await getOwnedBook(userId, bookId);
      if (!book || !book.deleted_at) return fail("Only notebooks in trash can be permanently deleted.", 409);
      const result = await supabaseAdmin.from(BOOKS).delete().eq("id", bookId).eq("user_id", userId);
      if (result.error) throw result.error;
      return NextResponse.json({ ok: true });
    }

    if (action === "create_section") {
      const notebookId = text(body.notebookId, 80);
      if (!(await getOwnedBook(userId, notebookId))) return fail("Notebook not found.", 404);
      const result = await supabaseAdmin.from(SECTIONS).insert({ user_id: userId, notebook_id: notebookId, name: text(body.name, 100) || "New section" }).select("*").single();
      if (result.error) throw result.error;
      return NextResponse.json({ section: result.data });
    }

    if (action === "update_section") {
      const sectionId = text(body.sectionId, 80);
      const result = await supabaseAdmin.from(SECTIONS).update({ name: text(body.name, 100) || "Untitled section", updated_at: new Date().toISOString() }).eq("id", sectionId).eq("user_id", userId).select("*").maybeSingle();
      if (result.error) throw result.error;
      if (!result.data) return fail("Section not found.", 404);
      return NextResponse.json({ section: result.data });
    }

    if (action === "delete_section") {
      const sectionId = text(body.sectionId, 80);
      const pageMove = await supabaseAdmin.from(PAGES).update({ section_id: null }).eq("section_id", sectionId).eq("user_id", userId);
      if (pageMove.error) throw pageMove.error;
      const result = await supabaseAdmin.from(SECTIONS).delete().eq("id", sectionId).eq("user_id", userId);
      if (result.error) throw result.error;
      return NextResponse.json({ ok: true });
    }

    if (action === "create_page") {
      const notebookId = text(body.notebookId, 80);
      if (!(await getOwnedBook(userId, notebookId))) return fail("Notebook not found.", 404);
      const template = notebookTemplateByKey(body.templateKey);
      const sectionId = nullableText(body.sectionId, 80);
      if (!(await validSection(userId, notebookId, sectionId))) return fail("Section does not belong to this notebook.");
      const language = body.language === "es" ? "es" : "en";
      const templateKey = text(body.templateKey, 60) || template.key;
      const pageType = normalizeNotebookPageType(body.pageType ?? template.pageType);
      const titleValue = text(body.title, 180) || template.title[language];
      const contentValue = body.content === undefined ? template.content[language] : String(body.content ?? "").slice(0, 1_000_000);
      const row = {
        user_id: userId,
        notebook_id: notebookId,
        section_id: sectionId,
        title: titleValue,
        content: contentValue,
        page_type: pageType,
        status: normalizeNotebookPageStatus(body.status),
        tags: normalizeNotebookTags(body.tags),
        template_key: templateKey,
        source_type: nullableText(body.sourceType, 40),
        source_id: nullableText(body.sourceId, 180),
        review_due_at: nullableText(body.reviewDueAt, 40),
      };
      let result = await supabaseAdmin.from(PAGES).insert(row).select("*").single();
      let legacyInsert = false;
      if (missingExtendedSchema(result.error)) {
        legacyInsert = true;
        result = await supabaseAdmin.from(PAGES).insert({ user_id: userId, notebook_id: notebookId, section_id: row.section_id, title: row.title, content: row.content }).select("*").single();
      }
      if (result.error) throw result.error;
      if (!legacyInsert && row.source_type && row.source_id) {
        const targetType = row.source_type === "back_study" ? "back_study" : row.source_type;
        const supported = ["journal_day", "trade", "back_study", "business_plan", "ai_coaching"];
        if (supported.includes(targetType)) {
          const linkResult = await supabaseAdmin.from("ntj_notebook_links").upsert({
            user_id: userId,
            page_id: result.data.id,
            target_type: targetType,
            target_id: row.source_id,
            label: "Source evidence",
          }, { onConflict: "page_id,target_type,target_id" });
          if (linkResult.error) console.warn("[notebook/workspace] source link", linkResult.error.message);
        }
      }
      return NextResponse.json({ page: normalizePage(result.data as Record<string, unknown>) });
    }

    if (action === "update_page") {
      const pageId = text(body.pageId, 80);
      const current = await getOwnedPage(userId, pageId);
      if (!current) return fail("Page not found.", 404);
      const patch: Record<string, unknown> = {};
      if (body.title !== undefined) patch.title = text(body.title, 180) || "Untitled page";
      if (body.content !== undefined) patch.content = String(body.content ?? "").slice(0, 1_000_000);
      if (body.ink !== undefined) {
        if (jsonBytes(body.ink) > 5 * 1024 * 1024) return fail("Ink content is limited to 5 MB per page.", 413);
        patch.ink = body.ink;
      }
      if (body.sectionId !== undefined) {
        const sectionId = nullableText(body.sectionId, 80);
        if (!(await validSection(userId, String(current.notebook_id ?? ""), sectionId))) return fail("Section does not belong to this notebook.");
        patch.section_id = sectionId;
      }
      if (body.pageType !== undefined) patch.page_type = normalizeNotebookPageType(body.pageType);
      if (body.status !== undefined) {
        const nextStatus = normalizeNotebookPageStatus(body.status);
        if (nextStatus === "active" && current.status !== "active") {
          return fail("Use the promotion action to activate validated knowledge.", 409, "promotion_required");
        }
        patch.status = nextStatus;
      }
      if (body.tags !== undefined) patch.tags = normalizeNotebookTags(body.tags);
      if (body.isPinned !== undefined) patch.is_pinned = Boolean(body.isPinned);
      if (body.reviewDueAt !== undefined) patch.review_due_at = nullableText(body.reviewDueAt, 40);
      patch.updated_at = new Date().toISOString();
      let query = supabaseAdmin.from(PAGES).update(patch).eq("id", pageId).eq("user_id", userId);
      const expectedVersion = Number(body.expectedVersion);
      if (Number.isFinite(expectedVersion) && current.version !== undefined) query = query.eq("version", expectedVersion);
      let result = await query.select("*").maybeSingle();
      if (missingExtendedSchema(result.error)) {
        const legacyPatch = Object.fromEntries(Object.entries(patch).filter(([key]) => ["title", "content", "ink", "section_id", "updated_at"].includes(key)));
        result = await supabaseAdmin.from(PAGES).update(legacyPatch).eq("id", pageId).eq("user_id", userId).select("*").maybeSingle();
      }
      if (result.error) throw result.error;
      if (!result.data) return fail("This page changed in another session. Reload it before saving again.", 409, "version_conflict");
      return NextResponse.json({ page: normalizePage(result.data as Record<string, unknown>) });
    }

    if (action === "trash_page" || action === "restore_page") {
      const pageId = text(body.pageId, 80);
      if (!(await getOwnedPage(userId, pageId))) return fail("Page not found.", 404);
      const result = await supabaseAdmin.from(PAGES).update({ deleted_at: action === "trash_page" ? new Date().toISOString() : null }).eq("id", pageId).eq("user_id", userId);
      if (result.error) throw result.error;
      return NextResponse.json({ ok: true });
    }

    if (action === "delete_page_forever") {
      const pageId = text(body.pageId, 80);
      const page = await getOwnedPage(userId, pageId);
      if (!page || !page.deleted_at) return fail("Only pages in trash can be permanently deleted.", 409);
      const result = await supabaseAdmin.from(PAGES).delete().eq("id", pageId).eq("user_id", userId);
      if (result.error) throw result.error;
      return NextResponse.json({ ok: true });
    }

    if (action === "restore_version") {
      const pageId = text(body.pageId, 80);
      const versionId = text(body.versionId, 80);
      if (!(await getOwnedPage(userId, pageId))) return fail("Page not found.", 404);
      const versionResult = await supabaseAdmin.from("ntj_notebook_page_versions").select("*").eq("id", versionId).eq("page_id", pageId).eq("user_id", userId).maybeSingle();
      if (versionResult.error) throw versionResult.error;
      if (!versionResult.data) return fail("Version not found.", 404);
      const version = versionResult.data;
      const result = await supabaseAdmin.from(PAGES).update({ title: version.title, content: version.content, ink: version.ink, page_type: version.page_type, status: version.status, tags: version.tags }).eq("id", pageId).eq("user_id", userId).select("*").single();
      if (result.error) throw result.error;
      return NextResponse.json({ page: normalizePage(result.data as Record<string, unknown>) });
    }

    if (action === "promote_page") {
      const pageId = text(body.pageId, 80);
      const current = await getOwnedPage(userId, pageId);
      if (!current) return fail("Page not found.", 404);
      if (current.status !== "validated" && current.status !== "active") {
        return fail("Validate this knowledge before promoting it into an operating control.", 409, "validation_required");
      }
      const pageType = normalizeNotebookPageType(current.page_type);
      const targetHref = pageType === "risk_rule" ? "/rules-alarms" : "/growth-plan";
      const result = await supabaseAdmin.from(PAGES).update({ status: "active" }).eq("id", pageId).eq("user_id", userId).select("*").single();
      if (result.error) throw result.error;
      const linked = await supabaseAdmin.from("ntj_notebook_links").upsert({
        user_id: userId,
        page_id: pageId,
        target_type: "business_plan",
        target_id: targetHref,
        label: pageType === "risk_rule" ? "Business protection system" : "Trading Business Plan",
      }, { onConflict: "page_id,target_type,target_id" });
      if (linked.error) throw linked.error;
      return NextResponse.json({ page: normalizePage(result.data as Record<string, unknown>), targetHref });
    }

    if (action === "upsert_daily") {
      const accountId = nullableText(body.accountId, 80);
      const entryDate = dateOnly(body.date);
      if (!(await ownsAccount(userId, accountId))) return fail("Select a valid trading account.");
      if (!entryDate) return fail("A valid date is required.");
      const content = String(body.content ?? "").slice(0, 1_000_000);
      if (jsonBytes(body.ink) > 5 * 1024 * 1024) return fail("Ink content is limited to 5 MB per review.", 413);
      let current: any = await supabaseAdmin.from(DAILY).select("id,version").eq("user_id", userId).eq("account_id", accountId as string).eq("entry_date", entryDate).maybeSingle();
      let legacyDaily = false;
      if (missingExtendedSchema(current.error)) {
        legacyDaily = true;
        current = await supabaseAdmin.from(DAILY).select("id").eq("user_id", userId).eq("account_id", accountId as string).eq("entry_date", entryDate).maybeSingle();
      }
      if (current.error) throw current.error;
      let result;
      if (current.data?.id) {
        let query = supabaseAdmin.from(DAILY).update({ content, ink: body.ink ?? null, updated_at: new Date().toISOString() }).eq("id", current.data.id).eq("user_id", userId);
        const expectedVersion = Number(body.expectedVersion);
        if (!legacyDaily && Number.isFinite(expectedVersion) && current.data.version !== undefined) query = query.eq("version", expectedVersion);
        result = await query.select("*").maybeSingle();
        if (!result.data && !result.error) return fail("This daily review changed in another session. Reload it before saving again.", 409, "version_conflict");
      } else {
        result = await supabaseAdmin.from(DAILY).insert({ user_id: userId, account_id: accountId, entry_date: entryDate, content, ink: body.ink ?? null }).select("*").single();
      }
      if (result.error) throw result.error;
      return NextResponse.json({ note: result.data });
    }

    return fail("Unsupported notebook action.", 400);
  } catch (error) {
    console.error("[notebook/workspace] POST", error);
    return fail(error instanceof Error ? error.message : "Unable to update the notebook.", 500);
  }
}
