import { NextResponse } from "next/server";
import { ensureSnaptradeUser } from "@/lib/snaptradeStorage";
import { formatSnaptradeError, snaptradeLogin } from "@/lib/snaptradeClient";
import { requireBrokerSyncAddon } from "@/lib/serverFeatureAccess";
import { requirePlatformAccess } from "@/lib/serverPlatformAccess";
import { rateLimit, rateLimitHeaders } from "@/lib/rateLimit";

export const runtime = "nodejs";

const MAX_BROKER_SLUG_LENGTH = 64;

function normalizeBroker(value: unknown) {
  const broker = String(value ?? "").trim();
  if (!broker) return undefined;
  if (!/^[a-z0-9_.-]{1,64}$/i.test(broker)) return undefined;
  return broker.slice(0, MAX_BROKER_SLUG_LENGTH);
}

function resolveAllowedCustomRedirect(raw: unknown, reqUrl: string) {
  const value = String(raw ?? "").trim();
  if (!value) return undefined;

  const appUrl = String(process.env.NEXT_PUBLIC_APP_URL ?? "").trim();
  const requestOrigin = new URL(reqUrl).origin;
  const allowedOrigins = new Set<string>();
  if (appUrl) {
    try {
      allowedOrigins.add(new URL(appUrl).origin);
    } catch {
      // ignore malformed env; it will be caught by the origin check below
    }
  }
  if (process.env.NODE_ENV !== "production") allowedOrigins.add(requestOrigin);

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" && process.env.NODE_ENV === "production") return null;
    if (!allowedOrigins.has(parsed.origin)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  try {
    const access = await requirePlatformAccess(req);
    if (!access.ok) return access.response;
    const auth = { userId: access.context.userId };
    const limiter = await rateLimit(`snaptrade-login:user:${auth.userId}`, {
      limit: 10,
      windowMs: 60_000,
    });
    if (!limiter.allowed) {
      const retryAfter = Math.max(1, Math.ceil((limiter.resetAt - Date.now()) / 1000));
      return NextResponse.json(
        { error: "Rate limit exceeded" },
        {
          status: 429,
          headers: {
            "Retry-After": String(retryAfter),
            ...rateLimitHeaders(limiter),
          },
        }
      );
    }

    const brokerSyncFree =
      process.env.BROKER_SYNC_FREE === "true" || process.env.NEXT_PUBLIC_BROKER_SYNC_FREE === "true";
    if (!brokerSyncFree) {
      const brokerGate = await requireBrokerSyncAddon(auth.userId);
      if (brokerGate) return brokerGate;
    }

    const body = await req.json().catch(() => ({} as any));
    const row = await ensureSnaptradeUser(auth.userId);

    const customRedirect = resolveAllowedCustomRedirect(body?.customRedirect, req.url);
    if (customRedirect === null) {
      return NextResponse.json({ error: "Invalid customRedirect" }, { status: 400 });
    }

    const payload: Record<string, unknown> = {};
    const broker = normalizeBroker(body?.broker);
    if (broker) payload.broker = broker;
    if (typeof body?.immediateRedirect === "boolean") payload.immediateRedirect = body.immediateRedirect;
    if (customRedirect) payload.customRedirect = customRedirect;
    if (typeof body?.darkMode === "boolean") payload.darkMode = body.darkMode;

    const data = await snaptradeLogin({
      userId: row.snaptrade_user_id,
      userSecret: row.snaptrade_user_secret,
      broker: payload.broker as string | undefined,
      immediateRedirect: payload.immediateRedirect as boolean | undefined,
      customRedirect: payload.customRedirect as string | undefined,
      connectionType: "read",
      darkMode: payload.darkMode as boolean | undefined,
    });

    const url = data?.redirectURI || data?.redirectUri || data?.url || "";
    if (!url) {
      return NextResponse.json({ error: "Missing redirect URI" }, { status: 500 });
    }

    return NextResponse.json({ url });
  } catch (err: any) {
    return NextResponse.json(formatSnaptradeError(err), { status: 500 });
  }
}
