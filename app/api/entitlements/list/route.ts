import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";
import { planFromEntitlements, planFromProfile } from "@/lib/planAccess";

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
    const [{ data, error }, { data: profile }] = await Promise.all([
      supabaseAdmin
        .from("user_entitlements")
        .select("*")
        .eq("user_id", userId),
      supabaseAdmin.from("profiles").select("plan, subscription_status").eq("id", userId).maybeSingle(),
    ]);

    if (error) throw error;
    const rows = data ?? [];
    const entitlementPlan = planFromEntitlements(rows as any[]);
    const plan = entitlementPlan !== "none" ? entitlementPlan : planFromProfile(profile as any);

    return NextResponse.json({ entitlements: rows, plan });
  } catch (err: any) {
    console.error("[entitlements/list] error:", err);
    return NextResponse.json(
      { entitlements: [], error: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
