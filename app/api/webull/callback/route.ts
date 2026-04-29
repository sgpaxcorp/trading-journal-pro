import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { exchangeWebullCode, saveWebullTokens, formatWebullError } from "@/lib/webullClient";
import { getBrokerOAuthConnection } from "@/lib/brokerOAuthStorage";
import { requireBrokerSyncAddon } from "@/lib/serverFeatureAccess";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const errorDesc = url.searchParams.get("error_description");

  const res = NextResponse.redirect(new URL("/import", url.origin));

  if (error) {
    res.headers.set(
      "Location",
      `${url.origin}/import?webull=error&reason=${encodeURIComponent(errorDesc || error)}`
    );
    return res;
  }

  const cookieStore = await cookies();
  const cookieState = cookieStore.get("webull_oauth_state")?.value || "";
  const userId = cookieStore.get("webull_oauth_uid")?.value || "";

  if (!code || !userId || !state || state !== cookieState) {
    res.headers.set("Location", `${url.origin}/import?webull=error&reason=state_mismatch`);
    return res;
  }

  try {
    const brokerSyncFree =
      process.env.BROKER_SYNC_FREE === "true" || process.env.NEXT_PUBLIC_BROKER_SYNC_FREE === "true";
    if (!brokerSyncFree) {
      const brokerGate = await requireBrokerSyncAddon(userId);
      if (brokerGate) {
        res.headers.set("Location", `${url.origin}/import?webull=error&reason=broker_sync_required`);
        return res;
      }
    }

    const existing = await getBrokerOAuthConnection(userId, "webull");
    const tokenData = await exchangeWebullCode(code);
    await saveWebullTokens(userId, tokenData, existing ?? undefined);

    res.headers.set("Location", `${url.origin}/import?webull=connected`);
  } catch (err: any) {
    const formatted = formatWebullError(err);
    res.headers.set(
      "Location",
      `${url.origin}/import?webull=error&reason=${encodeURIComponent(formatted?.detail || "oauth_failed")}`
    );
  }

  res.cookies.set("webull_oauth_state", "", { maxAge: 0, path: "/" });
  res.cookies.set("webull_oauth_uid", "", { maxAge: 0, path: "/" });
  return res;
}
