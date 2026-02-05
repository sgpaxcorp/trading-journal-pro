import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return NextResponse.json({ entitlements: [] }, { status: 401 });

    const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !authData?.user) {
      return NextResponse.json({ entitlements: [] }, { status: 401 });
    }

    const userId = authData.user.id;
    const { data, error } = await supabaseAdmin
      .from("user_entitlements")
      .select("*")
      .eq("user_id", userId);

    if (error) throw error;

    return NextResponse.json({ entitlements: data ?? [] });
  } catch (err: any) {
    console.error("[entitlements/list] error:", err);
    return NextResponse.json(
      { entitlements: [], error: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
