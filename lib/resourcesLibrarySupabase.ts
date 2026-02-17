import { supabaseBrowser } from "@/lib/supaBaseClient";

export type ResourceKind = "youtube" | "book" | "amazon" | "article" | "note" | "link";

export type ResourceLibraryItemRow = {
  id: string;
  user_id: string;
  account_id: string | null;
  kind: ResourceKind;
  title: string;
  url: string | null;
  author: string | null;
  content: string | null;
  created_at: string;
  updated_at: string;
};

const TABLE = "ntj_resource_library_items";

type ResourceCreateInput = {
  kind: ResourceKind;
  title: string;
  url?: string | null;
  author?: string | null;
  content?: string | null;
};

type ResourceUpdateInput = Partial<Pick<ResourceLibraryItemRow, "kind" | "title" | "url" | "author" | "content">>;

function isMissingTableError(err: { code?: string } | null | undefined): boolean {
  return err?.code === "42P01";
}

export async function listResourceLibraryItems(
  userId: string,
  accountId: string | null
): Promise<ResourceLibraryItemRow[]> {
  if (!userId) return [];

  let q = supabaseBrowser
    .from(TABLE)
    .select("*")
    .eq("user_id", userId);

  if (accountId) q = q.eq("account_id", accountId);
  else q = q.is("account_id", null);

  const { data, error } = await q.order("created_at", { ascending: false });
  if (error) {
    if (!isMissingTableError(error)) {
      console.error("[resourcesLibrarySupabase] list error:", error);
    }
    return [];
  }

  return Array.isArray(data) ? (data as ResourceLibraryItemRow[]) : [];
}

export async function createResourceLibraryItem(
  userId: string,
  accountId: string | null,
  input: ResourceCreateInput
): Promise<ResourceLibraryItemRow | null> {
  if (!userId) return null;

  const nowIso = new Date().toISOString();
  const payload = {
    user_id: userId,
    account_id: accountId ?? null,
    kind: input.kind,
    title: input.title.trim(),
    url: input.url?.trim() || null,
    author: input.author?.trim() || null,
    content: input.content?.trim() || null,
    updated_at: nowIso,
  };

  const { data, error } = await supabaseBrowser
    .from(TABLE)
    .insert(payload)
    .select("*")
    .single();

  if (error) {
    if (!isMissingTableError(error)) {
      console.error("[resourcesLibrarySupabase] create error:", error);
    }
    return null;
  }

  return data as ResourceLibraryItemRow;
}

export async function updateResourceLibraryItem(
  userId: string,
  itemId: string,
  patch: ResourceUpdateInput
): Promise<boolean> {
  if (!userId || !itemId) return false;

  const payload: ResourceUpdateInput & { updated_at: string } = {
    ...patch,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabaseBrowser
    .from(TABLE)
    .update(payload)
    .eq("id", itemId)
    .eq("user_id", userId);

  if (error) {
    if (!isMissingTableError(error)) {
      console.error("[resourcesLibrarySupabase] update error:", error);
    }
    return false;
  }
  return true;
}

export async function deleteResourceLibraryItem(
  userId: string,
  itemId: string
): Promise<boolean> {
  if (!userId || !itemId) return false;

  const { error } = await supabaseBrowser
    .from(TABLE)
    .delete()
    .eq("id", itemId)
    .eq("user_id", userId);

  if (error) {
    if (!isMissingTableError(error)) {
      console.error("[resourcesLibrarySupabase] delete error:", error);
    }
    return false;
  }
  return true;
}
