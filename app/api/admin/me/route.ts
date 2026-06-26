import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/adminAuth";

export async function GET(req: NextRequest) {
  try {
    const admin = await requireAdminUser(req, { action: "me", limit: 120, windowMs: 60_000 });
    if (!admin.ok) {
      return NextResponse.json({ isAdmin: false }, { status: admin.response.status });
    }

    return NextResponse.json({
      isAdmin: true,
      userId: admin.user.id,
      email: admin.user.email ?? null,
    });
  } catch (err: any) {
    return NextResponse.json(
      { isAdmin: false, error: err?.message ?? "Unexpected error" },
      { status: 500 }
    );
  }
}
