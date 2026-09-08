import { NextRequest, NextResponse } from "next/server";
import { requireAdminActionSecret, requireAdminUser } from "@/lib/adminAuth";
import { recordAdminAuditEvent } from "@/lib/adminAudit";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";
import { WAITLIST_CAMPAIGN } from "@/lib/waitlistCampaign";
import {
  dispatchWaitlistLaunch,
  getWaitlistLaunchOverview,
} from "@/lib/waitlistLaunchDelivery";
import {
  buildWaitlistLaunchDiscountEmail,
  getWaitlistLaunchEmailStatus,
  sendWaitlistLaunchDiscountEmail,
} from "@/lib/waitlistLaunchEmail";
import {
  getAdminBroadcastRecipients,
  getAutomatedEmailCatalog,
  getEmailSenderStatus,
  sendAdminBroadcastEmail,
  sendAdminBroadcastToRecipients,
  sendAdminBroadcastToAllUsers,
  sendAutomatedEmailTest,
  type AutomatedEmailKey,
  type AdminBroadcastTemplateKey,
} from "@/lib/email";

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  try {
    const admin = await requireAdminUser(req, { action: "email-automations:read", limit: 60, windowMs: 60_000 });
    if (!admin.ok) return admin.response;

    const [recipients, waitlistOverview] = await Promise.all([
      getAdminBroadcastRecipients(),
      getWaitlistLaunchOverview(),
    ]);
    const waitlistStatus = getWaitlistLaunchEmailStatus();

    return NextResponse.json({
      sender: getEmailSenderStatus(),
      automations: getAutomatedEmailCatalog(),
      adminEmail: admin.user.email ?? "",
      broadcastAudienceCount: recipients.length,
      broadcastRecipients: recipients,
      waitlistLaunch: {
        name: "Launch discount delivery",
        description: `Sends the ${WAITLIST_CAMPAIGN.discountPercent}% annual offer to the first ${WAITLIST_CAMPAIGN.discountLimit} eligible waitlist members.`,
        launchDateIso: waitlistStatus.launchDateIso,
        launchDateLabel: waitlistStatus.launchDateLabel,
        from: waitlistStatus.from,
        discountUrl: waitlistStatus.discountUrl,
        promoCode: waitlistStatus.promoCode,
        promotionConfigured: waitlistStatus.promotionConfigured,
        resendConfigured: waitlistStatus.configured,
        preview: buildWaitlistLaunchDiscountEmail({
          email: admin.user.email || "admin@example.com",
          name: "Trader Entrepreneur",
          position: 1,
        }),
        overview: waitlistOverview,
      },
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

    if (action === "waitlist_launch_test_email") {
      const to = String(body?.to ?? admin.user.email ?? "").trim().toLowerCase();
      if (!to || !to.includes("@")) {
        return NextResponse.json({ error: "A valid test recipient is required." }, { status: 400 });
      }

      await sendWaitlistLaunchDiscountEmail({
        email: to,
        name: "Trader Entrepreneur",
        position: 1,
      });
      await recordAdminAuditEvent({
        req,
        adminUserId: admin.user.id,
        adminEmail: admin.user.email,
        action: "admin_waitlist_launch_test_email",
        metadata: { to },
      });
      return NextResponse.json({ ok: true, mode: "waitlist_launch_test_email" });
    }

    if (action === "waitlist_launch_send" || action === "waitlist_launch_retry") {
      const stepUpResponse = requireAdminActionSecret(req, body);
      if (stepUpResponse) return stepUpResponse;

      const isRetry = action === "waitlist_launch_retry";
      const expectedConfirmation = isRetry ? "RETRY FAILED" : "SEND LAUNCH";
      const confirmation = String(body?.confirmText ?? "").trim().toUpperCase();
      if (confirmation !== expectedConfirmation) {
        return NextResponse.json(
          { error: `Type ${expectedConfirmation} to confirm this delivery.` },
          { status: 400 }
        );
      }

      if (Date.now() < new Date(WAITLIST_CAMPAIGN.launchDateIso).getTime()) {
        return NextResponse.json(
          {
            error: "Launch delivery is locked until the scheduled launch time.",
            launchDateIso: WAITLIST_CAMPAIGN.launchDateIso,
          },
          { status: 425 }
        );
      }

      const result = await dispatchWaitlistLaunch({ mode: isRetry ? "failed" : "pending" });
      await recordAdminAuditEvent({
        req,
        adminUserId: admin.user.id,
        adminEmail: admin.user.email,
        action: isRetry ? "admin_waitlist_launch_retry" : "admin_waitlist_launch_send",
        metadata: result,
      });
      return NextResponse.json({
        ok: true,
        mode: isRetry ? "waitlist_launch_retry" : "waitlist_launch_send",
        result,
        overview: await getWaitlistLaunchOverview(),
      });
    }

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
      await recordAdminAuditEvent({
        req,
        adminUserId: admin.user.id,
        adminEmail: admin.user.email,
        action: "admin_email_broadcast_preview",
        metadata: {
          to,
          templateKey,
          subject,
        },
      });
      return NextResponse.json({ ok: true, mode: "preview" });
    }

    if (action === "broadcast_selected") {
      const subject = String(body?.subject ?? "").trim();
      const title = String(body?.title ?? "").trim();
      const message = String(body?.message ?? "").trim();
      const templateKey = String(body?.templateKey ?? "custom_broadcast") as AdminBroadcastTemplateKey;
      const recipientIds = Array.from(
        new Set(
          (Array.isArray(body?.recipientIds) ? body.recipientIds : [])
            .map((value: unknown) => String(value ?? "").trim())
            .filter(Boolean)
        )
      );

      if (!subject || !title || !message) {
        return NextResponse.json(
          { error: "Subject, title, and message are required." },
          { status: 400 }
        );
      }

      if (!recipientIds.length) {
        return NextResponse.json(
          { error: "Select at least one user before sending." },
          { status: 400 }
        );
      }

      const { data: selectedRows, error: selectedError } = await supabaseAdmin
        .from("profiles")
        .select("id,email")
        .in("id", recipientIds)
        .not("email", "is", null);

      if (selectedError) throw selectedError;

      const recipients = (selectedRows ?? [])
        .map((row: any) => String(row?.email ?? "").trim().toLowerCase())
        .filter((email) => email && email.includes("@"));

      if (!recipients.length) {
        return NextResponse.json(
          { error: "No valid emails were found for the selected users." },
          { status: 400 }
        );
      }

      const result = await sendAdminBroadcastToRecipients(
        {
          templateKey,
          subject,
          title,
          message,
          highlight: String(body?.highlight ?? "").trim() || null,
          ctaLabel: String(body?.ctaLabel ?? "").trim() || null,
          ctaUrl: String(body?.ctaUrl ?? "").trim() || null,
          footerNote: String(body?.footerNote ?? "").trim() || null,
          locale: String(body?.locale ?? "").trim() || null,
        },
        recipients
      );

      await recordAdminAuditEvent({
        req,
        adminUserId: admin.user.id,
        adminEmail: admin.user.email,
        action: "admin_email_broadcast_selected",
        metadata: {
          templateKey,
          subject,
          requestedRecipients: recipientIds.length,
          resolvedRecipients: recipients.length,
          result,
        },
      });
      return NextResponse.json({ ok: true, mode: "selected", result });
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
      await recordAdminAuditEvent({
        req,
        adminUserId: admin.user.id,
        adminEmail: admin.user.email,
        action: "admin_email_broadcast_all",
        metadata: {
          templateKey,
          subject,
          result,
        },
      });
      return NextResponse.json({ ok: true, mode: "all", result });
    }

    const key = String(body?.key ?? "") as AutomatedEmailKey;
    const to = String(body?.to ?? admin.user.email ?? "").trim().toLowerCase();
    if (!to || !to.includes("@")) {
      return NextResponse.json({ error: "A valid test recipient is required." }, { status: 400 });
    }

    await sendAutomatedEmailTest({ key, to });
    await recordAdminAuditEvent({
      req,
      adminUserId: admin.user.id,
      adminEmail: admin.user.email,
      action: "admin_email_automation_test",
      metadata: {
        key,
        to,
      },
    });
    return NextResponse.json({ ok: true, mode: "test_automation" });
  } catch (err: any) {
    console.error("[admin/email-automations] test send error:", err);
    return NextResponse.json({ error: err?.message ?? "Unexpected error" }, { status: 500 });
  }
}
