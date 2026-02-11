import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { getClientIp, rateLimit, rateLimitHeaders } from "@/lib/rateLimit";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const SUPPORT_EMAIL = "support@neurotrader-journal.com";
const HCAPTCHA_SECRET = process.env.HCAPTCHA_SECRET_KEY || "";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export async function POST(req: NextRequest) {
  try {
    const rate = rateLimit(`contact:ip:${getClientIp(req)}`, {
      limit: 5,
      windowMs: 10 * 60_000,
    });
    if (!rate.allowed) {
      const retryAfter = Math.max(1, Math.ceil((rate.resetAt - Date.now()) / 1000));
      return NextResponse.json(
        { error: "Rate limit exceeded" },
        {
          status: 429,
          headers: {
            "Retry-After": String(retryAfter),
            ...rateLimitHeaders(rate),
          },
        }
      );
    }

    const body = await req.json().catch(() => ({}));
    const honeypot = String(body?.company || body?.website || "").trim();
    if (honeypot) {
      return NextResponse.json({ ok: true });
    }

    const name = String(body?.name || "").trim();
    const email = String(body?.email || "").trim();
    const subject = String(body?.subject || "").trim();
    const message = String(body?.message || "").trim();
    const captchaToken = String(body?.captchaToken || "").trim();

    if (!name || !email || !message) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const fullSubject = subject ? `Contact: ${subject}` : "Contact: Neuro Trader";
    if (HCAPTCHA_SECRET) {
      if (!captchaToken) {
        return NextResponse.json({ error: "Captcha required" }, { status: 400 });
      }
      const verifyRes = await fetch("https://hcaptcha.com/siteverify", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          secret: HCAPTCHA_SECRET,
          response: captchaToken,
          remoteip: getClientIp(req),
        }).toString(),
      });
      const verifyBody = (await verifyRes.json().catch(() => ({}))) as { success?: boolean };
      if (!verifyBody?.success) {
        return NextResponse.json({ error: "Captcha failed" }, { status: 400 });
      }
    }

    const safeName = escapeHtml(name);
    const safeEmail = escapeHtml(email);
    const safeSubject = escapeHtml(subject || "—");
    const safeMessage = escapeHtml(message).replace(/\n/g, "<br/>");
    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;color:#0f172a">
        <h2>New contact request</h2>
        <p><strong>Name:</strong> ${safeName}</p>
        <p><strong>Email:</strong> ${safeEmail}</p>
        <p><strong>Subject:</strong> ${safeSubject}</p>
        <p><strong>Message:</strong></p>
        <p>${safeMessage}</p>
      </div>
    `;

    if (resend) {
      await resend.emails.send({
        from: `Neuro Trader <${SUPPORT_EMAIL}>`,
        to: SUPPORT_EMAIL,
        replyTo: email,
        subject: fullSubject,
        html,
      });
    } else {
      console.log("[contact] Resend not configured. Message:", { name, email, subject, message });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[contact] error:", err);
    return NextResponse.json({ ok: false, error: err?.message ?? "Unknown error" }, { status: 500 });
  }
}
