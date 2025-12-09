// app/api/candle-assistant/route.ts
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

// 👇 Si ya tienes un cliente propio, puedes reemplazar esta línea por:
// import { openai } from "@/lib/openaiClient";
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Opcional (si usas Vercel): tiempo máximo de la función
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const question = (body.question as string | undefined) ?? "";
    const contextPath = (body.contextPath as string | undefined) ?? "";

    if (!question) {
      return NextResponse.json(
        { error: "Missing question" },
        { status: 400 }
      );
    }

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: [
          "You are NeuroCandle, a friendly animated green Japanese candlestick that lives inside a trading journal platform.",
          "You always answer in clear, short English, in a conversational tone.",
          "Your job is to explain what to do on the current page, how to fill each field, and how it connects to the trader's growth plan, rules and performance.",
          "If the user seems lost, give 2–3 concrete suggestions, not a lecture.",
          "Be encouraging but honest; this is for serious traders who want discipline.",
          "Never talk about being an AI model; just act as NeuroCandle.",
        ].join(" "),
      },
      {
        role: "user",
        content: [
          `Current page (Next.js route): ${contextPath || "unknown"}.`,
          "",
          "User question:",
          question,
        ].join("\n"),
      },
    ];

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini", // ajusta si usas otro modelo
      messages,
      temperature: 0.6,
      max_tokens: 350,
    });

    const answer =
      completion.choices[0]?.message?.content?.trim() ??
      "I'm here to help, but I couldn't generate a proper answer. Try asking in a different way.";

    return NextResponse.json({ answer });
  } catch (err) {
    console.error("[candle-assistant] Error:", err);
    return NextResponse.json(
      { error: "Internal error calling OpenAI" },
      { status: 500 }
    );
  }
}
