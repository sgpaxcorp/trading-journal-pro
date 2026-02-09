import { supabaseBrowser } from "@/lib/supaBaseClient";

export type NotebookBookRow = {
  id: string;
  user_id: string;
  account_id: string | null;
  name: string;
  created_at: string;
  updated_at: string | null;
};

export type NotebookSectionRow = {
  id: string;
  user_id: string;
  notebook_id: string;
  name: string;
  created_at: string;
  updated_at: string | null;
};

export type NotebookPageRow = {
  id: string;
  user_id: string;
  notebook_id: string;
  section_id: string | null;
  title: string;
  content: string;
  created_at: string;
  updated_at: string | null;
};

export type NotebookStorage = {
  notebooks: NotebookBookRow[];
  sections: NotebookSectionRow[];
  pages: NotebookPageRow[];
};

const BOOKS_TABLE = "ntj_notebook_books";
const SECTIONS_TABLE = "ntj_notebook_sections";
const PAGES_TABLE = "ntj_notebook_pages";

export async function listNotebookData(
  userId: string,
  accountId?: string | null
): Promise<NotebookStorage> {
  if (!userId) return { notebooks: [], sections: [], pages: [] };

  let booksQuery = supabaseBrowser
    .from(BOOKS_TABLE)
    .select("*")
    .eq("user_id", userId);

  if (accountId) {
    booksQuery = booksQuery.eq("account_id", accountId);
  }

  const { data: books, error: bookErr } = await booksQuery.order("created_at", {
    ascending: true,
  });

  if (bookErr || !books?.length) {
    return { notebooks: books ?? [], sections: [], pages: [] };
  }

  const bookIds = books.map((b) => b.id);

  const { data: sections } = await supabaseBrowser
    .from(SECTIONS_TABLE)
    .select("*")
    .in("notebook_id", bookIds)
    .order("created_at", { ascending: true });

  const { data: pages } = await supabaseBrowser
    .from(PAGES_TABLE)
    .select("*")
    .in("notebook_id", bookIds)
    .order("created_at", { ascending: true });

  return {
    notebooks: (books ?? []) as NotebookBookRow[],
    sections: (sections ?? []) as NotebookSectionRow[],
    pages: (pages ?? []) as NotebookPageRow[],
  };
}

export async function createNotebookBook(
  userId: string,
  accountId: string | null,
  name: string
): Promise<NotebookBookRow | null> {
  const { data, error } = await supabaseBrowser
    .from(BOOKS_TABLE)
    .insert({
      user_id: userId,
      account_id: accountId ?? null,
      name,
    })
    .select("*")
    .single();

  if (error) {
    console.error("[notebookSupabase] createNotebookBook error:", error);
    return null;
  }

  return data as NotebookBookRow;
}

export async function createNotebookSection(
  userId: string,
  notebookId: string,
  name: string
): Promise<NotebookSectionRow | null> {
  const { data, error } = await supabaseBrowser
    .from(SECTIONS_TABLE)
    .insert({
      user_id: userId,
      notebook_id: notebookId,
      name,
    })
    .select("*")
    .single();

  if (error) {
    console.error("[notebookSupabase] createNotebookSection error:", error);
    return null;
  }

  return data as NotebookSectionRow;
}

export async function createNotebookPage(
  userId: string,
  notebookId: string,
  sectionId: string | null,
  title: string
): Promise<NotebookPageRow | null> {
  const { data, error } = await supabaseBrowser
    .from(PAGES_TABLE)
    .insert({
      user_id: userId,
      notebook_id: notebookId,
      section_id: sectionId,
      title,
      content: "",
    })
    .select("*")
    .single();

  if (error) {
    console.error("[notebookSupabase] createNotebookPage error:", error);
    return null;
  }

  return data as NotebookPageRow;
}

export async function updateNotebookPage(
  userId: string,
  pageId: string,
  patch: Partial<Pick<NotebookPageRow, "title" | "content" | "section_id">>
): Promise<boolean> {
  const { error } = await supabaseBrowser
    .from(PAGES_TABLE)
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
    })
    .eq("id", pageId)
    .eq("user_id", userId);

  if (error) {
    console.error("[notebookSupabase] updateNotebookPage error:", error);
    return false;
  }
  return true;
}

export async function updateNotebookSection(
  userId: string,
  sectionId: string,
  patch: Partial<Pick<NotebookSectionRow, "name">>
): Promise<boolean> {
  const { error } = await supabaseBrowser
    .from(SECTIONS_TABLE)
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
    })
    .eq("id", sectionId)
    .eq("user_id", userId);

  if (error) {
    console.error("[notebookSupabase] updateNotebookSection error:", error);
    return false;
  }
  return true;
}

export async function deleteNotebookBook(
  userId: string,
  notebookId: string
): Promise<boolean> {
  const { error } = await supabaseBrowser
    .from(BOOKS_TABLE)
    .delete()
    .eq("id", notebookId)
    .eq("user_id", userId);

  if (error) {
    console.error("[notebookSupabase] deleteNotebookBook error:", error);
    return false;
  }
  return true;
}

export async function deleteNotebookPage(
  userId: string,
  pageId: string
): Promise<boolean> {
  const { error } = await supabaseBrowser
    .from(PAGES_TABLE)
    .delete()
    .eq("id", pageId)
    .eq("user_id", userId);

  if (error) {
    console.error("[notebookSupabase] deleteNotebookPage error:", error);
    return false;
  }
  return true;
}
