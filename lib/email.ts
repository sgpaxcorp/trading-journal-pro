// lib/email.ts
import { AppUser, PlanId } from "./types";
import { Resend } from "resend";

/**
 * Remitente verificado en Resend.
 */
const FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL ||
  "NeuroTrader Journal <support@neurotrader-journal.com>";

/**
 * Cliente de Resend.
 * Si no hay RESEND_API_KEY, se queda en null y usamos modo "mock".
 */
const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

type SendEmailArgs = {
  to: string;
  subject: string;
  text?: string;
  html?: string;
};

/* =========================================================================
   TEMPLATE FUTURISTA NEURO-TRADER (HTML)
   ========================================================================= */

type NeuroTemplateArgs = {
  title: string;
  preheader?: string;
  greeting: string;
  paragraphs: string[]; // párrafos principales
  highlight?: string; // frase grande tipo tagline
  ctaLabel?: string;
  ctaUrl?: string;
  footerNote?: string;
};

function buildNeuroTraderHtml({
  title,
  preheader,
  greeting,
  paragraphs,
  highlight,
  ctaLabel,
  ctaUrl,
  footerNote,
}: NeuroTemplateArgs): string {
  const preheaderText =
    preheader ||
    "Upgrade your trading with structured journaling, analytics & neuro-performance.";

  const bodyHtml = paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 10px 0;color:#cbd5f5;font-size:14px;line-height:1.6;">${p}</p>`
    )
    .join("");

  const highlightHtml = highlight
    ? `<p style="margin:16px 0 18px 0;font-size:14px;line-height:1.6;color:#a5b4fc;">
         <span style="display:inline-block;padding:6px 10px;border-radius:999px;border:1px solid rgba(94,234,212,0.4);background:rgba(15,23,42,0.9);color:#e5e7eb;">
           ${highlight}
         </span>
       </p>`
    : "";

  const ctaHtml =
    ctaLabel && ctaUrl
      ? `<div style="margin:22px 0 4px 0;">
           <a href="${ctaUrl}"
              style="display:inline-block;padding:10px 20px;border-radius:999px;
                     background:linear-gradient(135deg,#22c55e,#06b6d4);
                     color:#020617;font-weight:600;font-size:14px;
                     text-decoration:none;">
             ${ctaLabel}
           </a>
         </div>`
      : "";

  const footerHtml = footerNote
    ? `<p style="margin:18px 0 0 0;color:#64748b;font-size:11px;line-height:1.5;">
         ${footerNote}
       </p>`
    : "";

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charSet="UTF-8" />
  <title>${title}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    @media (prefers-color-scheme: dark) {
      body { background-color:#020617 !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#020617;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <!-- Preheader invisible -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
    ${preheaderText}
  </div>

  <table role="presentation" width="100%" cellPadding="0" cellSpacing="0" style="background-color:#020617;padding:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellPadding="0" cellSpacing="0" style="max-width:600px;background:radial-gradient(circle at 0% 0%,rgba(56,189,248,0.35),transparent 55%),radial-gradient(circle at 100% 0%,rgba(16,185,129,0.35),transparent 55%),linear-gradient(180deg,#020617,#020617);border-radius:18px;border:1px solid rgba(148,163,184,0.28);box-shadow:0 18px 45px rgba(15,23,42,0.9);overflow:hidden;">
          <!-- HEADER -->
          <tr>
            <td style="padding:18px 26px 10px 26px;border-bottom:1px solid rgba(51,65,85,0.9);">
              <table width="100%" role="presentation" cellPadding="0" cellSpacing="0">
                <tr>
                  <td align="left">
                    <div style="display:flex;align-items:center;gap:8px;">
                      <div style="width:30px;height:30px;border-radius:10px;background:radial-gradient(circle at 30% 0%,#22c55e,transparent 55%),radial-gradient(circle at 70% 100%,#38bdf8,transparent 55%),#020617;border:1px solid rgba(148,163,184,0.5);display:flex;align-items:center;justify-content:center;">
                        <span style="font-size:16px;color:#e5e7eb;font-weight:700;">NT</span>
                      </div>
                      <div style="font-size:14px;font-weight:600;color:#e5e7eb;">
                        NeuroTrader Journal
                        <div style="font-size:11px;color:#9ca3af;font-weight:400;">
                          Neurophysiological Trading Performance
                        </div>
                      </div>
                    </div>
                  </td>
                  <td align="right" style="font-size:11px;color:#6b7280;">
                    ${title}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- BODY -->
          <tr>
            <td style="padding:22px 26px 24px 26px;position:relative;">
              <!-- waves “neuronales” de fondo -->
              <div style="position:absolute;inset:0;pointer-events:none;opacity:0.22;">
                <svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
                  <defs>
                    <linearGradient id="wave" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stop-color="#22c55e" />
                      <stop offset="50%" stop-color="#38bdf8" />
                      <stop offset="100%" stop-color="#a855f7" />
                    </linearGradient>
                  </defs>
                  <path d="M0 40 Q 80 10 160 40 T 320 40 T 480 40 T 640 40" fill="none" stroke="url(#wave)" stroke-width="1" stroke-linecap="round" stroke-dasharray="4 6" />
                  <path d="M0 90 Q 80 60 160 90 T 320 90 T 480 90 T 640 90" fill="none" stroke="url(#wave)" stroke-width="1" stroke-linecap="round" stroke-dasharray="3 7" />
                </svg>
              </div>

              <div style="position:relative;z-index:1;">
                <p style="margin:0 0 10px 0;color:#e5e7eb;font-size:15px;font-weight:500;">
                  ${greeting}
                </p>

                ${highlightHtml}

                ${bodyHtml}

                ${ctaHtml}

                ${footerHtml}
              </div>
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="padding:12px 26px 18px 26px;border-top:1px solid rgba(31,41,55,0.9);">
              <p style="margin:0;color:#6b7280;font-size:11px;line-height:1.5;">
                You’re receiving this email because you created an account or subscription on
                <span style="color:#e5e7eb;">NeuroTrader Journal</span>.
              </p>
              <p style="margin:6px 0 0 0;color:#4b5563;font-size:10px;">
                &copy; ${new Date().getFullYear()} NeuroTrader Journal. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
}

/* =========================================================================
   0) Helper genérico para enviar emails
   ========================================================================= */

async function sendEmailBase({ to, subject, text, html }: SendEmailArgs) {
  // MODO MOCK (sin Resend configurado)
  if (!resend) {
    console.log("======================================");
    console.log("[EMAIL MOCK] To:      ", to);
    console.log("[EMAIL MOCK] Subject: ", subject);
    if (text) console.log("[EMAIL MOCK] Text:\n", text);
    if (html) console.log("[EMAIL MOCK] HTML length:", html.length);
    console.log("======================================");
    return;
  }

  // MODO REAL (Resend)
  try {
    await (resend as any).emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      text,
      html,
    });
    console.log("[EMAIL] Sent successfully via Resend to", to);
  } catch (err) {
    console.error("[EMAIL] Error sending via Resend:", err);
  }
}

/* =========================================================================
   1) FUNCIONES QUE YA USA TU AUTHCONTEXT (NO CAMBIAR FIRMAS)
   ========================================================================= */

/**
 * Email de bienvenida al usuario cuando se registra.
 * Firma: sendWelcomeEmail(user: AppUser)
 */
export async function sendWelcomeEmail(user: AppUser) {
  const name = user.name || "trader";
  const subject = "Welcome to NeuroTrader Journal";

  const text = [
    `Hi ${name},`,
    "",
    "Welcome to NeuroTrader Journal!",
    "",
    "You’ve just taken a big step toward trading with more structure, clarity, and psychological edge.",
    "",
    "During the beta, access is limited. Our team may contact you with next steps or onboarding tips.",
    "",
    "Log in to start journaling your trades and exploring your analytics:",
    "https://neurotrader-journal.com",
    "",
    "Happy trading,",
    "NeuroTrader Journal Team",
  ].join("\n");

  const html = buildNeuroTraderHtml({
    title: `Welcome, ${name}`,
    preheader:
      "Your NeuroTrader Journal account is ready. Start tracking your trades and your mind.",
    greeting: `Hi ${name},`,
    highlight: "You just unlocked a neuro-aware trading workspace.",
    paragraphs: [
      "Welcome to <strong>NeuroTrader Journal</strong> – your command center for structured journaling, performance analytics and psychological edge.",
      "From now on, every trade has a memory: context, emotion, execution and outcome. That’s how you train your brain to think in probabilities, not impulses.",
      "During the beta, access is limited. We may reach out with tailored onboarding tips based on how you trade.",
    ],
    ctaLabel: "Enter your NeuroTrading Space",
    ctaUrl: "https://neurotrader-journal.com",
    footerNote:
      "If you didn’t create this account, you can safely ignore this email.",
  });

  await sendEmailBase({
    to: user.email,
    subject,
    text,
    html,
  });
}

/**
 * Email de recibo de suscripción.
 * Firma: sendSubscriptionReceiptEmail(user: AppUser, plan: PlanId)
 */
export async function sendSubscriptionReceiptEmail(
  user: AppUser,
  plan: PlanId
) {
  const name = user.name || "trader";
  const subject = "Your NeuroTrader Journal subscription";

  const text = [
    `Hi ${name},`,
    "",
    `Thank you for subscribing to NeuroTrader Journal (${plan} plan).`,
    "",
    "This is a mock-style receipt email. In production, you can enrich this with full billing details.",
    "",
    "You can manage your subscription inside the app.",
    "",
    "NeuroTrader Journal Team",
  ].join("\n");

  const html = buildNeuroTraderHtml({
    title: `Subscription active – ${name}`,
    preheader: "Your NeuroTrader Journal subscription is live.",
    greeting: `Hi ${name},`,
    highlight: `Your <strong>${plan.toUpperCase()}</strong> plan is now active.`,
    paragraphs: [
      `Thank you for subscribing to <strong>NeuroTrader Journal</strong> on the <strong>${plan}</strong> plan.`,
      "You now have access to structured journaling, performance analytics and tools designed to align your nervous system with your trading plan.",
      "You can review or update your subscription details at any time from inside the app.",
    ],
    ctaLabel: "Open dashboard",
    ctaUrl: "https://neurotrader-journal.com",
  });

  await sendEmailBase({
    to: user.email,
    subject,
    text,
    html,
  });
}

/**
 * Email interno a soporte cuando alguien pide acceso al beta.
 * Se usa desde /api/email/beta-request
 */
export async function sendBetaRequestEmail(args: {
  name: string;
  email: string;
}) {
  const { name, email } = args;

  const subject = `New beta access request – ${email}`;
  const text = [
    "New NeuroTrader Journal beta access request:",
    "",
    `Name:  ${name}`,
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

/* =========================================================================
   2) HELPERS EXTRA PARA USAR EN EL WEBHOOK (POR EMAIL, SIN AppUser)
   ========================================================================= */

/**
 * Bienvenida usando solo email + nombre opcional.
 * Ideal para llamar desde el webhook de Stripe.
 */
export async function sendWelcomeEmailByEmail(
  email: string,
  name?: string | null
) {
  const safeName = name || "trader";
  const subject = "Welcome to NeuroTrader Journal";

  const text = [
    `Hi ${safeName},`,
    "",
    "Welcome to NeuroTrader Journal!",
    "",
    "Your subscription is now active. You can log in and start journaling your trades, reviewing analytics, and working on your trading psychology.",
    "",
    "Log in here:",
    "https://neurotrader-journal.com",
    "",
    "If you didn't create this account, please ignore this email.",
    "",
    "Happy trading,",
    "NeuroTrader Journal Team",
  ].join("\n");

  const html = buildNeuroTraderHtml({
    title: `Welcome, ${safeName}`,
    preheader:
      "Your NeuroTrader Journal subscription is active. Start mapping your trades and your mind.",
    greeting: `Hi ${safeName},`,
    highlight: "Your neuro-aligned trading journal is ready.",
    paragraphs: [
      "Welcome to <strong>NeuroTrader Journal</strong>. From this point forward, every trade becomes data for your brain to learn from – not just P&L.",
      "Log in to start journaling, tagging emotions, and exploring analytics that show how your nervous system reacts to risk.",
    ],
    ctaLabel: "Log in to NeuroTrader",
    ctaUrl: "https://neurotrader-journal.com",
    footerNote:
      "If you didn’t create this account, you can safely ignore this email.",
  });

  await sendEmailBase({
    to: email,
    subject,
    text,
    html,
  });
}

/**
 * Recibo de suscripción desde el webhook (por email directo).
 */
export async function sendSubscriptionReceiptEmailByEmail(args: {
  email: string;
  plan: PlanId;
  amount?: number; // en dólares
  subscriptionId?: string;
  name?: string | null;
}) {
  const { email, plan, amount, subscriptionId, name } = args;

  const safeName = name || "trader";
  const subject = "Your NeuroTrader Journal subscription receipt";

  const lines: string[] = [
    `Hi ${safeName},`,
    "",
    `Thank you for subscribing to NeuroTrader Journal (${plan} plan).`,
  ];

  if (amount != null) {
    lines.push("", `Amount: $${amount.toFixed(2)} (USD)`);
  }

  if (subscriptionId) {
    lines.push("", `Subscription ID: ${subscriptionId}`);
  }

  lines.push(
    "",
    "You can manage your subscription and account settings inside the app.",
    "",
    "Happy trading,",
    "NeuroTrader Journal Team"
  );

  const text = lines.join("\n");

  const detailParts: string[] = [];
  if (amount != null) {
    detailParts.push(
      `<p style="margin:0 0 8px 0;color:#cbd5f5;font-size:14px;">
         <strong>Amount:</strong> $${amount.toFixed(2)} USD
       </p>`
    );
  }
  if (subscriptionId) {
    detailParts.push(
      `<p style="margin:0;color:#9ca3af;font-size:12px;">
         <strong>Subscription ID:</strong> ${subscriptionId}
       </p>`
    );
  }

  const html = buildNeuroTraderHtml({
    title: `Receipt – ${safeName}`,
    preheader: "Your NeuroTrader Journal subscription receipt.",
    greeting: `Hi ${safeName},`,
    highlight: `Subscription: <strong>${plan.toUpperCase()} plan</strong>`,
    paragraphs: [
      "Thank you for subscribing to <strong>NeuroTrader Journal</strong>. Your plan is now active and linked to your trading workspace.",
      detailParts.join(""),
      "You can review your billing details and manage your plan directly from the app.",
    ],
    ctaLabel: "Go to billing",
    ctaUrl: "https://neurotrader-journal.com/settings/billing",
  });

  await sendEmailBase({
    to: email,
    subject,
    text,
    html,
  });
}
