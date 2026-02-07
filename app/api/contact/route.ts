import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const SUPPORT_EMAIL = "support@neurotrader-journal.com";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const name = String(body?.name || "").trim();
    const email = String(body?.email || "").trim();
    const subject = String(body?.subject || "").trim();
    const message = String(body?.message || "").trim();

    if (!name || !email || !message) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const fullSubject = subject ? `Contact: ${subject}` : "Contact: Neuro Trader";
    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;color:#0f172a">
        <h2>New contact request</h2>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Subject:</strong> ${subject || "—"}</p>
        <p><strong>Message:</strong></p>
        <p>${message.replace(/\n/g, "<br/>")}</p>
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
