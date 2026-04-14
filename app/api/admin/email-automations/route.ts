import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";
import {
  getAutomatedEmailCatalog,
  getEmailSenderStatus,
  sendAutomatedEmailTest,
  type AutomatedEmailKey,
} from "@/lib/email";

function parseAdminEmails(envValue?: string | null) {
  return (envValue || "")
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
}

async function isAdmin(userId: string, email?: string | null): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("admin_users")
    .select("user_id, active")
    .eq("user_id", userId)
    .eq("active", true)
    .limit(1);
  if (!error && (data ?? []).length > 0) return true;

  const allowList = parseAdminEmails(process.env.ADMIN_EMAILS);
  if (email && allowList.includes(email.toLowerCase())) return true;
  return false;
}

async function getAdminAuth(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return null;

  const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || !authData?.user) return null;

  const ok = await isAdmin(authData.user.id, authData.user.email);
  if (!ok) return null;
  return authData.user;
}

export async function GET(req: NextRequest) {
  try {
    const admin = await getAdminAuth(req);
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    return NextResponse.json({
      sender: getEmailSenderStatus(),
      automations: getAutomatedEmailCatalog(),
      adminEmail: admin.email ?? "",
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Unexpected error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await getAdminAuth(req);
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const key = String(body?.key ?? "") as AutomatedEmailKey;
    const to = String(body?.to ?? admin.email ?? "").trim().toLowerCase();
    if (!to || !to.includes("@")) {
      return NextResponse.json({ error: "A valid test recipient is required." }, { status: 400 });
    }

    await sendAutomatedEmailTest({ key, to });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[admin/email-automations] test send error:", err);
    return NextResponse.json({ error: err?.message ?? "Unexpected error" }, { status: 500 });
  }
}
