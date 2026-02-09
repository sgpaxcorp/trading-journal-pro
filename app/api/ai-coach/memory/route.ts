import { supabaseAdmin } from "@/lib/supaBaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeString(x: any): string {
  return typeof x === "string" ? x : x == null ? "" : String(x);
}

export async function GET(req: Request) {
  try {
    const auth = req.headers.get("authorization") || "";
    const token = auth.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return Response.json({ error: "Missing auth token" }, { status: 401 });
    }

    const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !authData?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = authData.user.id;

    const { data, error } = await supabaseAdmin
      .from("ai_coach_memory")
      .select("scope, scope_key, memory, updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    const rows = Array.isArray(data) ? data : [];
    const globalRow = rows.find((r: any) => r.scope === "global");
    const weeklyRow = rows.find((r: any) => r.scope === "weekly");
    const dailyRow = rows.find((r: any) => r.scope === "daily");

    return Response.json({
      global: safeString(globalRow?.memory).trim(),
      weekly: safeString(weeklyRow?.memory).trim(),
      daily: safeString(dailyRow?.memory).trim(),
      weeklyKey: safeString(weeklyRow?.scope_key || ""),
      dailyKey: safeString(dailyRow?.scope_key || ""),
      updatedAt: safeString(
        dailyRow?.updated_at || weeklyRow?.updated_at || globalRow?.updated_at || ""
      ),
    });
  } catch (err: any) {
    return Response.json({ error: safeString(err?.message) }, { status: 500 });
  }
}
