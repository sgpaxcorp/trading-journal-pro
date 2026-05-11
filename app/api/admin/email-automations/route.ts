import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";
import {
  getAutomatedEmailCatalog,
  getEmailSenderStatus,
  sendAdminBroadcastEmail,
  sendAdminBroadcastToAllUsers,
  sendAutomatedEmailTest,
  type AutomatedEmailKey,
  type AdminBroadcastTemplateKey,
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

    const { count } = await supabaseAdmin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .not("email", "is", null);

    return NextResponse.json({
      sender: getEmailSenderStatus(),
      automations: getAutomatedEmailCatalog(),
      adminEmail: admin.email ?? "",
      broadcastAudienceCount: count ?? 0,
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
    const action = String(body?.action ?? "test_automation");

    if (action === "broadcast_preview") {
      const to = String(body?.to ?? admin.email ?? "").trim().toLowerCase();
      if (!to || !to.includes("@")) {
        return NextResponse.json({ error: "A valid preview recipient is required." }, { status: 400 });
      }

      const subject = String(body?.subject ?? "").trim();
      const title = String(body?.title ?? "").trim();
      const message = String(body?.message ?? "").trim();
      const templateKey = String(body?.templateKey ?? "custom_broadcast") as AdminBroadcastTemplateKey;
      if (!subject || !title || !message) {
        return NextResponse.json(
          { error: "Subject, title, and message are required." },
          { status: 400 }
        );
      }

      await sendAdminBroadcastEmail({
        to,
        templateKey,
        subject,
        title,
        message,
        highlight: String(body?.highlight ?? "").trim() || null,
        ctaLabel: String(body?.ctaLabel ?? "").trim() || null,
        ctaUrl: String(body?.ctaUrl ?? "").trim() || null,
        footerNote: String(body?.footerNote ?? "").trim() || null,
        locale: String(body?.locale ?? "").trim() || null,
      });
      return NextResponse.json({ ok: true, mode: "preview" });
    }

    if (action === "broadcast_all") {
      const subject = String(body?.subject ?? "").trim();
      const title = String(body?.title ?? "").trim();
      const message = String(body?.message ?? "").trim();
      const templateKey = String(body?.templateKey ?? "custom_broadcast") as AdminBroadcastTemplateKey;
      const confirmText = String(body?.confirmText ?? "").trim().toUpperCase();
      if (confirmText !== "SEND") {
        return NextResponse.json(
          { error: "Type SEND to confirm a broadcast to all users." },
          { status: 400 }
        );
      }
      if (!subject || !title || !message) {
        return NextResponse.json(
          { error: "Subject, title, and message are required." },
          { status: 400 }
        );
      }

      const result = await sendAdminBroadcastToAllUsers({
        templateKey,
        subject,
        title,
        message,
        highlight: String(body?.highlight ?? "").trim() || null,
        ctaLabel: String(body?.ctaLabel ?? "").trim() || null,
        ctaUrl: String(body?.ctaUrl ?? "").trim() || null,
        footerNote: String(body?.footerNote ?? "").trim() || null,
        locale: String(body?.locale ?? "").trim() || null,
      });
      return NextResponse.json({ ok: true, mode: "all", result });
    }

    const key = String(body?.key ?? "") as AutomatedEmailKey;
    const to = String(body?.to ?? admin.email ?? "").trim().toLowerCase();
    if (!to || !to.includes("@")) {
      return NextResponse.json({ error: "A valid test recipient is required." }, { status: 400 });
    }

    await sendAutomatedEmailTest({ key, to });
    return NextResponse.json({ ok: true, mode: "test_automation" });
  } catch (err: any) {
    console.error("[admin/email-automations] test send error:", err);
    return NextResponse.json({ error: err?.message ?? "Unexpected error" }, { status: 500 });
  }
}
