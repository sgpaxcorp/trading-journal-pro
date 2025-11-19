// app/api/ai-coach/route.ts
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

// Cliente de OpenAI (API KEY solo en el backend)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Tipo del body que recibirás desde el frontend
type AiCoachRequestBody = {
  snapshot: any;
  recentSessions: any[];
  planSnapshot?: any | null;
  question?: string;
  screenshotBase64?: string | null;
};

// Prompt de sistema: cómo debe comportarse el modelo
const SYSTEM_PROMPT = `
You are a trading performance coach focused on risk management, psychology and process quality.

You ALWAYS:
- Ground your answers in the journal data you receive (snapshot, recentSessions, planSnapshot).
- Use concrete numbers from the data (win rate, best/worst day, recent streak, progress vs plan).
- Answer the trader's QUESTION first, then add extra insight.
- Highlight 2–3 strengths and 2–3 things to improve.
- Keep answers concise (max ~220 words).

When similar questions are asked multiple times, you MUST:
- Avoid repeating the same sentences.
- Focus on different angles or different parts of the data each time.

If planSnapshot is present:
- Briefly compare current balance vs starting and target.
- Comment on whether the trader is ahead or behind the plan in 1–2 bullets.

If recentSessions is present:
- Focus especially on the last 5–10 sessions when talking about "recent" behavior.
- Point out patterns: consecutive reds, repeated flat days, very large wins/losses, etc.

Your output MUST be structured like this (titles exact, in English):

1. Direct answer to your question
- 3–5 short bullets that respond directly to the trader's question, citing data.

2. Strengths to keep
- 2 bullets with positive patterns from the data.

3. Things to improve
- 2–3 bullets, each including ONE very specific action (e.g. "cap size on losers to $X", "no more than N trades after first red").

4. Micro-plan for next 2 trading days
- 3 bullets max, very concrete, focused on execution and risk.

Do NOT rewrite the full snapshot. Use only the numbers that matter for the current answer.
Be kind but direct. Never shame the trader.
`;

const DEFAULT_QUESTION =
  "What is the single most important thing I should change in my risk, psychology or process based on these stats?";

/* =========================
   GET de prueba
========================= */

export async function GET() {
  return NextResponse.json({
    status: "ok",
    message: "AI coach endpoint is live. Use POST to get coaching.",
  });
}

/* =========================
   Handler para el método POST
========================= */

export async function POST(req: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not set on the server.");
    }

    const body = (await req.json()) as AiCoachRequestBody;
    const {
      snapshot,
      recentSessions,
      planSnapshot,
      question,
      screenshotBase64,
    } = body || {};

    if (!snapshot || !recentSessions) {
      return NextResponse.json(
        {
          error: "AI coach failed",
          details: "Missing 'snapshot' or 'recentSessions' in request body.",
        },
        { status: 400 }
      );
    }

    const trimmedSessions = Array.isArray(recentSessions)
      ? recentSessions.slice(0, 15)
      : [];

    const userPrompt = `
You are receiving trading journal data for ONE trader.

High-level aggregated snapshot:
${JSON.stringify(snapshot, null, 2)}

Recent sessions (most recent first, trimmed):
${JSON.stringify(trimmedSessions, null, 2)}

Plan snapshot (progress vs plan, if available):
${planSnapshot ? JSON.stringify(planSnapshot, null, 2) : "No plan data provided."}

Trader's question (answer this FIRST, in a focused way):
"${question || DEFAULT_QUESTION}"

Use the question + stats to give targeted, non-generic coaching.
If the question is about "last sessions", emphasize the last 5–10 sessions.
Never invent numbers that are not in the data.
    `;

    // Contenido del mensaje del usuario: texto + opcionalmente imagen
    const userContent: any[] = [{ type: "text", text: userPrompt }];

    if (screenshotBase64) {
      userContent.push({
        type: "input_image",
        image_url: { url: screenshotBase64 },
      });
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent as any },
      ],
    });

    const text = completion.choices?.[0]?.message?.content || "";

    return NextResponse.json({ text });
  } catch (err: any) {
    console.error("AI coach error:", err);
    return NextResponse.json(
      {
        error: "AI coach failed",
        details:
          err?.message ||
          (typeof err === "string" ? err : "Unknown error calling OpenAI"),
      },
      { status: 500 }
    );
  }
}
