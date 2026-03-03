import { supabaseAdmin } from "@/lib/supaBaseAdmin";
import { snaptradeRequest } from "@/lib/snaptradeClient";

type SnaptradeUserRow = {
  user_id: string;
  snaptrade_user_id: string;
  snaptrade_user_secret: string;
};

export async function getSnaptradeUser(userId: string): Promise<SnaptradeUserRow | null> {
  const { data, error } = await supabaseAdmin
    .from("snaptrade_users")
    .select("user_id, snaptrade_user_id, snaptrade_user_secret")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? (data as SnaptradeUserRow) : null;
}

export async function ensureSnaptradeUser(userId: string): Promise<SnaptradeUserRow> {
  const existing = await getSnaptradeUser(userId);
  if (existing?.snaptrade_user_secret) return existing;

  const snaptradeUserId = userId;
  let resp: { userId?: string; userSecret: string };
  try {
    resp = await snaptradeRequest<{ userId?: string; userSecret: string }>("/snapTrade/registerUser", "POST", {
      body: { userId: snaptradeUserId },
    });
  } catch (err: any) {
    const msg = String(err?.message ?? err);
    const alreadyExists = msg.toLowerCase().includes("already exists") || msg.includes("(1010)");
    if (!alreadyExists) {
      throw err;
    }
    // User exists on SnapTrade but not locally (likely env swap). Remove and recreate.
    await snaptradeRequest("/snapTrade/deleteUser", "DELETE", {
      query: { userId: snaptradeUserId },
    });
    await new Promise((resolve) => setTimeout(resolve, 1200));
    resp = await snaptradeRequest<{ userId?: string; userSecret: string }>("/snapTrade/registerUser", "POST", {
      body: { userId: snaptradeUserId },
    });
  }

  const row: SnaptradeUserRow = {
    user_id: userId,
    snaptrade_user_id: resp.userId ?? snaptradeUserId,
    snaptrade_user_secret: resp.userSecret,
  };

  const { error } = await supabaseAdmin
    .from("snaptrade_users")
    .upsert(
      {
        user_id: row.user_id,
        snaptrade_user_id: row.snaptrade_user_id,
        snaptrade_user_secret: row.snaptrade_user_secret,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

  if (error) throw new Error(error.message);

  return row;
}
