import OpenAI from "openai";
import { getAuthUser } from "@/lib/authServer";
import { getClientIp, rateLimit, rateLimitHeaders } from "@/lib/rateLimit";
import {
  BROKER_SYNC_ADDON,
  PLAN_PRICES,
} from "@/lib/planCatalog";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const PLAN_CONTEXT = `
Product: Neuro Trader Journal.
Core plan: $${PLAN_PRICES.core.monthly}/month or $${PLAN_PRICES.core.annual}/year. Best for active independent traders who want structure, goals, emotional control, journal, calendar, Growth Plan, core KPIs, broker data imports, challenges, global ranking opt-in, basic alerts/reminders, 24/7 virtual support agent, ticket follow-up until resolved, iOS mobile app, and Android app coming soon. Includes 5 trading accounts.
Advanced plan: $${PLAN_PRICES.advanced.monthly}/month or $${PLAN_PRICES.advanced.annual}/year. Best for serious full-time traders, funded traders, coaches, and business-style reporting. Includes unlimited trading accounts, everything in Core, Notebook workspace, cashflow tracking, time-of-day and instrument breakdowns, risk metrics and streaks, Profit & Loss Track, broker data audit workbench, advanced alerts/reminders, AI coaching/action plans, advanced PDF exports, priority 24/7 virtual support agent, priority ticket follow-up until resolved, iOS mobile app, and Android app coming soon.
Broker Data Sync & Imports add-on: $${BROKER_SYNC_ADDON.prices.monthly}/month or $${BROKER_SYNC_ADDON.prices.annual}/year. The value is flexibility and better insight: users can bring real broker data through secure sync, direct broker statements, order history, and supported CSV/XLSX imports. Position this as turning raw broker activity into cleaner audits, sharper analytics, and more useful AI coaching. Do not make it sound like a fallback or limitation.
Option Flow Intelligence: private beta, request access/admin enabled; do not sell it as a public paid add-on.
Important positioning: the product helps traders operate like a business, reduce scattered spreadsheets, protect capital with rules, measure discipline, review performance, and build a repeatable process. It does not guarantee profits and should not give financial advice.
`.trim();

export async function POST(req: Request) {
  try {
    const authUser = await getAuthUser(req);
    const limiterKey = authUser
      ? `ask:user:${authUser.userId}`
      : `ask:ip:${getClientIp(req)}`;
    const rate = await rateLimit(limiterKey, {
      limit: authUser ? 60 : 20,
      windowMs: 60_000,
    });
    if (!rate.allowed) {
      const retryAfter = Math.max(1, Math.ceil((rate.resetAt - Date.now()) / 1000));
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded" }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": String(retryAfter),
            ...rateLimitHeaders(rate),
          },
        }
      );
    }

    // Seguridad básica: que exista la key
    if (!process.env.OPENAI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "Server missing OPENAI_API_KEY." }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const message = (body?.message ?? "").toString().trim();
    const locale = body?.locale === "es" ? "es" : "en";

    if (!message) {
      return new Response(
        JSON.stringify({ error: "Message is required." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.35,
      max_tokens: 620,
      messages: [
        {
          role: "system",
          content: `
You are the Neuro Trader Journal sales advisor. You are consultative, strategic, business-oriented, and bilingual.

Use this product context as source of truth:
${PLAN_CONTEXT}

Sales behavior:
- Match the user's language. The current UI locale is ${locale}.
- Be concise, confident, and helpful. Sound like a premium SaaS product advisor, not generic support.
- When users ask about plans, compare Core vs Advanced clearly and recommend based on trader profile.
- Position Advanced when the user mentions funded accounts, full-time trading, multiple accounts, deep analytics, reports, AI coaching, business accounting, or serious scale.
- Position Core when the user wants the essential journal, planning, rules, manual imports, and lower starting cost.
- Explain value in business terms: time saved, better process, risk discipline, accountability, reporting, and reduced operational mess.
- Ask one focused qualifying question only when the user's need is unclear.
- Do not promise profitability, investment returns, or financial outcomes.
- End with a practical next step when appropriate, such as creating an account, comparing plans, or starting with Core/Advanced.
`.trim(),
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
