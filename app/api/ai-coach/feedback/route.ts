import { supabaseAdmin } from "@/lib/supaBaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeString(x: any): string {
  return typeof x === "string" ? x : x == null ? "" : String(x);
}

export async function POST(req: Request) {
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
    const body = (await req.json().catch(() => null)) || {};

    const ratingRaw = Number(body?.rating);
    const rating = ratingRaw === 1 ? 1 : ratingRaw === -1 ? -1 : 0;
    if (!rating) {
      return Response.json({ error: "Invalid rating" }, { status: 400 });
    }

    const payload = {
      user_id: userId,
      thread_id: body?.threadId || null,
      message_id: body?.messageId || null,
      rating,
      note: safeString(body?.note).trim() || null,
    };

    const { error } = await supabaseAdmin.from("ai_coach_feedback").insert(payload);
    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ ok: true });
  } catch (err: any) {
    return Response.json({ error: safeString(err?.message) }, { status: 500 });
  }
}
