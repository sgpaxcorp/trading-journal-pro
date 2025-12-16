// app/api/email/route.ts
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  console.log("[EMAIL STUB] Would send onboarding emails:", body);
  return NextResponse.json({ ok: true });
}
