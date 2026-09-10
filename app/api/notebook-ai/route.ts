import { NextResponse } from "next/server";
import OpenAI from "openai";

import { recordAiUsage } from "@/lib/aiUsageServer";
import { getAuthUser } from "@/lib/authServer";
import { getNotebookAiEvidence } from "@/lib/notebookRetrievalServer";
import { rateLimit, rateLimitHeaders } from "@/lib/rateLimit";
import { requireAdvancedPlan } from "@/lib/serverFeatureAccess";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function clean(value: unknown, max: number) {
  return String(value ?? "").trim().slice(0, max);
}

export async function POST(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const gate = await requireAdvancedPlan(auth.userId);
    if (gate) return gate;

    const rate = await rateLimit(`notebook-ai:user:${auth.userId}`, { limit: 6, windowMs: 60_000 });
    if (!rate.allowed) {
      const retryAfter = Math.max(1, Math.ceil((rate.resetAt - Date.now()) / 1000));
      return NextResponse.json(
        { error: "Rate limit exceeded" },
        { status: 429, headers: { "Retry-After": String(retryAfter), ...rateLimitHeaders(rate) } }
      );
    }

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const question = clean(body.question, 2_000);
    if (!question) return NextResponse.json({ error: "A question is required." }, { status: 400 });

    const language = body.language === "es" || body.language === "en"
      ? body.language
      : /[¿¡áéíóúñ]|\b(mi|mis|día|semana|cuenta|regla|riesgo|analiza|resume)\b/i.test(question)
        ? "es"
        : "en";
    const evidence = await getNotebookAiEvidence({
      userId: auth.userId,
      scope: body.scope,
      accountId: clean(body.accountId, 80) || null,
      question,
      selectedPageId: clean(body.selectedPageId, 80) || null,
      selectedDate: clean(body.selectedDate, 10) || null,
    });

    if (evidence.citations.length === 0) {
      return NextResponse.json({
        answer: language === "es"
          ? "Todavía no hay evidencia suficiente en este espacio para contestar con objetividad. Añade una revisión, una lección o una página de investigación y vuelvo a evaluarlo."
          : "There is not enough evidence in this workspace to answer objectively yet. Add a review, lesson, or research page and I will evaluate it again.",
        citations: [],
      });
    }

    const sources = evidence.citations.map((citation, index) => ({
      source: `S${index + 1}`,
      id: citation.id,
      label: citation.label,
      date: citation.date,
      evidence: citation.excerpt,
    }));
    const systemPrompt = `
You are the user's Business Notebook coach. You sound like an attentive, experienced human coach, not a scripted assistant.
Your conclusions must be objective, specific, and grounded only in the supplied evidence. Never invent facts.
Separate observed facts from interpretation. Name conflicting evidence and insufficient sample sizes.
Do not promise results, income, capital growth, or certainty. Do not provide individualized financial advice or tell the user to buy or sell a security.
When the evidence supports an operational improvement, recommend one concrete next action or measurable test.
Keep the same evaluation framework and source evidence so materially identical questions receive materially consistent answers.
Cite factual conclusions inline with source markers such as [S1]. Use 3-7 short paragraphs or bullets, depending on the question.
Answer in ${language === "es" ? "natural Spanish" : "natural English"}.
`.trim();

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.1,
      seed: 7,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: JSON.stringify({ question, workspaceScope: evidence.scope, sources }, null, 2) },
      ],
    });
    const answer = completion.choices[0]?.message?.content?.trim() || "";
    await recordAiUsage({
      userId: auth.userId,
      requestId: req.headers.get("x-request-id"),
      feature: "business_notebook",
      category: "advanced",
      operation: "evidence_analysis",
      model: completion.model || "gpt-4o-mini",
      usage: completion.usage,
    });

    return NextResponse.json({ answer, citations: evidence.citations });
  } catch (error) {
    console.error("[notebook-ai]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Notebook analysis failed." },
      { status: 500 }
    );
  }
}
