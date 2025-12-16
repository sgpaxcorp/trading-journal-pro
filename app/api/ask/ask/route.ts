// app/api/ask/route.ts
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  try {
    // Seguridad básica: que exista la key
    if (!process.env.OPENAI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "Server missing OPENAI_API_KEY." }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const message = (body?.message ?? "").toString().trim();

    if (!message) {
      return new Response(
        JSON.stringify({ error: "Message is required." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini", // puedes cambiar de modelo si quieres
      temperature: 0.7,
      max_tokens: 400,
      messages: [
        {
          role: "system",
          content:
            "You are the Trading Journal Pro assistant. You help with questions about the platform, trading journaling, trading psychology, and any general definitions or concepts the user asks for. Answer in the same language as the user, be clear and concise.",
        },
        {
          role: "user",
          content: message,
        },
      ],
    });

    const answer =
      completion.choices[0]?.message?.content?.trim() ||
      "Lo siento, no pude generar una respuesta.";

    return new Response(JSON.stringify({ answer }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[/api/ask] error:", err);
    return new Response(
      JSON.stringify({
        error: "Error contacting the AI assistant.",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
