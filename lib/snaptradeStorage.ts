import "server-only";

import { supabaseAdmin } from "@/lib/supaBaseAdmin";
import { snaptradeDeleteUser, snaptradeRegisterUser } from "@/lib/snaptradeClient";
import { decryptSecret, encryptSecret } from "@/lib/secretVault";

type SnaptradeUserRow = {
  user_id: string;
  snaptrade_user_id: string;
  snaptrade_user_secret: string;
};

type NeuroAnalysisSnaptradeUserRow = {
  owner_user_id: string;
  snaptrade_user_id: string;
  snaptrade_user_secret: string;
};

function neuroAnalysisSnaptradeUserId(userId: string) {
  return `${userId}-neuro-analysis`;
}

export async function getSnaptradeUser(userId: string): Promise<SnaptradeUserRow | null> {
  const { data, error } = await supabaseAdmin
    .from("snaptrade_users")
    .select("user_id, snaptrade_user_id, snaptrade_user_secret")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;
  const row = data as SnaptradeUserRow;
  return {
    ...row,
    snaptrade_user_secret: decryptSecret(row.snaptrade_user_secret) || "",
  };
}

export async function ensureSnaptradeUser(userId: string): Promise<SnaptradeUserRow> {
  const existing = await getSnaptradeUser(userId);
  if (existing?.snaptrade_user_secret) return existing;

  const snaptradeUserId = userId;
  let resp: { userId?: string; userSecret: string };
  try {
    resp = await snaptradeRegisterUser(snaptradeUserId);
  } catch (err: any) {
    const msg = String(err?.message ?? err);
    const alreadyExists = msg.toLowerCase().includes("already exists") || msg.includes("(1010)");
    if (!alreadyExists) {
      throw err;
    }
    // User exists on SnapTrade but not locally (likely env swap). Remove and recreate.
    await snaptradeDeleteUser(snaptradeUserId);
    await new Promise((resolve) => setTimeout(resolve, 1200));
    resp = await snaptradeRegisterUser(snaptradeUserId);
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
        snaptrade_user_secret: encryptSecret(row.snaptrade_user_secret),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

  if (error) throw new Error(error.message);

  return row;
}

export async function getNeuroAnalysisSnaptradeUser(
  userId: string
): Promise<NeuroAnalysisSnaptradeUserRow | null> {
  const { data, error } = await supabaseAdmin
    .from("neuro_analysis_snaptrade_users")
    .select("owner_user_id, snaptrade_user_id, snaptrade_user_secret")
    .eq("owner_user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;
  const row = data as NeuroAnalysisSnaptradeUserRow;
  return {
    ...row,
    snaptrade_user_secret: decryptSecret(row.snaptrade_user_secret) || "",
  };
}

export async function ensureNeuroAnalysisSnaptradeUser(
  userId: string
): Promise<NeuroAnalysisSnaptradeUserRow> {
  const existing = await getNeuroAnalysisSnaptradeUser(userId);
  if (existing?.snaptrade_user_secret) return existing;

  const snaptradeUserId = neuroAnalysisSnaptradeUserId(userId);
  let resp: { userId?: string; userSecret: string };
  try {
    resp = await snaptradeRegisterUser(snaptradeUserId);
  } catch (err: any) {
    const msg = String(err?.message ?? err);
    const alreadyExists = msg.toLowerCase().includes("already exists") || msg.includes("(1010)");
    if (!alreadyExists) {
      throw err;
    }
    await snaptradeDeleteUser(snaptradeUserId);
    await new Promise((resolve) => setTimeout(resolve, 1200));
    resp = await snaptradeRegisterUser(snaptradeUserId);
  }

  const row: NeuroAnalysisSnaptradeUserRow = {
    owner_user_id: userId,
    snaptrade_user_id: resp.userId ?? snaptradeUserId,
    snaptrade_user_secret: resp.userSecret,
  };

  const { error } = await supabaseAdmin
    .from("neuro_analysis_snaptrade_users")
    .upsert(
      {
        owner_user_id: row.owner_user_id,
        snaptrade_user_id: row.snaptrade_user_id,
        snaptrade_user_secret: encryptSecret(row.snaptrade_user_secret),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "owner_user_id" }
    );

  if (error) throw new Error(error.message);

  return row;
}
