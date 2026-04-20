import { AppUser, PlanId } from "./types";
import { Resend } from "resend";

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  "https://neurotrader-journal.com";

const FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL ||
  "NeuroTrader Journal <support@neurotrader-journal.com>";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

type SendEmailArgs = {
  to: string;
  subject: string;
  text?: string;
  html?: string;
};

type EmailContent = {
  subject: string;
  text: string;
  html: string;
};

export type AutomatedEmailKey =
  | "email_confirmation"
  | "password_reset"
  | "account_recovery"
  | "welcome"
  | "subscription_confirmation"
  | "subscription_receipt"
  | "subscription_renewal_reminder"
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
    ? `<div style="margin:18px 0 6px 0;border:1px solid #99f6e4;border-radius:22px;background:linear-gradient(180deg,#ecfdf5 0%,#f0fdfa 100%);padding:18px 18px 16px 18px;">
         <div style="font-size:10px;letter-spacing:0.24em;text-transform:uppercase;color:#0f766e;margin:0 0 8px 0;font-weight:800;">Verification code</div>
         <div style="font-size:34px;line-height:1;font-weight:900;letter-spacing:0.28em;color:#062f2b;">${escapeHtml(code)}</div>
         <div style="margin-top:10px;color:#475569;font-size:12px;line-height:1.6;">Enter this code inside NeuroTrader Journal to continue.</div>
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

async function sendEmailBase({ to, subject, text, html }: SendEmailArgs) {
  if (!resend) {
    console.log("======================================");
    console.log("[EMAIL MOCK] To:", to);
    console.log("[EMAIL MOCK] Subject:", subject);
    if (text) console.log("[EMAIL MOCK] Text:\n", text);
    if (html) console.log("[EMAIL MOCK] HTML length:", html.length);
    console.log("======================================");
    return;
  }

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      text: text ?? "",
      html: html ?? "",
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
}) : EmailContent {
  const safeName = args.name || "trader";
  const subject = "Welcome to NeuroTrader Journal";
  const text = [
    `Hi ${safeName},`,
    "",
    "Welcome to NeuroTrader Journal.",
    "",
    "Your trading workspace is ready. Log in to start journaling your trades, reviewing analytics, and building real process memory.",
    resolveAppUrl("/signin"),
    "",
    "NeuroTrader Journal Team",
  ].join("\n");

  const html = buildNeuroTraderHtml({
    title: "Welcome to NeuroTrader Journal",
    eyebrow: "Lifecycle",
    preheader: "Your workspace is ready.",
    greeting: `Hi ${escapeHtml(safeName)},`,
    highlight: "Your neuro-aware trading workspace is active.",
    paragraphs: [
      "Your account is ready for structured journaling, analytics, and AI coaching tied to how you actually trade.",
      "Start logging your sessions, marking emotional patterns, and reviewing your execution with context.",
    ],
    facts: [{ label: "Email", value: escapeHtml(args.email) }],
    ctaLabel: "Open dashboard",
    ctaUrl: resolveAppUrl("/dashboard"),
    secondaryLabel: "Open sign in",
    secondaryUrl: resolveAppUrl("/signin"),
    footerNote: "If you didn’t create this account, you can ignore this email.",
  });

  return { subject, text, html };
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
    preheader: "Your subscription payment has been confirmed.",
    greeting: `Hi ${escapeHtml(safeName)},`,
    highlight: `Your <strong>${escapeHtml(planLabel)}</strong>${billingLabel ? ` <strong>${escapeHtml(billingLabel.toLowerCase())}</strong>` : ""} payment was processed successfully.`,
    paragraphs: [
      "Your subscription payment has been processed and your workspace remains active inside NeuroTrader Journal.",
      "You can review billing details, invoices, plan changes, and renewal settings from the Billing section at any time.",
    ],
    facts: [
      { label: "Plan", value: escapeHtml(planLabel) },
      { label: "Amount", value: escapeHtml(amountText) },
      ...(billingLabel ? [{ label: "Billing", value: escapeHtml(billingLabel) }] : []),
      ...(chargeDateText ? [{ label: "Paid on", value: escapeHtml(chargeDateText) }] : []),
      ...(args.invoiceNumber ? [{ label: "Invoice", value: escapeHtml(args.invoiceNumber) }] : []),
      ...(args.subscriptionId ? [{ label: "Subscription", value: escapeHtml(args.subscriptionId) }] : []),
    ],
    ctaLabel: "Open billing",
    ctaUrl: resolveAppUrl("/billing"),
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
    ctaUrl: resolveAppUrl("/billing"),
    ...(args.invoiceUrl
      ? {
          secondaryLabel: "Open invoice",
          secondaryUrl: args.invoiceUrl,
        }
      : {}),
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
    provider: "Resend",
    configured: Boolean(process.env.RESEND_API_KEY),
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
      from: FROM_EMAIL,
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
      from: FROM_EMAIL,
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
      from: FROM_EMAIL,
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

export async function sendEmailConfirmationEmail(args: {
  email: string;
  name?: string | null;
  confirmationCode: string;
  continueUrl?: string | null;
}) {
  const content = buildEmailConfirmationContent(args);
  await sendEmailBase({ to: args.email, ...content });
}

export async function sendPasswordResetEmail(args: {
  email: string;
  name?: string | null;
  resetUrl: string;
}) {
  const content = buildPasswordResetContent(args);
  await sendEmailBase({ to: args.email, ...content });
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
  await sendEmailBase({ to: args.email, ...content });
}

export async function sendWelcomeEmail(user: AppUser) {
  const content = buildWelcomeEmailContent({ email: user.email, name: user.name || "trader" });
  await sendEmailBase({ to: user.email, ...content });
}

export async function sendSubscriptionReceiptEmail(user: AppUser, plan: PlanId) {
  const content = buildSubscriptionReceiptContent({ email: user.email, name: user.name || "trader", plan });
  await sendEmailBase({ to: user.email, ...content });
}

export async function sendBetaRequestEmail(args: { name: string; email: string }) {
  const { name, email } = args;
  const subject = `New beta access request – ${email}`;
  const text = [
    "New NeuroTrader Journal beta access request:",
    "",
    `Name: ${name}`,
    `Email: ${email}`,
    "",
    "Next steps (manual):",
    "1) In Supabase, open auth.users and find this user.",
    "2) Insert or update a row in public.profiles with is_approved = true when you decide to grant access.",
    "3) Optionally send a personal welcome email from support@neurotrader-journal.com.",
  ].join("\n");

  await sendEmailBase({
    to: "support@neurotrader-journal.com",
    subject,
    text,
  });
}

export async function sendWelcomeEmailByEmail(email: string, name?: string | null) {
  const content = buildWelcomeEmailContent({ email, name });
  await sendEmailBase({ to: email, ...content });
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
  await sendEmailBase({ to: args.email, ...content });
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
