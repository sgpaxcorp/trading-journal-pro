import { NextRequest, NextResponse } from "next/server";

import { evaluateAlertRulesForUser } from "@/lib/alertRuleEngineServer";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";

export const runtime = "nodejs";

async function resolveAuthUser(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user?.id) return null;
  return { token, user: data.user };
}

async function handleRequest(req: NextRequest) {
  try {
    const auth = await resolveAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const langHeader = (req.headers.get("x-ntj-lang") || "en").toLowerCase();
    const lang = langHeader.startsWith("es") ? "es" : "en";
    const result = await evaluateAlertRulesForUser(auth.user.id, { lang });

    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Unknown error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return handleRequest(req);
}

export async function POST(req: NextRequest) {
  return handleRequest(req);
}
