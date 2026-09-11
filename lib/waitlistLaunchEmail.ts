import "server-only";

import { Resend } from "resend";

import { WAITLIST_CAMPAIGN } from "@/lib/waitlistCampaign";

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  "https://www.neurotrader-journal.com";
const FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL ||
  process.env.EMAIL_FROM ||
  "NeuroTrader <support@neurotrader-journal.com>";
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export type WaitlistLaunchEmailRecipient = {
  email: string;
  name?: string | null;
  position?: number | null;
};

export type WaitlistLaunchEmailContent = {
  subject: string;
  text: string;
  html: string;
};

function escapeHtml(value: string) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function resolveAnnualDiscountUrl() {
  const configuredUrl = process.env.WAITLIST_ANNUAL_PROMO_URL?.trim();
  if (configuredUrl) return configuredUrl;

  const url = new URL("/pricing", APP_URL);
  url.searchParams.set("billing", "annual");
  url.searchParams.set("waitlist", "annual30");
  const promoCode = getWaitlistLaunchPromoCode();
  if (promoCode) url.searchParams.set("promo", promoCode);
  return url.toString();
}

export function getWaitlistLaunchPromoCode() {
  return process.env.WAITLIST_ANNUAL_PROMO_CODE?.trim() || "";
}

export function getWaitlistLaunchEmailStatus() {
  return {
    from: FROM_EMAIL,
    configured: Boolean(resend),
    launchDateIso: WAITLIST_CAMPAIGN.launchDateIso,
    launchDateLabel: WAITLIST_CAMPAIGN.launchDateTimeLabel,
    discountUrl: resolveAnnualDiscountUrl(),
    promoCode: getWaitlistLaunchPromoCode(),
    promotionConfigured: Boolean(getWaitlistLaunchPromoCode()),
  };
}

export function buildWaitlistLaunchDiscountEmail(
  recipient: WaitlistLaunchEmailRecipient
): WaitlistLaunchEmailContent {
  const name = recipient.name?.trim() || "Trader Entrepreneur";
  const safeName = escapeHtml(name);
  const discountUrl = resolveAnnualDiscountUrl();
  const safeDiscountUrl = escapeHtml(discountUrl);
  const configuredPromoCode = getWaitlistLaunchPromoCode();
  const promoCode = configuredPromoCode || "NEURO30-PREVIEW";
  const codeLine = promoCode
    ? `Your launch code is ${promoCode}${configuredPromoCode ? "." : " (preview only)."}`
    : "Use the annual discount access link in this email.";
  const positionLine = recipient.position
    ? `Your waitlist position: #${recipient.position}.`
    : "Your registration is within the eligible launch group.";

  const subject = "Your NeuroTrader annual launch discount is ready";
  const text = [
    `Hi ${name},`,
    "",
    "NeuroTrader launch access is ready.",
    `You are receiving this because you joined the launch waitlist and qualified within the first ${WAITLIST_CAMPAIGN.discountLimit} annual discount spots.`,
    positionLine,
    `Your annual plan discount: ${WAITLIST_CAMPAIGN.discountPercent}%.`,
    codeLine,
    "",
    `Open launch access: ${discountUrl}`,
    "",
    "NeuroTrader is educational software for trading business structure, execution review, risk controls, analytics, simulation, and accountability. It does not provide financial advice and does not guarantee trading results, income, or capital growth.",
  ].join("\n");

  const codeHtml = promoCode
    ? `<p style="margin:14px 0 0 0;font-size:14px;color:#0f172a">Your launch code: <strong style="letter-spacing:0.08em">${escapeHtml(promoCode)}</strong>${configuredPromoCode ? "" : " <span style=\"color:#b45309\">(preview only)</span>"}</p>`
    : "";

  const html = `
    <!doctype html>
    <html lang="en">
      <head><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
      <body style="margin:0;background:#020617;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
        <div style="display:none;max-height:0;overflow:hidden">Your 30% annual launch discount is ready.</div>
        <table width="100%" role="presentation" cellspacing="0" cellpadding="0" style="max-width:620px;margin:0 auto">
          <tr>
            <td style="border:1px solid #1e293b;border-radius:18px;overflow:hidden;background:#ffffff">
              <div style="padding:22px 26px;background:#07111d;border-bottom:3px solid #34d399">
                <div style="color:#5eead4;font-size:12px;font-weight:800;letter-spacing:0.18em;text-transform:uppercase">NeuroTrader</div>
                <div style="margin-top:7px;color:#94a3b8;font-size:12px">Trading Business Operating System</div>
              </div>
              <div style="padding:30px 26px 26px 26px;line-height:1.6">
                <div style="color:#047857;font-size:11px;font-weight:900;letter-spacing:0.16em;text-transform:uppercase">Launch access</div>
                <h1 style="margin:9px 0 14px 0;color:#0f172a;font-size:28px;line-height:1.2">Your annual launch discount is ready</h1>
                <p style="margin:0 0 12px 0">Hi ${safeName},</p>
                <p style="margin:0 0 12px 0">NeuroTrader launch access is ready.</p>
                <p style="margin:0 0 12px 0">You joined the launch waitlist and qualified within the first ${WAITLIST_CAMPAIGN.discountLimit} annual discount spots.</p>
                <div style="margin:18px 0;padding:18px;border:1px solid #99f6e4;border-radius:12px;background:#ecfdf5">
                  <p style="margin:0;color:#064e3b;font-size:21px;font-weight:800">${WAITLIST_CAMPAIGN.discountPercent}% off the annual plan</p>
                  <p style="margin:6px 0 0 0;color:#047857;font-size:13px">${escapeHtml(positionLine)}</p>
                  ${codeHtml}
                  <p style="margin:16px 0 0 0">
                    <a href="${safeDiscountUrl}" style="display:inline-block;border-radius:8px;background:#10b981;color:#04111d;padding:12px 18px;font-weight:800;text-decoration:none">Open annual discount access</a>
                  </p>
                </div>
                <p style="margin:0;color:#475569;font-size:12px;line-height:1.65">NeuroTrader is educational software for trading business structure, execution review, risk controls, analytics, simulation, and accountability. It does not provide financial advice and does not guarantee trading results, income, or capital growth.</p>
              </div>
              <div style="padding:16px 26px;border-top:1px solid #e2e8f0;background:#f8fafc;color:#64748b;font-size:11px;line-height:1.6">
                You are receiving this email because you registered for the NeuroTrader launch waitlist.
              </div>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;

  return { subject, text, html };
}

export async function sendWaitlistLaunchDiscountEmail(
  recipient: WaitlistLaunchEmailRecipient
) {
  if (!resend) {
    throw new Error("Resend is not configured.");
  }

  const content = buildWaitlistLaunchDiscountEmail(recipient);
  const result = await resend.emails.send({
    from: FROM_EMAIL,
    to: recipient.email.trim().toLowerCase(),
    ...content,
  });

  if (result.error) {
    throw new Error(result.error.message || "Resend rejected the email request.");
  }

  return result.data;
}
