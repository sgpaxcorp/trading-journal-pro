import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { question } = await req.json();

    if (!question || typeof question !== "string") {
      return NextResponse.json(
        { error: "Missing question" },
        { status: 400 }
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing OPENAI_API_KEY" },
        { status: 500 }
      );
    }

    const systemPrompt = `
You are the AI assistant of "Trading Journal Pro", a SaaS trading journal.
Explain features clearly and help with concepts like journaling, risk management,
and trading psychology. Do NOT give specific trade recommendations.
`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: question },
        ],
        temperature: 0.5,
        max_tokens: 300,
      }),
    });

    const data = await response.json();

    const content =
      data?.choices?.[0]?.message?.content ||
      "Sorry, I couldn't generate a response. Please try again.";

    return NextResponse.json({ answer: content });
  } catch (error: any) {
    console.error("Ask API error:", error);
    return NextResponse.json(
      { error: "Something went wrong generating the answer." },
      { status: 500 }
    );
  }
}
