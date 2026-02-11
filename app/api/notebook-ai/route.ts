// app/api/notebook-ai/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getAuthUser } from "@/lib/authServer";
import { rateLimit, rateLimitHeaders } from "@/lib/rateLimit";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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
    const { question, journal } = body as {
      question: string;
      journal: {
        date: string;
        pnl: number;
        entries: any[];
        exits: any[];
        notes: any;
      };
    };

    if (!question || !journal) {
      return NextResponse.json(
        { error: "Missing question or journal payload" },
        { status: 400 }
      );
    }

    const systemPrompt = `
You are a world-class trading performance coach.
You help the user review ONE trading day at a time.
Use the data you get (date, PnL, entries, exits, notes) plus the user's question
to give concrete, actionable feedback with 3–7 bullet points.
Be direct, kind and practical. Avoid generic motivational quotes.
If risk management is violated, point it out clearly.
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
              journal,
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
