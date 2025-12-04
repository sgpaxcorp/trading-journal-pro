// app/api/email/beta-request/route.ts
import { NextRequest, NextResponse } from "next/server";

// Stub temporal: no usa Resend ni ninguna API externa
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));

  console.log("[EMAIL BETA-REQUEST STUB] Payload received:", body);

  // Puedes guardar esto en Supabase si quieres, pero por ahora solo devolvemos ok
  return NextResponse.json({
    ok: true,
    message: "Beta request received (stub, no email sent).",
  });
}
