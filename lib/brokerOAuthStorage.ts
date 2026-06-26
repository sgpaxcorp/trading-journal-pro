import "server-only";

import { decryptSecret, encryptSecret } from "@/lib/secretVault";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";

export type BrokerOAuthConnection = {
  user_id: string;
  broker: string;
  access_token: string | null;
  refresh_token: string | null;
  scope: string | null;
  access_expires_at: string | null;
  refresh_expires_at: string | null;
};

function decryptConnection(row: BrokerOAuthConnection): BrokerOAuthConnection {
  return {
    ...row,
    access_token: decryptSecret(row.access_token),
    refresh_token: decryptSecret(row.refresh_token),
  };
}

export async function getBrokerOAuthConnection(
  userId: string,
  broker: string
): Promise<BrokerOAuthConnection | null> {
  const { data, error } = await supabaseAdmin
    .from("broker_oauth_connections")
    .select(
      "user_id, broker, access_token, refresh_token, scope, access_expires_at, refresh_expires_at"
    )
    .eq("user_id", userId)
    .eq("broker", broker)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? decryptConnection(data as BrokerOAuthConnection) : null;
}

export async function upsertBrokerOAuthConnection(
  payload: BrokerOAuthConnection
): Promise<BrokerOAuthConnection> {
  const { data, error } = await supabaseAdmin
    .from("broker_oauth_connections")
    .upsert(
      {
        user_id: payload.user_id,
        broker: payload.broker,
        access_token: encryptSecret(payload.access_token),
        refresh_token: encryptSecret(payload.refresh_token),
        scope: payload.scope,
        access_expires_at: payload.access_expires_at,
        refresh_expires_at: payload.refresh_expires_at,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,broker" }
    )
    .select(
      "user_id, broker, access_token, refresh_token, scope, access_expires_at, refresh_expires_at"
    )
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Failed to save broker OAuth connection");
  return decryptConnection(data as BrokerOAuthConnection);
}

export async function deleteBrokerOAuthConnection(userId: string, broker: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("broker_oauth_connections")
    .delete()
    .eq("user_id", userId)
    .eq("broker", broker);
  if (error) throw new Error(error.message);
}
