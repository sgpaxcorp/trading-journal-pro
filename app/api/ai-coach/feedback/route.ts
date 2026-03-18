import { supabaseAdmin } from "@/lib/supaBaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeString(x: any): string {
  return typeof x === "string" ? x : x == null ? "" : String(x);
}

function isAiCoachFeedbackUnavailableError(error: any): boolean {
  const code = typeof error?.code === "string" ? error.code : "";
  const message = typeof error?.message === "string" ? error.message.toLowerCase() : "";
  return (
    code === "PGRST205" ||
    code === "42P01" ||
    (message.includes("ai_coach_feedback") &&
      (message.includes("schema cache") ||
        message.includes("does not exist") ||
        message.includes("could not find the table")))
  );
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
    const messageId = safeString(body?.messageId).trim();
    const threadId = safeString(body?.threadId).trim() || null;

    const ratingRaw = Number(body?.rating);
    const rating = ratingRaw === 1 ? 1 : ratingRaw === -1 ? -1 : 0;
    if (!rating) {
      return Response.json({ error: "Invalid rating" }, { status: 400 });
    }
    if (!messageId) {
      return Response.json({ error: "Missing messageId" }, { status: 400 });
    }

    const payload = {
      user_id: userId,
      thread_id: threadId,
      message_id: messageId,
      rating,
      note: safeString(body?.note).trim() || null,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabaseAdmin
      .from("ai_coach_feedback")
      .upsert(payload, { onConflict: "user_id,message_id" });
    if (error) {
      if (isAiCoachFeedbackUnavailableError(error)) {
        return Response.json(
          {
            ok: false,
            disabled: true,
            error: "AI coach feedback is unavailable until the latest database migration is applied.",
          },
          { status: 503 }
        );
      }
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ ok: true });
  } catch (err: any) {
    return Response.json({ error: safeString(err?.message) }, { status: 500 });
  }
}
