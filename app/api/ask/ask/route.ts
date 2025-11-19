// app/api/ask/route.ts
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return new Response(
        JSON.stringify({
          error:
            "Missing OPENAI_API_KEY. Add it to your .env.local and Vercel project.",
        }),
        { status: 500 }
      );
    }

    const body = await req.json();
    const question = (body?.question || "").toString().trim();

    if (!question) {
      return new Response(
        JSON.stringify({ error: "Question is required." }),
        { status: 400 }
      );
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.4,
      messages: [
        {
          role: "system",
          content:
            "You are the AI assistant for Trading Journal Pro, a web-based trading journal and performance platform. " +
            "Answer user questions clearly and concisely. " +
            "If they ask about the website, trading journal features, psychology, or how to use the app, explain it. " +
            "If they ask general questions (definitions, concepts, etc.), answer them too, as long as it is safe and appropriate.",
        },
        {
          role: "user",
          content: question,
        },
      ],
    });

    const answer =
      completion.choices[0]?.message?.content?.trim() ||
      "I couldn't generate an answer. Please try again.";

    return new Response(JSON.stringify({ answer }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[/api/ask] error:", err);
    return new Response(
      JSON.stringify({
        error: "Something went wrong while contacting the AI service.",
      }),
      { status: 500 }
    );
  }
}
