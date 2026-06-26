import { NextRequest, NextResponse } from "next/server";
import { requireAdminActionSecret, requireAdminUser } from "@/lib/adminAuth";
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

export async function GET(req: NextRequest) {
  try {
    const admin = await requireAdminUser(req, { action: "email-automations:read", limit: 60, windowMs: 60_000 });
    if (!admin.ok) return admin.response;

    const { count } = await supabaseAdmin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .not("email", "is", null);

    return NextResponse.json({
      sender: getEmailSenderStatus(),
      automations: getAutomatedEmailCatalog(),
      adminEmail: admin.user.email ?? "",
      broadcastAudienceCount: count ?? 0,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Unexpected error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdminUser(req, { action: "email-automations:write", limit: 20, windowMs: 10 * 60_000 });
    if (!admin.ok) return admin.response;

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "test_automation");

    if (action === "broadcast_preview") {
      const to = String(body?.to ?? admin.user.email ?? "").trim().toLowerCase();
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
      const stepUpResponse = requireAdminActionSecret(req, body);
      if (stepUpResponse) return stepUpResponse;

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
    const to = String(body?.to ?? admin.user.email ?? "").trim().toLowerCase();
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
