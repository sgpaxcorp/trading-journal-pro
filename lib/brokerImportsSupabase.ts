import { supabaseBrowser } from "@/lib/supaBaseClient";
import type { BrokerId, ImportType } from "@/lib/brokers/types";

export type BrokerImportRow = {
  id: string;
  user_id: string;
  account_id: string;
  broker: string;
  import_type: string;
  source_tz: string | null;
  filename: string | null;
  file_hash: string | null;
  meta: any;
  created_at: string;
};

const TABLE = "broker_imports" as const;

export async function createBrokerImport(
  userId: string,
  accountId: string,
  broker: BrokerId,
  importType: ImportType,
  meta?: any,
  extra?: {
    source_tz?: string | null;
    filename?: string | null;
    file_hash?: string | null;
  }
): Promise<BrokerImportRow | null> {
  if (!userId || !accountId) return null;

  const { data, error } = await supabaseBrowser
    .from(TABLE)
    .insert({
      user_id: userId,
      account_id: accountId,
      broker,
      import_type: importType,
      source_tz: extra?.source_tz ?? null,
      filename: extra?.filename ?? null,
      file_hash: extra?.file_hash ?? null,
      meta: meta ?? {},
    })
    .select("*")
    .single();

  if (error) return null;
  return data as BrokerImportRow;
}

export async function listBrokerImports(
  userId: string,
  accountId: string,
  opts?: { broker?: string; importType?: string; limit?: number }
): Promise<BrokerImportRow[]> {
  if (!userId || !accountId) return [];

  let q = supabaseBrowser
    .from(TABLE)
    .select("*")
    .eq("user_id", userId)
    .eq("account_id", accountId)
    .order("created_at", { ascending: false });

  if (opts?.broker) q = q.eq("broker", opts.broker);
  if (opts?.importType) q = q.eq("import_type", opts.importType);
  if (opts?.limit) q = q.limit(opts.limit);

  const { data, error } = await q;
  if (error || !Array.isArray(data)) return [];
  return data as BrokerImportRow[];
}
