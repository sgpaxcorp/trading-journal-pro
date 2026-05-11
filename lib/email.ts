import { AppUser, PlanId } from "./types";
import { Resend } from "resend";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { jsPDF } from "jspdf";

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  "https://neurotrader-journal.com";

const FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL ||
  process.env.EMAIL_FROM ||
  "NeuroTrader Journal <support@neurotrader-journal.com>";

const AUTH_FROM_EMAIL =
  process.env.RESEND_AUTH_FROM_EMAIL ||
  process.env.AUTH_FROM_EMAIL ||
  process.env.RESEND_NO_REPLY_EMAIL ||
  process.env.NO_REPLY_FROM_EMAIL ||
  "NeuroTrader Journal <no-reply@neurotrader-journal.com>";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

type SendEmailArgs = {
  to: string;
  from?: string;
  subject: string;
  text?: string;
  html?: string;
  attachments?: EmailAttachment[];
};

type EmailContent = {
  subject: string;
  text: string;
  html: string;
};

type EmailLocale = "en" | "es";

type EmailAttachment = {
  filename: string;
  content: Buffer | string;
  contentType?: string;
};

export type InactivityReminderStage = 3 | 15 | 30;

export type AutomatedEmailKey =
  | "email_confirmation"
  | "password_reset"
  | "account_recovery"
  | "welcome"
  | "inactivity_3_day"
  | "inactivity_15_day"
  | "inactivity_30_day"
  | "subscription_confirmation"
  | "subscription_receipt"
  | "subscription_renewal_reminder"
  | "subscription_payment_method_expiring"
  | "subscription_payment_issue"
  | "subscription_cancellation"
  | "subscription_winback"
  | "profit_loss_alert";

export type AutomatedEmailPreview = {
  key: AutomatedEmailKey;
  category: "Authentication" | "Billing" | "Lifecycle" | "Operations";
  name: string;
  description: string;
  trigger: string;
  delivery: string;
  from: string;
  preview: EmailContent;
};

export type AdminBroadcastTemplateKey = AutomatedEmailKey | "custom_broadcast";

type AdminBroadcastArgs = {
  to: string;
  templateKey?: AdminBroadcastTemplateKey;
  subject: string;
  title: string;
  message: string;
  highlight?: string | null;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  footerNote?: string | null;
  locale?: string | null;
};

type NeuroTemplateArgs = {
  title: string;
  preheader?: string;
  eyebrow?: string;
  greeting: string;
  paragraphs: string[];
  highlight?: string;
  code?: string;
  facts?: { label: string; value: string }[];
  ctaLabel?: string;
  ctaUrl?: string;
  secondaryLabel?: string;
  secondaryUrl?: string;
  footerNote?: string;
};

function escapeHtml(value: string) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function resolveAppUrl(path = "") {
  const base = APP_URL.replace(/\/$/, "");
  if (!path) return base;
  return path.startsWith("http") ? path : `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

function resolveEmailLogoUrl() {
  return resolveAppUrl("/neurotrader-logo-web.png");
}

function normalizeEmailLocale(locale?: string | null): EmailLocale {
  return String(locale || "").trim().toLowerCase().startsWith("es") ? "es" : "en";
}

async function resolveEmailLocale(args: {
  userId?: string | null;
  email?: string | null;
  fallback?: string | null;
}): Promise<EmailLocale> {
  const fallback = normalizeEmailLocale(args.fallback);

  try {
    let userId = args.userId || null;
    const email = String(args.email || "").trim().toLowerCase();

    if (!userId && email) {
      const { data: profile, error: profileError } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("email", email)
        .maybeSingle();

      if (profileError) {
        console.warn("[email] profile locale lookup error:", profileError);
      }

      userId = (profile as { id?: string | null } | null)?.id || null;
    }

    if (!userId) return fallback;

    const { data, error } = await supabaseAdmin
      .from("user_preferences")
      .select("locale")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.warn("[email] preference locale lookup error:", error);
      return fallback;
    }

    return normalizeEmailLocale((data as { locale?: string | null } | null)?.locale || fallback);
  } catch (error) {
    console.warn("[email] locale lookup exception:", error);
    return fallback;
  }
}

function buildParagraphs(paragraphs: string[]) {
  return paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 12px 0;color:#334155;font-size:15px;line-height:1.65;">${p}</p>`
    )
    .join("");
}

function formatMoney(amount?: number | null) {
  if (typeof amount !== "number" || Number.isNaN(amount)) return "Processed successfully";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

function formatEmailDate(value?: string | number | Date | null) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatTodayJournalDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function formatPlanLabel(plan?: string | null) {
  const clean = String(plan ?? "").trim().toLowerCase();
  if (!clean) return "NeuroTrader Journal";
  if (clean === "advanced") return "Advanced";
  if (clean === "core") return "Core";
  return clean
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatBillingCycleLabel(cycle?: string | null) {
  const clean = String(cycle ?? "").trim().toLowerCase();
  if (!clean) return null;
  if (clean === "monthly" || clean === "month") return "Monthly";
  if (clean === "annual" || clean === "yearly" || clean === "year") return "Annual";
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

function sanitizeFilenamePart(value: string) {
  return String(value || "")
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function buildFallbackReceiptNumber(args: {
  email: string;
  chargeDate?: string | null;
}) {
  const date = args.chargeDate ? new Date(args.chargeDate) : new Date();
  const datePart = Number.isNaN(date.getTime())
    ? new Date().toISOString().slice(0, 10).replace(/-/g, "")
    : date.toISOString().slice(0, 10).replace(/-/g, "");
  let hash = 0;
  const seed = `${args.email}:${datePart}`;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return `NTJ-${datePart}-${hash.toString(16).slice(0, 6).toUpperCase()}`;
}

function addReceiptLogo(doc: jsPDF, x: number, y: number, width: number) {
  try {
    const logoPath = join(process.cwd(), "public", "neurotrader-logo-web.png");
    if (!existsSync(logoPath)) return false;

    const logo = readFileSync(logoPath).toString("base64");
    doc.addImage(`data:image/png;base64,${logo}`, "PNG", x, y, width, width * 0.1585);
    return true;
  } catch (error) {
    console.warn("[email] Could not embed receipt logo:", error);
    return false;
  }
}

function drawReceiptLabelValue(
  doc: jsPDF,
  label: string,
  value: string,
  x: number,
  y: number,
  valueAlign: "left" | "right" = "left"
) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(label.toUpperCase(), x, y);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(value, valueAlign === "right" ? x + 142 : x, y + 15, {
    align: valueAlign,
    maxWidth: 142,
  });
}

function buildSubscriptionReceiptPdfAttachment(args: {
  email: string;
  name?: string | null;
  plan: PlanId | string;
  amount?: number;
  subscriptionId?: string;
  billingCycle?: string | null;
  invoiceNumber?: string | null;
  chargeDate?: string | null;
}): EmailAttachment {
  const planLabel = formatPlanLabel(args.plan);
  const billingLabel = formatBillingCycleLabel(args.billingCycle) ?? "Subscription";
  const amountText = formatMoney(args.amount);
  const paidOn = formatEmailDate(args.chargeDate) ?? formatEmailDate(new Date()) ?? "";
  const receiptNumber =
    args.invoiceNumber || buildFallbackReceiptNumber({ email: args.email, chargeDate: args.chargeDate });
  const customerName = args.name || "NeuroTrader Journal customer";

  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 48;

  doc.setProperties({
    title: `Receipt ${receiptNumber}`,
    subject: "NeuroTrader Journal subscription receipt",
    author: "SG PAX Corp.",
    creator: "NeuroTrader Journal",
  });

  doc.setFillColor(248, 251, 255);
  doc.rect(0, 0, pageWidth, pageHeight, "F");

  doc.setFillColor(2, 6, 23);
  doc.roundedRect(margin, 38, pageWidth - margin * 2, 116, 22, 22, "F");
  doc.setFillColor(16, 185, 129);
  doc.circle(pageWidth - 92, 82, 26, "F");
  doc.setFillColor(6, 182, 212);
  doc.circle(pageWidth - 65, 104, 18, "F");

  const logoAdded = addReceiptLogo(doc, margin + 24, 65, 170);
  if (!logoAdded) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(17);
    doc.setTextColor(248, 250, 252);
    doc.text("NeuroTrader Journal", margin + 24, 88);
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(203, 213, 225);
  doc.text("Trading structure. Neuro awareness. Repeatable execution.", margin + 24, 116);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(103, 232, 249);
  doc.text("RECEIPT", pageWidth - margin - 24, 72, { align: "right" });
  doc.setFontSize(19);
  doc.setTextColor(248, 250, 252);
  doc.text(receiptNumber, pageWidth - margin - 24, 100, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(203, 213, 225);
  doc.text("Paid subscription payment", pageWidth - margin - 24, 121, { align: "right" });

  doc.setFillColor(255, 255, 255);
  doc.roundedRect(margin, 178, pageWidth - margin * 2, 170, 18, 18, "F");
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin, 178, pageWidth - margin * 2, 170, 18, 18, "S");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text("Billed by", margin + 24, 208);
  doc.text("Billed to", pageWidth / 2 + 8, 208);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("SG PAX Corp.", margin + 24, 233);
  doc.text(customerName, pageWidth / 2 + 8, 233, { maxWidth: 210 });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  doc.text("Merchant of record for NeuroTrader Journal", margin + 24, 252, { maxWidth: 220 });
  doc.text("support@neurotrader-journal.com", margin + 24, 269);
  doc.text("https://www.neurotrader-journal.com", margin + 24, 286);
  doc.text(args.email, pageWidth / 2 + 8, 252, { maxWidth: 210 });

  drawReceiptLabelValue(doc, "Paid on", paidOn, margin + 24, 319);
  drawReceiptLabelValue(doc, "Billing cycle", billingLabel, pageWidth / 2 + 8, 319);

  doc.setFillColor(236, 253, 245);
  doc.roundedRect(margin, 376, pageWidth - margin * 2, 54, 16, 16, "F");
  doc.setDrawColor(153, 246, 228);
  doc.roundedRect(margin, 376, pageWidth - margin * 2, 54, 16, 16, "S");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(6, 78, 59);
  doc.text("Status", margin + 22, 398);
  doc.setFontSize(16);
  doc.text("PAID", margin + 22, 419);
  doc.setFontSize(10);
  doc.text("Total paid", pageWidth - margin - 22, 398, { align: "right" });
  doc.setFontSize(18);
  doc.text(amountText, pageWidth - margin - 22, 420, { align: "right" });

  const tableTop = 462;
  doc.setFillColor(15, 23, 42);
  doc.roundedRect(margin, tableTop, pageWidth - margin * 2, 42, 14, 14, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(203, 213, 225);
  doc.text("DESCRIPTION", margin + 20, tableTop + 26);
  doc.text("QTY", pageWidth - 172, tableTop + 26, { align: "right" });
  doc.text("AMOUNT", pageWidth - margin - 20, tableTop + 26, { align: "right" });

  doc.setFillColor(255, 255, 255);
  doc.roundedRect(margin, tableTop + 52, pageWidth - margin * 2, 76, 14, 14, "F");
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin, tableTop + 52, pageWidth - margin * 2, 76, 14, 14, "S");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text(`NeuroTrader Journal - ${planLabel} plan`, margin + 20, tableTop + 82);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(`${billingLabel} subscription access`, margin + 20, tableTop + 101);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text("1", pageWidth - 172, tableTop + 91, { align: "right" });
  doc.text(amountText, pageWidth - margin - 20, tableTop + 91, { align: "right" });

  const totalsTop = tableTop + 154;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  doc.text("Subtotal", pageWidth - 210, totalsTop);
  doc.text(amountText, pageWidth - margin - 20, totalsTop, { align: "right" });
  doc.text("Tax", pageWidth - 210, totalsTop + 24);
  doc.text("Included if applicable", pageWidth - margin - 20, totalsTop + 24, { align: "right" });
  doc.setDrawColor(226, 232, 240);
  doc.line(pageWidth - 230, totalsTop + 42, pageWidth - margin - 20, totalsTop + 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);
  doc.text("Total paid", pageWidth - 210, totalsTop + 66);
  doc.text(amountText, pageWidth - margin - 20, totalsTop + 66, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  const legalLines = [
    "This receipt confirms payment for a NeuroTrader Journal subscription billed by SG PAX Corp.",
    args.subscriptionId ? `Stripe subscription reference: ${args.subscriptionId}` : "",
    "For billing questions, contact support@neurotrader-journal.com.",
  ].filter(Boolean);
  doc.text(legalLines, margin, pageHeight - 72, { maxWidth: pageWidth - margin * 2, lineHeightFactor: 1.45 });

  const buffer = Buffer.from(doc.output("arraybuffer"));
  const safeReceipt = sanitizeFilenamePart(receiptNumber) || "receipt";
  return {
    filename: `SG-PAX-NeuroTrader-receipt-${safeReceipt}.pdf`,
    content: buffer,
    contentType: "application/pdf",
  };
}

function buildNeuroTraderHtml({
  title,
  preheader,
  eyebrow,
  greeting,
  paragraphs,
  highlight,
  code,
  facts,
  ctaLabel,
  ctaUrl,
  secondaryLabel,
  secondaryUrl,
  footerNote,
}: NeuroTemplateArgs): string {
  const preheaderText =
    preheader ||
    "Structured journaling, AI coaching, and trading clarity inside NeuroTrader Journal.";
  const logoUrl = resolveEmailLogoUrl();

  const factsHtml = Array.isArray(facts) && facts.length
    ? `<table role="presentation" width="100%" cellPadding="0" cellSpacing="0" style="margin:18px 0 8px 0;border-collapse:separate;border-spacing:0 10px;">${facts
        .map(
          (fact) =>
            `<tr>
               <td style="padding:0 12px 0 0;color:#64748b;font-size:11px;line-height:1.4;text-transform:uppercase;letter-spacing:0.16em;width:38%;">${escapeHtml(fact.label)}</td>
               <td style="padding:0;color:#0f172a;font-size:13px;line-height:1.6;font-weight:700;">${fact.value}</td>
             </tr>`
        )
        .join("")}</table>`
    : "";

  const codeHtml = code
    ? `<div style="margin:22px auto 10px auto;max-width:336px;border:1px solid #99f6e4;border-radius:24px;background:linear-gradient(180deg,#ecfdf5 0%,#f0fdfa 100%);padding:20px 18px 18px 18px;text-align:center;box-shadow:0 16px 34px rgba(16,185,129,0.14);">
         <div style="font-size:10px;letter-spacing:0.24em;text-transform:uppercase;color:#0f766e;margin:0 0 10px 0;font-weight:800;text-align:center;">Verification code</div>
         <div style="font-size:36px;line-height:1;font-weight:900;letter-spacing:0.26em;color:#062f2b;text-align:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">${escapeHtml(code)}</div>
         <div style="margin-top:12px;color:#475569;font-size:12px;line-height:1.6;text-align:center;">Enter this code inside NeuroTrader Journal to continue.</div>
       </div>`
    : "";

  const highlightHtml = highlight
    ? `<div style="margin:16px 0 18px 0;padding:14px 16px;border-radius:20px;border:1px solid #99f6e4;background:#ecfdf5;color:#064e3b;font-size:14px;line-height:1.7;font-weight:700;">${highlight}</div>`
    : "";

  const ctaHtml = ctaLabel && ctaUrl
    ? `<div style="margin:24px 0 10px 0;">
         <a href="${ctaUrl}" style="display:inline-block;padding:13px 20px;border-radius:999px;background:linear-gradient(135deg,#10b981,#06b6d4);color:#04111d;font-size:14px;font-weight:800;text-decoration:none;box-shadow:0 12px 26px rgba(20,184,166,0.28);">${escapeHtml(ctaLabel)}</a>
       </div>`
    : "";

  const secondaryHtml = secondaryLabel && secondaryUrl
    ? `<div style="margin:0 0 4px 0;">
         <a href="${secondaryUrl}" style="display:inline-block;padding:10px 18px;border-radius:999px;border:1px solid #cbd5e1;color:#0f172a;font-size:13px;font-weight:700;text-decoration:none;background:#ffffff;">${escapeHtml(secondaryLabel)}</a>
       </div>`
    : "";

  const footerHtml = footerNote
    ? `<p style="margin:20px 0 0 0;color:#64748b;font-size:11px;line-height:1.6;">${footerNote}</p>`
    : "";

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charSet="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:#eef4f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preheaderText)}</div>
  <table role="presentation" width="100%" cellPadding="0" cellSpacing="0" style="background:#eef4f8;padding:28px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellPadding="0" cellSpacing="0" style="max-width:430px;border-radius:46px;background:#dbe7f2;padding:10px;box-shadow:0 28px 80px rgba(15,23,42,0.18),0 8px 24px rgba(15,23,42,0.12);">
          <tr>
            <td>
              <table role="presentation" width="100%" cellPadding="0" cellSpacing="0" style="border-radius:38px;overflow:hidden;background:linear-gradient(180deg,#fbfdff 0%,#f5f8fb 100%);border:1px solid #d6e2ed;">
                <tr>
                  <td align="center" style="padding:13px 0 4px 0;">
                    <div style="width:86px;height:5px;border-radius:999px;background:#cbd5e1;font-size:1px;line-height:1px;">&nbsp;</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:15px 24px 14px 24px;border-bottom:1px solid #e2e8f0;">
                    <table width="100%" role="presentation" cellPadding="0" cellSpacing="0">
                      <tr>
                        <td align="left">
                          <img src="${logoUrl}" width="196" alt="NeuroTrader Journal" style="display:block;width:196px;max-width:196px;height:auto;border:0;outline:none;text-decoration:none;" />
                          <div style="padding:7px 0 0 0;color:#64748b;font-size:11px;line-height:1.5;">Trading structure. Neuro awareness. Repeatable execution.</div>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding-top:13px;">
                          <span style="display:inline-block;border-radius:999px;background:#e0f2fe;color:#0369a1;font-size:10px;font-weight:900;letter-spacing:0.18em;text-transform:uppercase;padding:7px 10px;">${escapeHtml(eyebrow || title)}</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:26px 24px 28px 24px;">
                    <div style="font-size:27px;line-height:1.18;font-weight:900;color:#0f172a;margin:0 0 10px 0;letter-spacing:-0.03em;">${escapeHtml(title)}</div>
                    <p style="margin:0 0 16px 0;color:#1e293b;font-size:15px;font-weight:800;line-height:1.6;">${greeting}</p>
                    ${highlightHtml}
                    ${codeHtml}
                    ${factsHtml}
                    ${buildParagraphs(paragraphs)}
                    ${ctaHtml}
                    ${secondaryHtml}
                    ${footerHtml}
                  </td>
                </tr>
                <tr>
                  <td style="padding:16px 24px 18px 24px;border-top:1px solid #e2e8f0;background:#ffffff;">
                    <p style="margin:0;color:#64748b;font-size:11px;line-height:1.6;">You’re receiving this email because you have an account, subscription, or admin-triggered email flow inside <span style="color:#0f172a;font-weight:800;">NeuroTrader Journal</span>.</p>
                    <p style="margin:6px 0 0 0;color:#94a3b8;font-size:10px;line-height:1.6;">© ${new Date().getFullYear()} NeuroTrader Journal. All rights reserved.</p>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding:8px 0 16px 0;background:#ffffff;">
                    <div style="width:118px;height:4px;border-radius:999px;background:#cbd5e1;font-size:1px;line-height:1px;">&nbsp;</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

async function sendEmailBase({ to, from, subject, text, html, attachments }: SendEmailArgs) {
  if (!resend) {
    console.log("======================================");
    console.log("[EMAIL MOCK] To:", to);
    console.log("[EMAIL MOCK] Subject:", subject);
    if (text) console.log("[EMAIL MOCK] Text:\n", text);
    if (html) console.log("[EMAIL MOCK] HTML length:", html.length);
    if (attachments?.length) {
      console.log("[EMAIL MOCK] Attachments:", attachments.map((attachment) => attachment.filename).join(", "));
    }
    console.log("======================================");
    return;
  }

  try {
    await resend.emails.send({
      from: from || FROM_EMAIL,
      to,
      subject,
      text: text ?? "",
      html: html ?? "",
      attachments,
    });
  } catch (err) {
    console.error("[EMAIL] Error sending via Resend:", err);
    throw err;
  }
}

function buildEmailConfirmationContent(args: {
  email: string;
  name?: string | null;
  confirmationCode: string;
  continueUrl?: string | null;
}) : EmailContent {
  const safeName = args.name || "trader";
  const continueUrl = args.continueUrl || resolveAppUrl("/signup");
  const subject = "Confirm your NeuroTrader Journal account";
  const text = [
    `Hi ${safeName},`,
    "",
    "Welcome to NeuroTrader Journal.",
    "",
    `Your verification code is: ${args.confirmationCode}`,
    "",
    "Enter that code in the verification step to continue.",
    `If you prefer, open this link: ${continueUrl}`,
    "",
    "If you didn’t request this account, you can safely ignore this email.",
    "",
    "NeuroTrader Journal Team",
  ].join("\n");

  const html = buildNeuroTraderHtml({
    title: "Confirm your account",
    eyebrow: "Authentication",
    preheader: "Use your secure code to verify your NeuroTrader Journal account.",
    greeting: `Hi ${escapeHtml(safeName)},`,
    highlight: "Verify your email to unlock your journal, billing step, and onboarding flow.",
    code: args.confirmationCode,
    paragraphs: [
      "Use the verification code above inside NeuroTrader Journal to confirm your email and continue setup.",
      "Once verified, you can choose your plan, complete checkout, and enter your trading workspace.",
    ],
    facts: [
      { label: "Email", value: escapeHtml(args.email) },
      { label: "Flow", value: "Account confirmation" },
    ],
    ctaLabel: "Open verification step",
    ctaUrl: continueUrl,
    footerNote: "If this wasn’t you, you can ignore this email and no access will be granted.",
  });

  return { subject, text, html };
}

function buildPasswordResetContent(args: {
  email: string;
  name?: string | null;
  resetUrl: string;
}) : EmailContent {
  const safeName = args.name || "trader";
  const subject = "Reset your NeuroTrader Journal password";
  const text = [
    `Hi ${safeName},`,
    "",
    "We received a request to reset your NeuroTrader Journal password.",
    `Use this secure link to continue: ${args.resetUrl}`,
    "",
    "If you did not request a reset, you can ignore this email.",
    "",
    "NeuroTrader Journal Team",
  ].join("\n");

  const html = buildNeuroTraderHtml({
    title: "Reset your password",
    eyebrow: "Authentication",
    preheader: "Open your secure reset link to choose a new password.",
    greeting: `Hi ${escapeHtml(safeName)},`,
    highlight: "Your password reset link is ready.",
    paragraphs: [
      "Open the secure link below to set a new password and recover access to your NeuroTrader Journal account.",
      "For your safety, use the link from the device where you normally sign in.",
    ],
    facts: [
      { label: "Email", value: escapeHtml(args.email) },
      { label: "Request", value: "Password reset" },
    ],
    ctaLabel: "Reset password",
    ctaUrl: args.resetUrl,
    secondaryLabel: "Open sign in",
    secondaryUrl: resolveAppUrl("/signin"),
    footerNote: "If you didn’t request a password reset, no action is required.",
  });

  return { subject, text, html };
}

function buildAccountRecoveryContent(args: {
  email: string;
  name?: string | null;
  resetUrl: string;
}) : EmailContent {
  const safeName = args.name || "trader";
  const signInUrl = resolveAppUrl("/signin");
  const subject = "Your NeuroTrader Journal account details";
  const text = [
    `Hi ${safeName},`,
    "",
    "Here is the account we found for NeuroTrader Journal:",
    `Sign-in email: ${args.email}`,
    "",
    `If you also want to reset your password, use this secure link: ${args.resetUrl}`,
    `Sign in here: ${signInUrl}`,
    "",
    "NeuroTrader Journal Team",
  ].join("\n");

  const html = buildNeuroTraderHtml({
    title: "Account recovery",
    eyebrow: "Authentication",
    preheader: "We found your NeuroTrader Journal sign-in details.",
    greeting: `Hi ${escapeHtml(safeName)},`,
    highlight: `Your sign-in email is <strong>${escapeHtml(args.email)}</strong>.`,
    paragraphs: [
      "Use the sign-in email above to access NeuroTrader Journal.",
      "If you also need a new password, use the reset link below and choose a new one right away.",
    ],
    facts: [
      { label: "Sign-in email", value: escapeHtml(args.email) },
      { label: "Support", value: "support@neurotrader-journal.com" },
    ],
    ctaLabel: "Reset password",
    ctaUrl: args.resetUrl,
    secondaryLabel: "Open sign in",
    secondaryUrl: signInUrl,
    footerNote: "If you did not request account recovery, you can ignore this email.",
  });

  return { subject, text, html };
}

function buildWelcomeEmailContent(args: {
  email: string;
  name?: string | null;
  locale?: string | null;
}) : EmailContent {
  const safeName = args.name || "trader";
  const locale = normalizeEmailLocale(args.locale);
  const copy =
    locale === "es"
      ? {
          subject: "Bienvenido a NeuroTrader Journal",
          title: "Bienvenido a NeuroTrader Journal",
          eyebrow: "Inicio",
          preheader: "Tu nueva etapa como trader comienza ahora.",
          greeting: `Hola ${safeName},`,
          highlight: "Bienvenido a tu nueva etapa como trader.",
          paragraphs: [
            "Tu espacio de trabajo está listo para journaling estructurado, analytics y coaching de IA conectado a cómo realmente operas.",
            "Si sigues tus reglas, respetas tu plan y no permites que las emociones tomen el volante, puedes llegar muy lejos. La meta no es operar más; es operar con disciplina, contexto y ejecución repetible.",
            "Empieza registrando tus sesiones, marcando patrones emocionales y revisando tu ejecución con contexto.",
          ],
          factEmail: "Correo",
          ctaLabel: "Abrir dashboard",
          secondaryLabel: "Iniciar sesión",
          footerNote: "Si no creaste esta cuenta, puedes ignorar este email.",
          team: "Equipo de NeuroTrader Journal",
        }
      : {
          subject: "Welcome to NeuroTrader Journal",
          title: "Welcome to NeuroTrader Journal",
          eyebrow: "Lifecycle",
          preheader: "Your new trading journey starts now.",
          greeting: `Hi ${safeName},`,
          highlight: "Welcome to your new journey in trading.",
          paragraphs: [
            "Your workspace is ready for structured journaling, analytics, and AI coaching tied to how you actually trade.",
            "If you follow your rules, respect your plan, and do not let emotions take the wheel, you can go very far. The goal is not to trade more; it is to trade with discipline, context, and repeatable execution.",
            "Start logging your sessions, marking emotional patterns, and reviewing your execution with context.",
          ],
          factEmail: "Email",
          ctaLabel: "Open dashboard",
          secondaryLabel: "Open sign in",
          footerNote: "If you didn’t create this account, you can ignore this email.",
          team: "NeuroTrader Journal Team",
        };

  const subject = copy.subject;
  const text = [
    copy.greeting,
    "",
    copy.highlight,
    "",
    ...copy.paragraphs,
    "",
    resolveAppUrl("/signin"),
    "",
    copy.team,
  ].join("\n");

  const html = buildNeuroTraderHtml({
    title: copy.title,
    eyebrow: copy.eyebrow,
    preheader: copy.preheader,
    greeting: escapeHtml(copy.greeting),
    highlight: copy.highlight,
    paragraphs: copy.paragraphs,
    facts: [{ label: copy.factEmail, value: escapeHtml(args.email) }],
    ctaLabel: copy.ctaLabel,
    ctaUrl: resolveAppUrl("/dashboard"),
    secondaryLabel: copy.secondaryLabel,
    secondaryUrl: resolveAppUrl("/signin"),
    footerNote: copy.footerNote,
  });

  return { subject, text, html };
}

function buildInactivityReminderContent(args: {
  email: string;
  name?: string | null;
  daysInactive: InactivityReminderStage;
  locale?: string | null;
}) : EmailContent {
  const locale = normalizeEmailLocale(args.locale);
  const safeName = args.name || "trader";
  const daysLabel = `${args.daysInactive}+ ${locale === "es" ? "días" : "days"}`;
  const journalUrl = resolveAppUrl(`/journal/${formatTodayJournalDate()}`);
  const dashboardUrl = resolveAppUrl("/dashboard");

  const stageCopy = {
    en: {
      3: {
        subject: "Your trading journal is waiting for today's context",
        title: "Your process is waiting",
        preheader: "Three days away can blur the context. Log one clean update today.",
        highlight: "Three quiet days is enough for execution context to fade.",
        paragraphs: [
          "You have not opened NeuroTrader Journal for about 3 days. Before the week gets noisy, log one quick note: what changed, what you felt, and what rule matters next.",
          "The goal is not to catch up perfectly. It is to keep your Growth Plan connected to the trader you are becoming.",
        ],
        ctaLabel: "Open my journal",
        secondaryLabel: "Open dashboard",
        factLabel: "Inactive for",
      },
      15: {
        subject: "Reset your trading rhythm without guilt",
        title: "Reset without guilt",
        preheader: "A clean reset beats a silent gap. Start with one honest entry.",
        highlight: "You do not need to rebuild everything today. You only need one honest entry.",
        paragraphs: [
          "You have been away from NeuroTrader Journal for about 15 days. That gap matters because your Growth Plan needs fresh data: execution, emotions, mistakes, and wins.",
          "Open the journal, write what happened, and pick the next rule you will protect. Small honest resets are how disciplined traders get back in rhythm.",
        ],
        ctaLabel: "Restart my journal",
        secondaryLabel: "Review dashboard",
        factLabel: "Inactive for",
      },
      30: {
        subject: "Come back with one small trading entry",
        title: "One entry is enough",
        preheader: "After 30 days away, the next move is simple: log one session and rebuild from there.",
        highlight: "After a month away, the comeback starts with one small, structured entry.",
        paragraphs: [
          "You have been away from NeuroTrader Journal for about 30 days. No judgment. The danger is not the gap; it is letting the gap erase what your trading is teaching you.",
          "Open your journal and create one entry today. One session, one emotion, one rule, one next action. That is enough to reconnect with your plan.",
        ],
        ctaLabel: "Create one entry",
        secondaryLabel: "Open dashboard",
        factLabel: "Inactive for",
      },
    },
    es: {
      3: {
        subject: "Tu journal de trading está esperando el contexto de hoy",
        title: "Tu proceso te espera",
        preheader: "Tres días fuera pueden borrar contexto. Registra una nota limpia hoy.",
        highlight: "Tres días sin registrar es suficiente para que se pierda contexto de ejecución.",
        paragraphs: [
          "No has abierto NeuroTrader Journal en aproximadamente 3 días. Antes de que la semana se ponga ruidosa, registra una nota rápida: qué cambió, qué sentiste y qué regla importa ahora.",
          "La meta no es ponerte al día perfecto. La meta es mantener tu Growth Plan conectado con el trader en el que te estás convirtiendo.",
        ],
        ctaLabel: "Abrir mi journal",
        secondaryLabel: "Abrir dashboard",
        factLabel: "Inactivo por",
      },
      15: {
        subject: "Reinicia tu ritmo de trading sin culpa",
        title: "Reinicio sin culpa",
        preheader: "Un reinicio limpio vale más que un silencio largo. Empieza con una entrada honesta.",
        highlight: "No tienes que reconstruirlo todo hoy. Solo necesitas una entrada honesta.",
        paragraphs: [
          "Has estado fuera de NeuroTrader Journal por aproximadamente 15 días. Ese espacio importa porque tu Growth Plan necesita data fresca: ejecución, emociones, errores y victorias.",
          "Abre el journal, escribe qué pasó y elige la próxima regla que vas a proteger. Los reinicios pequeños y honestos son parte de volver al ritmo.",
        ],
        ctaLabel: "Reiniciar mi journal",
        secondaryLabel: "Revisar dashboard",
        factLabel: "Inactivo por",
      },
      30: {
        subject: "Vuelve con una entrada pequeña de trading",
        title: "Una entrada es suficiente",
        preheader: "Luego de 30 días fuera, el próximo paso es simple: registra una sesión y reconstruye desde ahí.",
        highlight: "Después de un mes fuera, el regreso empieza con una entrada pequeña y estructurada.",
        paragraphs: [
          "Has estado fuera de NeuroTrader Journal por aproximadamente 30 días. Sin juicio. El peligro no es el gap; es permitir que el gap borre lo que tu trading te está enseñando.",
          "Abre tu journal y crea una entrada hoy. Una sesión, una emoción, una regla, una próxima acción. Eso basta para reconectar con tu plan.",
        ],
        ctaLabel: "Crear una entrada",
        secondaryLabel: "Abrir dashboard",
        factLabel: "Inactivo por",
      },
    },
  } satisfies Record<EmailLocale, Record<InactivityReminderStage, {
    subject: string;
    title: string;
    preheader: string;
    highlight: string;
    paragraphs: string[];
    ctaLabel: string;
    secondaryLabel: string;
    factLabel: string;
  }>>;

  const copy = stageCopy[locale][args.daysInactive];
  const greeting = locale === "es" ? `Hola ${safeName},` : `Hi ${safeName},`;
  const team = locale === "es" ? "Equipo de NeuroTrader Journal" : "NeuroTrader Journal Team";
  const emailLabel = locale === "es" ? "Correo" : "Email";

  const text = [
    greeting,
    "",
    copy.highlight,
    "",
    ...copy.paragraphs,
    "",
    journalUrl,
    "",
    team,
  ].join("\n");

  const html = buildNeuroTraderHtml({
    title: copy.title,
    eyebrow: "Lifecycle",
    preheader: copy.preheader,
    greeting: escapeHtml(greeting),
    highlight: copy.highlight,
    paragraphs: copy.paragraphs,
    facts: [
      { label: copy.factLabel, value: escapeHtml(daysLabel) },
      { label: emailLabel, value: escapeHtml(args.email) },
    ],
    ctaLabel: copy.ctaLabel,
    ctaUrl: journalUrl,
    secondaryLabel: copy.secondaryLabel,
    secondaryUrl: dashboardUrl,
    footerNote:
      locale === "es"
        ? "Este recordatorio se detiene automáticamente cuando vuelves a entrar y registrar actividad."
        : "This reminder automatically resets once you return and create new activity.",
  });

  return { subject: copy.subject, text, html };
}

function buildSubscriptionReceiptContent(args: {
  email: string;
  name?: string | null;
  plan: PlanId | string;
  amount?: number;
  subscriptionId?: string;
  billingCycle?: string | null;
  invoiceNumber?: string | null;
  invoiceUrl?: string | null;
  chargeDate?: string | null;
}) : EmailContent {
  const safeName = args.name || "trader";
  const subject = "Your NeuroTrader Journal subscription receipt";
  const amountText = formatMoney(args.amount);
  const planLabel = formatPlanLabel(args.plan);
  const billingLabel = formatBillingCycleLabel(args.billingCycle);
  const chargeDateText = formatEmailDate(args.chargeDate);
  const text = [
    `Hi ${safeName},`,
    "",
    `Your ${planLabel} subscription payment was confirmed.`,
    `Amount: ${amountText}`,
    "A SG PAX Corp. PDF receipt is attached for your records.",
    billingLabel ? `Billing cycle: ${billingLabel}` : "",
    chargeDateText ? `Paid on: ${chargeDateText}` : "",
    args.invoiceNumber ? `Invoice: ${args.invoiceNumber}` : "",
    args.subscriptionId ? `Subscription ID: ${args.subscriptionId}` : "",
    "",
    args.invoiceUrl ? `Invoice: ${args.invoiceUrl}` : "",
    `Billing: ${resolveAppUrl("/billing")}`,
    "",
    "NeuroTrader Journal Team",
  ].filter(Boolean).join("\n");

  const html = buildNeuroTraderHtml({
    title: "Subscription receipt",
    eyebrow: "Billing",
    preheader: "Your subscription payment has been confirmed. PDF receipt attached.",
    greeting: `Hi ${escapeHtml(safeName)},`,
    highlight: `Your <strong>${escapeHtml(planLabel)}</strong>${billingLabel ? ` <strong>${escapeHtml(billingLabel.toLowerCase())}</strong>` : ""} payment was processed successfully. Your SG PAX Corp. PDF receipt is attached.`,
    paragraphs: [
      "Your subscription payment has been processed and your workspace remains active inside NeuroTrader Journal.",
      "The attached receipt is issued by SG PAX Corp. for NeuroTrader Journal subscription access.",
      "You can review billing details, plan changes, and renewal settings from the Billing section at any time.",
    ],
    facts: [
      { label: "Billed by", value: "SG PAX Corp." },
      { label: "Plan", value: escapeHtml(planLabel) },
      { label: "Amount", value: escapeHtml(amountText) },
      ...(billingLabel ? [{ label: "Billing", value: escapeHtml(billingLabel) }] : []),
      ...(chargeDateText ? [{ label: "Paid on", value: escapeHtml(chargeDateText) }] : []),
      ...(args.invoiceNumber ? [{ label: "Invoice", value: escapeHtml(args.invoiceNumber) }] : []),
      ...(args.subscriptionId ? [{ label: "Subscription", value: escapeHtml(args.subscriptionId) }] : []),
    ],
    ctaLabel: "Open billing",
    ctaUrl: resolveAppUrl("/billing/manage"),
    ...(args.invoiceUrl
      ? {
          secondaryLabel: "Open invoice",
          secondaryUrl: args.invoiceUrl,
        }
      : {}),
  });

  return { subject, text, html };
}

function buildSubscriptionConfirmationContent(args: {
  email: string;
  name?: string | null;
  plan: PlanId | string;
  billingCycle?: string | null;
  subscriptionId?: string | null;
}) : EmailContent {
  const safeName = args.name || "trader";
  const planLabel = formatPlanLabel(args.plan);
  const billingLabel = formatBillingCycleLabel(args.billingCycle);
  const subject = `Your ${planLabel} plan is active`;
  const text = [
    `Hi ${safeName},`,
    "",
    `Your NeuroTrader Journal ${planLabel} plan is active.`,
    billingLabel ? `Billing cycle: ${billingLabel}` : "",
    args.subscriptionId ? `Subscription ID: ${args.subscriptionId}` : "",
    "",
    `Open billing: ${resolveAppUrl("/billing")}`,
    `Open dashboard: ${resolveAppUrl("/dashboard")}`,
    "",
    "NeuroTrader Journal Team",
  ].filter(Boolean).join("\n");

  const html = buildNeuroTraderHtml({
    title: `${planLabel} plan confirmed`,
    eyebrow: "Billing",
    preheader: "Your subscription is active and ready to use.",
    greeting: `Hi ${escapeHtml(safeName)},`,
    highlight: `Your <strong>${escapeHtml(planLabel)}</strong> plan is now active${billingLabel ? ` on a <strong>${escapeHtml(billingLabel.toLowerCase())}</strong> cycle` : ""}.`,
    paragraphs: [
      "Your checkout finished successfully and your subscription is now active inside NeuroTrader Journal.",
      "From here, you can open your dashboard, review Billing, and start journaling without waiting on Stripe-hosted emails.",
    ],
    facts: [
      { label: "Plan", value: escapeHtml(planLabel) },
      ...(billingLabel ? [{ label: "Billing", value: escapeHtml(billingLabel) }] : []),
      ...(args.subscriptionId ? [{ label: "Subscription", value: escapeHtml(args.subscriptionId) }] : []),
      { label: "Email", value: escapeHtml(args.email) },
    ],
    ctaLabel: "Open dashboard",
    ctaUrl: resolveAppUrl("/dashboard"),
    secondaryLabel: "Open billing",
    secondaryUrl: resolveAppUrl("/billing"),
  });

  return { subject, text, html };
}

function buildSubscriptionRenewalReminderContent(args: {
  email: string;
  name?: string | null;
  plan: PlanId | string;
  amount?: number | null;
  billingCycle?: string | null;
  renewalDate?: string | null;
}) : EmailContent {
  const safeName = args.name || "trader";
  const planLabel = formatPlanLabel(args.plan);
  const billingLabel = formatBillingCycleLabel(args.billingCycle);
  const renewalDateText = formatEmailDate(args.renewalDate);
  const amountText = formatMoney(args.amount);
  const subject = `Upcoming renewal for your ${planLabel} plan`;
  const text = [
    `Hi ${safeName},`,
    "",
    `Your ${planLabel} plan is scheduled to renew${renewalDateText ? ` on ${renewalDateText}` : " soon"}.`,
    `Amount: ${amountText}`,
    billingLabel ? `Billing cycle: ${billingLabel}` : "",
    "",
    `Review billing: ${resolveAppUrl("/billing")}`,
    "",
    "NeuroTrader Journal Team",
  ].filter(Boolean).join("\n");

  const html = buildNeuroTraderHtml({
    title: "Renewal reminder",
    eyebrow: "Billing",
    preheader: "Your next subscription charge is coming up.",
    greeting: `Hi ${escapeHtml(safeName)},`,
    highlight: renewalDateText
      ? `Your <strong>${escapeHtml(planLabel)}</strong> plan is scheduled to renew on <strong>${escapeHtml(renewalDateText)}</strong>.`
      : `Your <strong>${escapeHtml(planLabel)}</strong> plan is scheduled to renew soon.`,
    paragraphs: [
      "This is a heads-up from NeuroTrader Journal so you can review your billing details before the next charge goes through.",
      "If you want to update your payment method, switch plans, or cancel before renewal, open Billing from the button below.",
    ],
    facts: [
      { label: "Plan", value: escapeHtml(planLabel) },
      { label: "Amount", value: escapeHtml(amountText) },
      ...(billingLabel ? [{ label: "Billing", value: escapeHtml(billingLabel) }] : []),
      ...(renewalDateText ? [{ label: "Renewal date", value: escapeHtml(renewalDateText) }] : []),
    ],
    ctaLabel: "Review billing",
    ctaUrl: resolveAppUrl("/billing"),
  });

  return { subject, text, html };
}

function buildSubscriptionPaymentIssueContent(args: {
  email: string;
  name?: string | null;
  plan: PlanId | string;
  amount?: number | null;
  billingCycle?: string | null;
  invoiceNumber?: string | null;
  invoiceUrl?: string | null;
  nextAttemptAt?: string | null;
}) : EmailContent {
  const safeName = args.name || "trader";
  const planLabel = formatPlanLabel(args.plan);
  const amountText = formatMoney(args.amount);
  const billingLabel = formatBillingCycleLabel(args.billingCycle);
  const nextAttemptText = formatEmailDate(args.nextAttemptAt);
  const subject = `Payment issue on your ${planLabel} plan`;
  const text = [
    `Hi ${safeName},`,
    "",
    `We couldn't process the latest payment for your ${planLabel} plan.`,
    `Amount: ${amountText}`,
    billingLabel ? `Billing cycle: ${billingLabel}` : "",
    args.invoiceNumber ? `Invoice: ${args.invoiceNumber}` : "",
    nextAttemptText ? `Next attempt: ${nextAttemptText}` : "",
    "",
    `Update billing: ${resolveAppUrl("/billing")}`,
    args.invoiceUrl ? `Invoice: ${args.invoiceUrl}` : "",
    "",
    "NeuroTrader Journal Team",
  ].filter(Boolean).join("\n");

  const html = buildNeuroTraderHtml({
    title: "Payment update needed",
    eyebrow: "Billing",
    preheader: "Your latest subscription payment needs attention.",
    greeting: `Hi ${escapeHtml(safeName)},`,
    highlight: `We couldn't process the latest payment for your <strong>${escapeHtml(planLabel)}</strong> plan.`,
    paragraphs: [
      "Please review your payment method so your subscription stays active without interruption.",
      nextAttemptText
        ? `Stripe will try again on <strong>${escapeHtml(nextAttemptText)}</strong> unless you update billing first.`
        : "Open Billing to update your payment method or review the invoice before the next retry.",
    ],
    facts: [
      { label: "Plan", value: escapeHtml(planLabel) },
      { label: "Amount", value: escapeHtml(amountText) },
      ...(billingLabel ? [{ label: "Billing", value: escapeHtml(billingLabel) }] : []),
      ...(args.invoiceNumber ? [{ label: "Invoice", value: escapeHtml(args.invoiceNumber) }] : []),
      ...(nextAttemptText ? [{ label: "Next attempt", value: escapeHtml(nextAttemptText) }] : []),
    ],
    ctaLabel: "Update billing",
    ctaUrl: resolveAppUrl("/billing/update-payment"),
    ...(args.invoiceUrl
      ? {
          secondaryLabel: "Open invoice",
          secondaryUrl: args.invoiceUrl,
        }
      : {}),
  });

  return { subject, text, html };
}

function buildSubscriptionPaymentMethodExpiringContent(args: {
  email: string;
  name?: string | null;
  plan?: PlanId | string | null;
  brand?: string | null;
  last4?: string | null;
  expMonth?: number | null;
  expYear?: number | null;
}) : EmailContent {
  const safeName = args.name || "trader";
  const planLabel = formatPlanLabel(args.plan || "advanced");
  const brand = args.brand ? args.brand.charAt(0).toUpperCase() + args.brand.slice(1) : "Card";
  const last4 = args.last4 ? `ending in ${args.last4}` : "on file";
  const expiry =
    args.expMonth && args.expYear
      ? `${String(args.expMonth).padStart(2, "0")}/${args.expYear}`
      : "soon";
  const subject = "Your NeuroTrader payment method expires soon";
  const text = [
    `Hi ${safeName},`,
    "",
    `Your ${brand} payment method ${last4} expires ${expiry}.`,
    `Plan: ${planLabel}`,
    "",
    "Please update your billing details before the next renewal so your NeuroTrader Journal access stays uninterrupted.",
    "",
    `Update billing: ${resolveAppUrl("/billing")}`,
    "",
    "NeuroTrader Journal Team",
  ].join("\n");

  const html = buildNeuroTraderHtml({
    title: "Payment method expiring",
    eyebrow: "Billing",
    preheader: "Update your card before it expires to avoid subscription interruption.",
    greeting: `Hi ${escapeHtml(safeName)},`,
    highlight: `Your <strong>${escapeHtml(brand)}</strong> payment method <strong>${escapeHtml(last4)}</strong> expires <strong>${escapeHtml(expiry)}</strong>.`,
    paragraphs: [
      "This is a proactive billing reminder from NeuroTrader Journal.",
      "Please update your payment method before the next renewal so your workspace, journal, analytics, and coaching access stay uninterrupted.",
    ],
    facts: [
      { label: "Plan", value: escapeHtml(planLabel) },
      { label: "Payment method", value: `${escapeHtml(brand)} ${escapeHtml(last4)}` },
      { label: "Expires", value: escapeHtml(expiry) },
    ],
    ctaLabel: "Update billing",
    ctaUrl: resolveAppUrl("/billing/update-payment"),
  });

  return { subject, text, html };
}

function buildSubscriptionCancellationContent(args: {
  email: string;
  name?: string | null;
  periodEnd?: string | null;
  nextBillingDate?: string | null;
}) : EmailContent {
  const safeName = args.name || "trader";
  const periodText = args.periodEnd ? new Date(args.periodEnd).toLocaleDateString("en-US") : "the end of your current billing period";
  const nextBillingText = args.nextBillingDate ? new Date(args.nextBillingDate).toLocaleDateString("en-US") : periodText;
  const subject = "Your NeuroTrader Journal cancellation is scheduled";
  const text = [
    `Hi ${safeName},`,
    "",
    "We are sorry to see you go.",
    `Next billing cycle date: ${nextBillingText}`,
    `Access remains active through: ${periodText}`,
    "",
    `Billing: ${resolveAppUrl("/billing")}`,
    "",
    "NeuroTrader Journal Team",
  ].join("\n");

  const html = buildNeuroTraderHtml({
    title: "Cancellation scheduled",
    eyebrow: "Billing",
    preheader: "Your membership remains active until the end of the current cycle.",
    greeting: `Hi ${escapeHtml(safeName)},`,
    highlight: `Access remains active through <strong>${escapeHtml(periodText)}</strong>.`,
    paragraphs: [
      `Your next billing cycle date was <strong>${escapeHtml(nextBillingText)}</strong>.`,
      "If you canceled today after a recent payment, your membership still remains active until the end of the current billing period.",
      "You can turn auto-renew back on at any time from Billing.",
    ],
    facts: [
      { label: "Next billing", value: escapeHtml(nextBillingText) },
      { label: "Active until", value: escapeHtml(periodText) },
    ],
    ctaLabel: "Open billing",
    ctaUrl: resolveAppUrl("/billing"),
  });

  return { subject, text, html };
}

function buildSubscriptionWinbackContent(args: {
  email: string;
  name?: string | null;
  promotionCode: string;
}) : EmailContent {
  const safeName = args.name || "trader";
  const subject = "Come back to NeuroTrader Journal with 50% off";
  const text = [
    `Hi ${safeName},`,
    "",
    "We’d love to have you back.",
    `Promo code: ${args.promotionCode}`,
    `Billing: ${resolveAppUrl("/billing")}`,
    "",
    "NeuroTrader Journal Team",
  ].join("\n");

  const html = buildNeuroTraderHtml({
    title: "50% off your return",
    eyebrow: "Lifecycle",
    preheader: "Your comeback code is ready.",
    greeting: `Hi ${escapeHtml(safeName)},`,
    highlight: `Promo code: <strong>${escapeHtml(args.promotionCode)}</strong>`,
    paragraphs: [
      "Use this code to return to NeuroTrader Journal with 50% off your next subscription.",
      "If you want help reactivating or choosing the right plan again, reply to this email and we’ll help.",
    ],
    facts: [
      { label: "Code", value: escapeHtml(args.promotionCode) },
      { label: "Offer", value: "50% off" },
    ],
    ctaLabel: "Resume subscription",
    ctaUrl: resolveAppUrl("/billing"),
  });

  return { subject, text, html };
}

function buildProfitLossAlertContent(args: {
  email: string;
  name?: string | null;
  title: string;
  message: string;
  alertKind: "renewal" | "overspend" | "variable_cost";
  ctaUrl?: string | null;
  detailLines?: string[];
}) : EmailContent {
  const safeName = args.name || "trader";
  const ctaUrl = args.ctaUrl || resolveAppUrl("/performance/profit-loss-track");
  const subject = `Profit & Loss Track: ${args.title}`;
  const details = (args.detailLines ?? []).filter(Boolean);
  const highlight =
    args.alertKind === "renewal"
      ? "A recurring cost is about to renew."
      : args.alertKind === "overspend"
        ? "A category moved above budget."
        : "Trading costs moved above your threshold.";

  const text = [
    `Hi ${safeName},`,
    "",
    args.message,
    ...(details.length ? ["", ...details] : []),
    "",
    ctaUrl,
    "",
    "NeuroTrader Journal Team",
  ].join("\n");

  const html = buildNeuroTraderHtml({
    title: args.title,
    eyebrow: "Operations",
    preheader: args.message,
    greeting: `Hi ${escapeHtml(safeName)},`,
    highlight,
    paragraphs: [
      args.message,
      ...(details.length ? [details.map((line) => `• ${escapeHtml(line)}`).join("<br />")] : []),
      "Open Profit &amp; Loss Track to review the issue and adjust your stack, budget, or controls.",
    ],
    ctaLabel: "Open Profit & Loss Track",
    ctaUrl,
  });

  return { subject, text, html };
}


export function getEmailSenderStatus() {
  return {
    from: FROM_EMAIL,
    authFrom: AUTH_FROM_EMAIL,
    provider: "Resend",
    configured: Boolean(process.env.RESEND_API_KEY),
  };
}

function getBroadcastTemplateMeta(templateKey?: AdminBroadcastTemplateKey) {
  if (!templateKey || templateKey === "custom_broadcast") {
    return {
      category: "Operations" as const,
      label: "System announcement",
      description: "General platform broadcast",
    };
  }

  const row = getAutomatedEmailCatalog().find((item) => item.key === templateKey);
  if (row) {
    return {
      category: row.category,
      label: row.name,
      description: row.description,
    };
  }

  return {
    category: "Operations" as const,
    label: "System announcement",
    description: "General platform broadcast",
  };
}

function buildAdminBroadcastContent(args: AdminBroadcastArgs): EmailContent {
  const locale = normalizeEmailLocale(args.locale);
  const templateMeta = getBroadcastTemplateMeta(args.templateKey);
  const greeting = locale === "es" ? "Hola trader," : "Hi trader,";
  const categoryLabel =
    locale === "es"
      ? templateMeta.category === "Authentication"
        ? "Autenticación"
        : templateMeta.category === "Billing"
          ? "Billing"
          : templateMeta.category === "Lifecycle"
            ? "Lifecycle"
            : "Comunicado"
      : templateMeta.category === "Operations"
        ? "Announcement"
        : templateMeta.category;
  const paragraphs = String(args.message || "")
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean);

  const safeParagraphs =
    paragraphs.length > 0
      ? paragraphs
      : [
          locale === "es"
            ? "Este mensaje fue enviado manualmente desde el centro admin."
            : "This message was sent manually from the admin center.",
        ];

  const text = [
    greeting,
    "",
    args.highlight ? args.highlight.trim() : "",
    "",
    ...safeParagraphs,
    "",
    args.ctaLabel && args.ctaUrl ? `${args.ctaLabel}: ${args.ctaUrl}` : "",
    "",
    locale === "es" ? "Equipo de NeuroTrader Journal" : "NeuroTrader Journal Team",
  ]
    .filter(Boolean)
    .join("\n");

  const html = buildNeuroTraderHtml({
    title: args.title,
    eyebrow: `${categoryLabel} · ${templateMeta.label}`,
    preheader: safeParagraphs.join(" ").slice(0, 140),
    greeting,
    highlight: args.highlight?.trim() || undefined,
    paragraphs: safeParagraphs,
    ctaLabel: args.ctaLabel?.trim() || undefined,
    ctaUrl: args.ctaUrl?.trim() || undefined,
    footerNote:
      args.footerNote?.trim() ||
      (locale === "es"
        ? "Recibes este email porque tienes una cuenta activa dentro de NeuroTrader Journal."
        : "You’re receiving this email because you have an active account inside NeuroTrader Journal."),
  });

  return {
    subject: args.subject,
    text,
    html,
  };
}

export function getAutomatedEmailCatalog(): AutomatedEmailPreview[] {
  return [
    {
      key: "email_confirmation",
      category: "Authentication",
      name: "Email confirmation",
      description: "Sent when a new user creates an account and needs to verify the email before continuing.",
      trigger: "New account created",
      delivery: "Resend via app signup API",
      from: AUTH_FROM_EMAIL,
      preview: buildEmailConfirmationContent({
        email: "trader@example.com",
        name: "Steven",
        confirmationCode: "682941",
        continueUrl: resolveAppUrl("/signup"),
      }),
    },
    {
      key: "password_reset",
      category: "Authentication",
      name: "Password reset",
      description: "Sent when a user requests a secure link to choose a new password.",
      trigger: "Forgot password request",
      delivery: "Resend via auth recovery route",
      from: AUTH_FROM_EMAIL,
      preview: buildPasswordResetContent({
        email: "trader@example.com",
        name: "Steven",
        resetUrl: resolveAppUrl("/reset-password?preview=1"),
      }),
    },
    {
      key: "account_recovery",
      category: "Authentication",
      name: "Account recovery",
      description: "Sent when a user requests a reminder of the sign-in email plus a reset shortcut.",
      trigger: "Account recovery request",
      delivery: "Resend via recovery route",
      from: AUTH_FROM_EMAIL,
      preview: buildAccountRecoveryContent({
        email: "steven.otero.velez@icloud.com",
        name: "Steven",
        resetUrl: resolveAppUrl("/reset-password?preview=1"),
      }),
    },
    {
      key: "welcome",
      category: "Lifecycle",
      name: "Welcome",
      description: "Sent when a subscription or manual access becomes active.",
      trigger: "Account activated",
      delivery: "Resend",
      from: FROM_EMAIL,
      preview: buildWelcomeEmailContent({ email: "trader@example.com", name: "Steven" }),
    },
    {
      key: "inactivity_3_day",
      category: "Lifecycle",
      name: "3-day inactivity",
      description: "Sent when a trader has not opened the platform for 3+ days.",
      trigger: "Daily inactivity cron",
      delivery: "Resend via Vercel cron",
      from: FROM_EMAIL,
      preview: buildInactivityReminderContent({
        email: "trader@example.com",
        name: "Steven",
        daysInactive: 3,
      }),
    },
    {
      key: "inactivity_15_day",
      category: "Lifecycle",
      name: "15-day inactivity",
      description: "Sent when a trader has not opened the platform for 15+ days and needs a clean reset.",
      trigger: "Daily inactivity cron",
      delivery: "Resend via Vercel cron",
      from: FROM_EMAIL,
      preview: buildInactivityReminderContent({
        email: "trader@example.com",
        name: "Steven",
        daysInactive: 15,
      }),
    },
    {
      key: "inactivity_30_day",
      category: "Lifecycle",
      name: "30-day inactivity",
      description: "Sent when a trader has been away for 30+ days and should restart with one entry.",
      trigger: "Daily inactivity cron",
      delivery: "Resend via Vercel cron",
      from: FROM_EMAIL,
      preview: buildInactivityReminderContent({
        email: "trader@example.com",
        name: "Steven",
        daysInactive: 30,
      }),
    },
    {
      key: "subscription_confirmation",
      category: "Billing",
      name: "Subscription confirmation",
      description: "Sent right after checkout so the user sees a branded confirmation from the platform instead of a plain Stripe-only message.",
      trigger: "Stripe checkout completed",
      delivery: "Resend via Stripe webhook",
      from: FROM_EMAIL,
      preview: buildSubscriptionConfirmationContent({
        email: "trader@example.com",
        name: "Steven",
        plan: "advanced",
        billingCycle: "monthly",
        subscriptionId: "sub_123456789",
      }),
    },
    {
      key: "subscription_receipt",
      category: "Billing",
      name: "Subscription receipt",
      description: "Sent after a successful subscription purchase or renewal.",
      trigger: "Stripe invoice.paid",
      delivery: "Resend via Stripe webhook",
      from: FROM_EMAIL,
      preview: buildSubscriptionReceiptContent({
        email: "trader@example.com",
        name: "Steven",
        plan: "advanced",
        amount: 26.99,
        billingCycle: "monthly",
        subscriptionId: "sub_123456789",
        invoiceNumber: "7D8E2A9-0005",
        chargeDate: new Date().toISOString(),
        invoiceUrl: resolveAppUrl("/billing"),
      }),
    },
    {
      key: "subscription_renewal_reminder",
      category: "Billing",
      name: "Renewal reminder",
      description: "Sent before the next subscription charge so the user can review billing inside the app instead of relying on Stripe reminders.",
      trigger: "Stripe invoice.upcoming",
      delivery: "Resend via Stripe webhook",
      from: FROM_EMAIL,
      preview: buildSubscriptionRenewalReminderContent({
        email: "trader@example.com",
        name: "Steven",
        plan: "advanced",
        amount: 26.99,
        billingCycle: "monthly",
        renewalDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      }),
    },
    {
      key: "subscription_payment_issue",
      category: "Billing",
      name: "Payment issue",
      description: "Sent when Stripe cannot collect a subscription payment and the user needs to update billing.",
      trigger: "Stripe invoice.payment_failed",
      delivery: "Resend via Stripe webhook",
      from: FROM_EMAIL,
      preview: buildSubscriptionPaymentIssueContent({
        email: "trader@example.com",
        name: "Steven",
        plan: "advanced",
        amount: 26.99,
        billingCycle: "monthly",
        invoiceNumber: "7D8E2A9-0006",
        nextAttemptAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
        invoiceUrl: resolveAppUrl("/billing"),
      }),
    },
    {
      key: "subscription_payment_method_expiring",
      category: "Billing",
      name: "Payment method expiring",
      description: "Sent when the user’s default card is close to expiration so Stripe’s expiring-card email can stay disabled.",
      trigger: "Daily Stripe payment-method scan",
      delivery: "Resend via Vercel cron",
      from: FROM_EMAIL,
      preview: buildSubscriptionPaymentMethodExpiringContent({
        email: "trader@example.com",
        name: "Steven",
        plan: "advanced",
        brand: "visa",
        last4: "4242",
        expMonth: 5,
        expYear: new Date().getFullYear(),
      }),
    },
    {
      key: "subscription_cancellation",
      category: "Billing",
      name: "Cancellation scheduled",
      description: "Sent after the user confirms cancellation and keeps access until period end.",
      trigger: "Billing cancellation confirmed",
      delivery: "Resend",
      from: FROM_EMAIL,
      preview: buildSubscriptionCancellationContent({
        email: "trader@example.com",
        name: "Steven",
        periodEnd: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000).toISOString(),
        nextBillingDate: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000).toISOString(),
      }),
    },
    {
      key: "subscription_winback",
      category: "Lifecycle",
      name: "Winback 50%",
      description: "Sent to returning users after cancellation as a comeback campaign.",
      trigger: "Winback cron / lifecycle campaign",
      delivery: "Resend",
      from: FROM_EMAIL,
      preview: buildSubscriptionWinbackContent({
        email: "trader@example.com",
        name: "Steven",
        promotionCode: "COME-BACK-50",
      }),
    },
    {
      key: "profit_loss_alert",
      category: "Operations",
      name: "Profit & Loss alert",
      description: "Sent when a renewal, overspend, or variable cost threshold is triggered.",
      trigger: "Profit & Loss controls",
      delivery: "Resend",
      from: FROM_EMAIL,
      preview: buildProfitLossAlertContent({
        email: "trader@example.com",
        name: "Steven",
        title: "Budget drift detected",
        message: "Your education category moved above budget this month.",
        alertKind: "overspend",
        detailLines: ["Budget to date: $120", "Actual spend: $178", "Main driver: mentoring"],
      }),
    },
  ];
}

export async function sendAutomatedEmailTest(args: {
  key: AutomatedEmailKey;
  to: string;
}) {
  const email = args.to.trim().toLowerCase();
  switch (args.key) {
    case "email_confirmation":
      return sendEmailConfirmationEmail({
        email,
        name: "Admin preview",
        confirmationCode: "682941",
        continueUrl: resolveAppUrl("/signup"),
      });
    case "password_reset":
      return sendPasswordResetEmail({
        email,
        name: "Admin preview",
        resetUrl: resolveAppUrl("/reset-password?preview=1"),
      });
    case "account_recovery":
      return sendAccountRecoveryEmail({
        email,
        name: "Admin preview",
        accountEmail: email,
        resetUrl: resolveAppUrl("/reset-password?preview=1"),
      });
    case "welcome":
      return sendWelcomeEmailByEmail(email, "Admin preview");
    case "inactivity_3_day":
      return sendInactivityReminderEmail({
        email,
        name: "Admin preview",
        daysInactive: 3,
      });
    case "inactivity_15_day":
      return sendInactivityReminderEmail({
        email,
        name: "Admin preview",
        daysInactive: 15,
      });
    case "inactivity_30_day":
      return sendInactivityReminderEmail({
        email,
        name: "Admin preview",
        daysInactive: 30,
      });
    case "subscription_confirmation":
      return sendSubscriptionConfirmationEmailByEmail({
        email,
        name: "Admin preview",
        plan: "advanced",
        billingCycle: "monthly",
        subscriptionId: "sub_preview_001",
      });
    case "subscription_receipt":
      return sendSubscriptionReceiptEmailByEmail({
        email,
        name: "Admin preview",
        plan: "advanced",
        amount: 26.99,
        billingCycle: "monthly",
        subscriptionId: "sub_preview_001",
        invoiceNumber: "7D8E2A9-0005",
        invoiceUrl: resolveAppUrl("/billing"),
        chargeDate: new Date().toISOString(),
      });
    case "subscription_renewal_reminder":
      return sendSubscriptionRenewalReminderEmail({
        email,
        name: "Admin preview",
        plan: "advanced",
        amount: 26.99,
        billingCycle: "monthly",
        renewalDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      });
    case "subscription_payment_issue":
      return sendSubscriptionPaymentIssueEmail({
        email,
        name: "Admin preview",
        plan: "advanced",
        amount: 26.99,
        billingCycle: "monthly",
        invoiceNumber: "7D8E2A9-0006",
        nextAttemptAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
        invoiceUrl: resolveAppUrl("/billing"),
      });
    case "subscription_payment_method_expiring":
      return sendSubscriptionPaymentMethodExpiringEmail({
        email,
        name: "Admin preview",
        plan: "advanced",
        brand: "visa",
        last4: "4242",
        expMonth: 5,
        expYear: new Date().getFullYear(),
      });
    case "subscription_cancellation":
      return sendSubscriptionCancellationEmail({
        email,
        name: "Admin preview",
        periodEnd: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
        nextBillingDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
      });
    case "subscription_winback":
      return sendSubscriptionWinbackEmail({
        email,
        name: "Admin preview",
        promotionCode: "COME-BACK-50",
      });
    case "profit_loss_alert":
      return sendProfitLossAlertEmail({
        email,
        name: "Admin preview",
        title: "Preview alert",
        message: "This is a test of the Profit & Loss alert template.",
        alertKind: "overspend",
        detailLines: ["Budget to date: $120", "Actual spend: $178"],
      });
    default:
      throw new Error(`Unsupported email key: ${args.key}`);
  }
}

export async function sendAdminBroadcastEmail(args: AdminBroadcastArgs) {
  const content = buildAdminBroadcastContent(args);
  await sendEmailBase({
    to: args.to.trim().toLowerCase(),
    from: FROM_EMAIL,
    ...content,
  });
}

export async function sendAdminBroadcastToAllUsers(
  args: Omit<AdminBroadcastArgs, "to">
) {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("email")
    .not("email", "is", null);

  if (error) throw error;

  const recipients = Array.from(
    new Set(
      (data ?? [])
        .map((row: any) => String(row?.email ?? "").trim().toLowerCase())
        .filter((email) => email && email.includes("@"))
    )
  );

  let sent = 0;
  const failed: string[] = [];
  const chunkSize = 20;

  for (let index = 0; index < recipients.length; index += chunkSize) {
    const chunk = recipients.slice(index, index + chunkSize);
    const results = await Promise.allSettled(
      chunk.map((email) =>
        sendAdminBroadcastEmail({
          ...args,
          to: email,
        })
      )
    );

    results.forEach((result, chunkIndex) => {
      if (result.status === "fulfilled") {
        sent += 1;
      } else {
        failed.push(chunk[chunkIndex]);
        console.error("[email] broadcast send failure:", chunk[chunkIndex], result.reason);
      }
    });
  }

  return {
    total: recipients.length,
    sent,
    failed: failed.length,
    failedRecipients: failed.slice(0, 20),
  };
}

export async function sendEmailConfirmationEmail(args: {
  email: string;
  name?: string | null;
  confirmationCode: string;
  continueUrl?: string | null;
}) {
  const content = buildEmailConfirmationContent(args);
  await sendEmailBase({ to: args.email, from: AUTH_FROM_EMAIL, ...content });
}

export async function sendPasswordResetEmail(args: {
  email: string;
  name?: string | null;
  resetUrl: string;
}) {
  const content = buildPasswordResetContent(args);
  await sendEmailBase({ to: args.email, from: AUTH_FROM_EMAIL, ...content });
}

export async function sendAccountRecoveryEmail(args: {
  email: string;
  name?: string | null;
  accountEmail: string;
  resetUrl: string;
}) {
  const content = buildAccountRecoveryContent({
    email: args.accountEmail,
    name: args.name,
    resetUrl: args.resetUrl,
  });
  await sendEmailBase({ to: args.email, from: AUTH_FROM_EMAIL, ...content });
}

export async function sendWelcomeEmail(user: AppUser) {
  const locale = await resolveEmailLocale({ userId: user.id, email: user.email });
  const content = buildWelcomeEmailContent({ email: user.email, name: user.name || "trader", locale });
  await sendEmailBase({ to: user.email, ...content });
}

export async function sendSubscriptionReceiptEmail(user: AppUser, plan: PlanId) {
  const content = buildSubscriptionReceiptContent({ email: user.email, name: user.name || "trader", plan });
  const receiptPdf = buildSubscriptionReceiptPdfAttachment({
    email: user.email,
    name: user.name || "trader",
    plan,
  });
  await sendEmailBase({ to: user.email, ...content, attachments: [receiptPdf] });
}

export async function sendBetaRequestEmail(args: { name: string; email: string }) {
  const { name, email } = args;
  const subject = `Option Flow beta access request - ${email}`;
  const text = [
    "New NeuroTrader Journal Option Flow beta access request:",
    "",
    `Name: ${name}`,
    `Email: ${email}`,
    "",
    "Next steps (Admin Center):",
    "1) Open Admin Center.",
    "2) Create / update the user access grants for this email.",
    "3) Enable the `option_flow` grant when you want to approve access.",
  ].join("\n");

  await sendEmailBase({
    to: "support@neurotrader-journal.com",
    subject,
    text,
  });
}

export async function sendWelcomeEmailByEmail(email: string, name?: string | null, locale?: string | null) {
  const resolvedLocale = await resolveEmailLocale({ email, fallback: locale });
  const content = buildWelcomeEmailContent({ email, name, locale: resolvedLocale });
  await sendEmailBase({ to: email, ...content });
}

export async function sendInactivityReminderEmail(args: {
  email: string;
  name?: string | null;
  userId?: string | null;
  daysInactive: InactivityReminderStage;
  locale?: string | null;
}) {
  const resolvedLocale = await resolveEmailLocale({
    userId: args.userId,
    email: args.email,
    fallback: args.locale,
  });
  const content = buildInactivityReminderContent({ ...args, locale: resolvedLocale });
  await sendEmailBase({ to: args.email, ...content });
}

export async function sendSubscriptionConfirmationEmailByEmail(args: {
  email: string;
  name?: string | null;
  plan: PlanId | string;
  billingCycle?: string | null;
  subscriptionId?: string | null;
}) {
  const content = buildSubscriptionConfirmationContent(args);
  await sendEmailBase({ to: args.email, ...content });
}

export async function sendSubscriptionReceiptEmailByEmail(args: {
  email: string;
  plan: PlanId | string;
  amount?: number;
  subscriptionId?: string;
  name?: string | null;
  billingCycle?: string | null;
  invoiceNumber?: string | null;
  invoiceUrl?: string | null;
  chargeDate?: string | null;
}) {
  const content = buildSubscriptionReceiptContent(args);
  const receiptPdf = buildSubscriptionReceiptPdfAttachment(args);
  await sendEmailBase({ to: args.email, ...content, attachments: [receiptPdf] });
}

export async function sendSubscriptionRenewalReminderEmail(args: {
  email: string;
  name?: string | null;
  plan: PlanId | string;
  amount?: number | null;
  billingCycle?: string | null;
  renewalDate?: string | null;
}) {
  const content = buildSubscriptionRenewalReminderContent(args);
  await sendEmailBase({ to: args.email, ...content });
}

export async function sendSubscriptionPaymentIssueEmail(args: {
  email: string;
  name?: string | null;
  plan: PlanId | string;
  amount?: number | null;
  billingCycle?: string | null;
  invoiceNumber?: string | null;
  invoiceUrl?: string | null;
  nextAttemptAt?: string | null;
}) {
  const content = buildSubscriptionPaymentIssueContent(args);
  await sendEmailBase({ to: args.email, ...content });
}

export async function sendSubscriptionPaymentMethodExpiringEmail(args: {
  email: string;
  name?: string | null;
  plan?: PlanId | string | null;
  brand?: string | null;
  last4?: string | null;
  expMonth?: number | null;
  expYear?: number | null;
}) {
  const content = buildSubscriptionPaymentMethodExpiringContent(args);
  await sendEmailBase({ to: args.email, ...content });
}

export async function sendSubscriptionCancellationEmail(args: {
  email: string;
  name?: string | null;
  periodEnd?: string | null;
  nextBillingDate?: string | null;
}) {
  const content = buildSubscriptionCancellationContent(args);
  await sendEmailBase({ to: args.email, ...content });
}

export async function sendSubscriptionWinbackEmail(args: {
  email: string;
  name?: string | null;
  promotionCode: string;
}) {
  const content = buildSubscriptionWinbackContent(args);
  await sendEmailBase({ to: args.email, ...content });
}

export async function sendProfitLossAlertEmail(args: {
  email: string;
  name?: string | null;
  title: string;
  message: string;
  alertKind: "renewal" | "overspend" | "variable_cost";
  ctaUrl?: string | null;
  detailLines?: string[];
}) {
  const content = buildProfitLossAlertContent(args);
  await sendEmailBase({ to: args.email, ...content });
}
