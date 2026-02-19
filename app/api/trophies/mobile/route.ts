import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) {
      return NextResponse.json({ definitions: [], earned: [] }, { status: 401 });
    }

    const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !authData?.user) {
      return NextResponse.json({ definitions: [], earned: [] }, { status: 401 });
    }

    const userId = authData.user.id;

    const { data: definitions, error: defErr } = await supabaseAdmin
      .from("trophy_definitions")
      .select("id, title, description, tier, xp, category, icon, secret")
      .order("xp", { ascending: true });

    if (defErr) {
      console.warn("[trophies/mobile] definitions error:", defErr);
    }

    const { data: earnedRows, error: earnedErr } = await supabaseAdmin
      .from("user_trophies")
      .select(
        "trophy_id, earned_at, trophy_definitions(id, title, description, tier, xp, category, icon, secret)"
      )
      .eq("user_id", userId)
      .order("earned_at", { ascending: false });

    if (earnedErr) {
      console.warn("[trophies/mobile] earned error:", earnedErr);
    }

    const earned = (earnedRows ?? []).map((row: any) => {
      const def = row?.trophy_definitions ?? {};
      return {
        trophy_id: String(row?.trophy_id ?? def?.id ?? ""),
        title: String(def?.title ?? "Trophy"),
        description: String(def?.description ?? ""),
        tier: String(def?.tier ?? "Bronze"),
        xp: Number(def?.xp ?? 0),
        category: String(def?.category ?? "General"),
        icon: (def?.icon ?? null) as string | null,
        secret: def?.secret ?? null,
        earned_at: row?.earned_at ? String(row.earned_at) : null,
      };
    });

    return NextResponse.json({
      definitions: Array.isArray(definitions) ? definitions : [],
      earned,
    });
  } catch (err: any) {
    console.error("[trophies/mobile] error:", err);
    return NextResponse.json(
      { definitions: [], earned: [], error: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
