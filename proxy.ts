// proxy.ts
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const PORTFOLIO_MUTATION_PREFIXES = [
  "/api/neuro-analysis/",
  "/api/broker-import",
  "/api/snaptrade",
  "/api/webull",
];

function isPortfolioMutation(req: NextRequest) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method.toUpperCase())) return false;
  return PORTFOLIO_MUTATION_PREFIXES.some((prefix) =>
    req.nextUrl.pathname.startsWith(prefix)
  );
}

async function enforceEmergencyPortfolioReadOnly(req: NextRequest) {
  if (!isPortfolioMutation(req)) return null;
  const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
  const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!url || !serviceKey) {
    return NextResponse.json(
      {
        error: "Portfolio mutation safety state could not be verified.",
        code: "portfolio_control_state_unavailable",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const response = await fetch(
      `${url}/rest/v1/admin_settings?key=eq.emergency_portfolio_controls&select=value_json`,
      {
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          Accept: "application/json",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(3_000),
      }
    );
    if (!response.ok) throw new Error(`control lookup failed (${response.status})`);
    const rows = (await response.json()) as Array<{ value_json?: { read_only?: boolean } }>;
    const readOnly = rows[0]?.value_json?.read_only;
    if (typeof readOnly !== "boolean") {
      throw new Error("control state is missing or malformed");
    }
    if (!readOnly) return null;
    return NextResponse.json(
      {
        error: "The investment system is in READ ONLY mode. Portfolio mutations are blocked.",
        code: "portfolio_read_only",
        emergencyControlActive: true,
      },
      { status: 423, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("[proxy] Emergency portfolio control lookup failed:", error);
    return NextResponse.json(
      {
        error: "Portfolio mutation safety state could not be verified.",
        code: "portfolio_control_state_unavailable",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}

function buildContentSecurityPolicy(nonce: string) {
  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    "blob:",
    "https://hcaptcha.com",
    "https://*.hcaptcha.com",
    "https://js.hcaptcha.com",
  ];

  if (process.env.NODE_ENV !== "production") {
    scriptSrc.splice(2, 0, "'unsafe-eval'");
  }

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "img-src 'self' data: https: https://hcaptcha.com https://*.hcaptcha.com",
    "font-src 'self' data: https:",
    "manifest-src 'self'",
    "media-src 'self' data: blob: https:",
    "style-src 'self' 'unsafe-inline' https://hcaptcha.com https://*.hcaptcha.com",
    `script-src ${scriptSrc.join(" ")}`,
    "worker-src 'self' blob:",
    "connect-src 'self' https: wss: https://hcaptcha.com https://*.hcaptcha.com",
    "frame-src https://hcaptcha.com https://*.hcaptcha.com",
  ].join("; ");
}

export async function proxy(req: NextRequest) {
  const emergencyReadOnlyResponse = await enforceEmergencyPortfolioReadOnly(req);
  if (emergencyReadOnlyResponse) return emergencyReadOnlyResponse;

  const nonce = crypto.randomUUID().replace(/-/g, "");
  const requestHeaders = new Headers(req.headers);
  const csp = buildContentSecurityPolicy(nonce);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  let res = NextResponse.next({
    request: { headers: requestHeaders },
  });
  res.headers.set("Content-Security-Policy", csp);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anon) return res;

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          res.cookies.set(name, value, options);
        });
      },
    },
  });

  // Esto refresca la sesión/cookies si hace falta
  await supabase.auth.getUser();

  return res;
}

// Evita correr en static assets
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
