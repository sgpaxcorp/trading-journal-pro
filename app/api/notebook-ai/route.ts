// app/api/notebook-ai/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getAuthUser } from "@/lib/authServer";
import { rateLimit, rateLimitHeaders } from "@/lib/rateLimit";
import { requireAdvancedPlan } from "@/lib/serverFeatureAccess";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const advancedGate = await requireAdvancedPlan(authUser.userId);
    if (advancedGate) return advancedGate;

    const rate = rateLimit(`notebook-ai:user:${authUser.userId}`, {
      limit: 6,
      windowMs: 60_000,
    });
    if (!rate.allowed) {
      const retryAfter = Math.max(1, Math.ceil((rate.resetAt - Date.now()) / 1000));
      return NextResponse.json(
        { error: "Rate limit exceeded" },
        {
          status: 429,
          headers: {
            "Retry-After": String(retryAfter),
            ...rateLimitHeaders(rate),
          },
        }
      );
    }

    const body = await req.json();
    const { question, notebook, language } = body as {
      question: string;
      language?: "es" | "en" | "auto";
      notebook: {
        selectedDate?: string;
        selectedNotes?: {
          premarket?: string;
          live?: string;
          post?: string;
        };
        selectedFreeNotes?: string;
        selectedTags?: string[];
        activePage?: {
          notebook: string;
          section: string | null;
          page: string;
          text: string;
        } | null;
        indexStats?: {
          journalBlocks?: number;
          freeNotesBlocks?: number;
          customPages?: number;
          totalBlocks?: number;
        };
        searchHits?: {
          location: string;
          snippet: string;
          source: string;
          score: number;
        }[];
      };
    };

    if (!question || !notebook) {
      return NextResponse.json(
        { error: "Missing question or notebook payload" },
        { status: 400 }
      );
    }

    const isEs = language === "es";
    const searchIntent = /(\bwhere\b|\bfind\b|\blocate\b|\bsearch\b|\bdonde\b|\bdónde\b|\bbuscar\b|\bencuentra\b|\ben qué\b|\ben que\b)/i.test(
      question
    );
    const hits = Array.isArray(notebook.searchHits) ? notebook.searchHits : [];

    if (searchIntent) {
      if (hits.length === 0) {
        return NextResponse.json({
          answer: isEs
            ? "No encontré esa información en el notebook. Si puedes, agrega más contexto o una frase exacta."
            : "I couldn't find that in the notebook. Please add more context or a specific phrase.",
        });
      }

      const lines = hits.map((h) => `- ${h.location}\n  ${h.snippet}`);
      return NextResponse.json({
        answer: isEs
          ? `Encontré coincidencias en:\n${lines.join("\n")}`
          : `I found matches in:\n${lines.join("\n")}`,
      });
    }

    const systemPrompt = `
You are a notebook-only trading coach.
Use ONLY the notebook data provided (selected notes, free notes, active page, and search hits if any).
Do NOT use trades, PnL, or any external data. Do NOT invent details.
If something is missing, say it explicitly.
Be concise: 3–6 bullets max, practical and objective.
If the user asks "where" or "find", answer with exact locations from search hits or say not found.
Respond in the user's language (${isEs ? "Spanish" : "English"}).
    `.trim();

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: JSON.stringify(
            {
              question,
              notebook,
            },
            null,
            2
          ),
        },
      ],
    });

    const answer = completion.choices[0]?.message?.content ?? "";

    return NextResponse.json({ answer });
  } catch (err) {
    console.error("notebook-ai error", err);
    return NextResponse.json(
      { error: "Internal error in notebook AI coach" },
      { status: 500 }
    );
  }
}
