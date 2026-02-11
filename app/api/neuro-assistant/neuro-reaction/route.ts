import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getAuthUser } from "@/lib/authServer";
import { rateLimit, rateLimitHeaders } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 30;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type Lang = "en" | "es";

function safeJson(x: unknown) {
  try {
    return JSON.stringify(x ?? {}, null, 2);
  } catch {
    return "{}";
  }
}

/* =========================
   Deterministic (NO OpenAI)
========================= */

const FIELD_HELP: Record<Lang, Record<string, string>> = {
  en: {
    // Meta & Numbers
    starting_balance:
      "Starting balance: enter the current cash/equity balance from your broker account. This is the base number for risk and projections.",
    target_balance:
      "Target balance: the account size you want to reach by the end of the plan. Keep it realistic and time-bound.",
    trading_days:
      "Trading days: how many market days you’ll follow this plan. More days usually means lower daily pressure.",
    max_daily_loss:
      "Max daily loss: your hard stop for the day. If you hit it, stop trading—protect your mental capital and your account.",
    loss_days_per_week:
      "Loss days per week: used for the preview schedule. It assumes some red days happen; the plan distributes them across each 5-day week.",
    daily_goal_percent:
      "Daily goal (%): only used if you pick 'Your chosen plan'. This is your intended average goal on green days.",
    risk_per_trade:
      "Risk per trade (%): suggested max is 2%. This translates to a dollar risk per trade. If your risk is too high, reduce size or use cheaper contracts.",
    max_one_percent_loss_days:
      "Optional rule: how many -1% days you allow before doing a review/reset (reduce size, pause, or paper trade).",

    // Prepare
    prepare_checklist:
      "Prepare checklist: write items as YES/NO actions you can verify before entering a trade (news checked, levels marked, risk set, etc.).",
    prepare_notes:
      "Prepare notes: write what invalidates trading today and what you must avoid (impulses, revenge, overtrading).",

    // Analysis
    analysis_styles:
      "Analysis styles: select what you actually use (technical, flow, price action, etc.). Neuro/AI Coach will compare your trades to this identity.",
    analysis_other:
      "Other analysis: describe the method clearly so coaching stays accurate.",
    analysis_notes:
      "Analysis notes: write your confirmations and invalidations. What must be true before entry, and what cancels the setup?",

    // Strategy
    strategy_name:
      "Strategy name: keep it specific (e.g., 'SPX 0DTE breakout retest'). You’ll later tag trades to this.",
    strategy_setup:
      "Setup/Context: describe the market context needed (trend, range, key levels, volatility regime).",
    strategy_entryRules:
      "Entry rules: write clear conditions. Avoid 'feelings'—use checkable criteria.",
    strategy_exitRules:
      "Exit rules: define stop loss, take profit, and when to exit early.",
    strategy_managementRules:
      "Management rules: how you trail, scale, or adjust. Keep it simple and repeatable.",
    strategy_invalidation:
      "Invalidation: what specifically means the trade idea is wrong.",
    strategy_notes:
      "Strategy notes: general rules like 'no trades after max loss' or 'only A+ setups'.",

    // Journal
    journal_notes:
      "Journal plan: define what you’ll record (import trades, emotions, rule adherence, reasons, screenshots). This powers AI Coach feedback.",
    commitment:
      "Commitment: this is your agreement to follow the process. Results vary, but discipline is measurable.",
    rules:
      "Rules: these are your non-negotiables. If you break one, AI Coach should flag it and you should reduce size or pause.",
    add_rule:
      "Add rule: write rules as simple statements you can enforce (e.g., 'No revenge trading', 'Max 2 trades after a loss').",
  },
  es: {
    // Meta & Numbers
    starting_balance:
      "Starting balance: pon el balance actual (cash/equity) de tu cuenta del broker. Es la base para riesgo y proyecciones.",
    target_balance:
      "Target balance: el tamaño de cuenta al que quieres llegar al final del plan. Que sea realista y con tiempo definido.",
    trading_days:
      "Trading days: cuántos días de mercado vas a seguir este plan. Más días suele bajar la presión diaria.",
    max_daily_loss:
      "Max daily loss: tu freno de emergencia diario. Si lo alcanzas, paras de tradear para proteger cuenta y mente.",
    loss_days_per_week:
      "Loss days per week: solo para el preview. Asume días rojos y los distribuye por semana de 5 días.",
    daily_goal_percent:
      "Daily goal (%): se usa solo si eliges 'Your chosen plan'. Es tu meta promedio en días verdes.",
    risk_per_trade:
      "Risk per trade (%): sugerido máximo 2%. Esto se convierte en $ por trade. Si es alto, baja size o usa contratos más baratos.",
    max_one_percent_loss_days:
      "Regla opcional: cuántos días de -1% permites antes de hacer revisión/reset (bajar size, pausar o paper trade).",

    // Prepare
    prepare_checklist:
      "Checklist de Prepare: escríbelo como acciones Sí/No verificables antes de entrar (noticias, niveles, riesgo, etc.).",
    prepare_notes:
      "Notas de Prepare: qué invalida operar hoy y qué debes evitar (impulso, revenge, overtrading).",

    // Analysis
    analysis_styles:
      "Tipos de análisis: selecciona lo que realmente usas. Neuro/AI Coach comparará tus trades con esa identidad.",
    analysis_other:
      "Otro análisis: descríbelo claro para que el coaching sea preciso.",
    analysis_notes:
      "Notas de análisis: tus confirmaciones e invalidaciones. Qué debe ser cierto para entrar y qué cancela el setup.",

    // Strategy
    strategy_name:
      "Nombre de estrategia: específico (ej. 'SPX 0DTE breakout retest'). Luego podrás etiquetar trades.",
    strategy_setup:
      "Setup/Contexto: contexto necesario (tendencia/rango, niveles clave, volatilidad).",
    strategy_entryRules:
      "Reglas de entrada: condiciones claras y verificables. Evita 'sensaciones'.",
    strategy_exitRules:
      "Reglas de salida: define stop, take profit y cuándo salir temprano.",
    strategy_managementRules:
      "Manejo: cómo trail/escala/ajusta. Simple y repetible.",
    strategy_invalidation:
      "Invalidación: qué exactamente significa que la idea está mal.",
    strategy_notes:
      "Notas: reglas generales como 'no operar tras max loss' o 'solo A+'.",

    // Journal
    journal_notes:
      "Plan de journal: qué registrarás (import, emociones, reglas, razones, screenshots). Esto alimenta el coaching.",
    commitment:
      "Compromiso: acuerdo con el proceso. El resultado varía, pero la disciplina se mide.",
    rules:
      "Reglas: tus no-negociables. Si rompes una, AI Coach debe marcarlo y tú bajas size o pausas.",
    add_rule:
      "Añadir regla: reglas como frases simples que puedas cumplir (ej. 'No revenge trading', 'Máx 2 trades tras una pérdida').",
  },
};

const WIZARD_EVENTS: Record<string, Record<Lang, (to?: string) => string>> = {
  wizard_step_clicked: {
    en: (to) => `Opened: ${to ?? "this step"}. I’ll guide you on what to write here.`,
    es: (to) => `Abriste: ${to ?? "este paso"}. Te guío con qué escribir aquí.`,
  },
  wizard_step_next: {
    en: (to) => `Next: ${to ?? "next step"}. Keep it simple and checkable.`,
    es: (to) => `Siguiente: ${to ?? "próximo paso"}. Simple y verificable.`,
  },
  wizard_step_back: {
    en: (to) => `Back to: ${to ?? "previous step"}.`,
    es: (to) => `Regresamos a: ${to ?? "paso anterior"}.`,
  },
  growth_plan_loaded: {
    en: () => "Growth Plan loaded. We’ll go step-by-step. Ask me if you’re unsure what to enter.",
    es: () => "Growth Plan cargado. Vamos paso a paso. Pregúntame si dudas qué poner.",
  },
  growth_plan_saved: {
    en: () => "Saved ✅ Your plan is now the standard AI Coach will evaluate against. Execute the process.",
    es: () => "Guardado ✅ Este plan será el estándar para AI Coach. Ahora ejecuta el proceso.",
  },
  pdf_downloaded: {
    en: () => "PDF downloaded. Use it as structure, not a promise—focus on execution quality.",
    es: () => "PDF descargado. Úsalo como estructura, no promesa—enfócate en ejecución.",
  },
};

function isDeterministicEvent(event: string) {
  if (event === "field_help") return true;
  if (event in WIZARD_EVENTS) return true;
  return false;
}

function deterministicReply(event: string, lang: Lang, data: any): string {
  if (event === "field_help") {
    const field = String(data?.field ?? "");
    const msg = FIELD_HELP[lang][field];
    if (msg) return msg;

    // fallback
    return lang === "en"
      ? "Fill this field with clear, measurable info. Keep it simple and enforceable."
      : "Llena este campo con información clara y medible. Simple y que puedas cumplir.";
  }

  if (event in WIZARD_EVENTS) {
    const to = typeof data?.to === "string" ? data.to : undefined;
    return WIZARD_EVENTS[event][lang](to);
  }

  return "";
}

/* =========================
   OpenAI (micro coaching)
========================= */

function systemPrompt(lang: Lang) {
  return lang === "es"
    ? [
        "Eres Neuro, el guía dentro de la plataforma Neuro Tarder.",
        "Responde en español claro y práctico.",
        "Da micro-coaching basado en el evento (1–2 frases).",
        "Reglas:",
        "- No inventes datos del usuario.",
        "- No prometas ganancias; enfócate en proceso y disciplina.",
        "- Si el riesgo está alto, sugiere reducir size o contratos más baratos.",
        "- Mantén tono positivo incluso en pérdidas (reencuadre al proceso).",
        "- Si falta data, pregunta de forma mínima o da recomendación general.",
      ].join(" ")
    : [
        "You are Neuro, the in-app guide inside Neuro Tarder.",
        "Respond in clear, practical English.",
        "Give micro-coaching based on the event (1–2 sentences).",
        "Rules:",
        "- Do not invent user data.",
        "- Do not promise profits; focus on process and discipline.",
        "- If risk is high, suggest reducing size or using cheaper contracts.",
        "- Keep a positive tone even in losses (process reframing).",
        "- If data is missing, ask minimally or give general guidance.",
      ].join(" ");
}

export async function POST(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized", text: "" }, { status: 401 });
    }

    const rate = rateLimit(`neuro-reaction:user:${authUser.userId}`, {
      limit: 60,
      windowMs: 60_000,
    });
    if (!rate.allowed) {
      const retryAfter = Math.max(1, Math.ceil((rate.resetAt - Date.now()) / 1000));
      return NextResponse.json(
        { error: "Rate limit exceeded", text: "" },
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
    const event = (body.event as string | undefined) ?? "";
    const langRaw = (body.lang as string | undefined) ?? "en";
    const lang: Lang = langRaw === "es" ? "es" : "en";
    const data = body.data ?? {};

    if (!event) {
      return NextResponse.json({ error: "Missing event", text: "" }, { status: 400 });
    }

    // ✅ deterministic path (no hallucinations)
    if (isDeterministicEvent(event)) {
      const text = deterministicReply(event, lang, data);
      return NextResponse.json({ text });
    }

    // ✅ OpenAI for coaching-only events
    const userPrompt =
      lang === "es"
        ? `Evento: ${event}\nDatos: ${safeJson(data)}\nGenera 1–2 frases como Neuro (micro-coaching).`
        : `Event: ${event}\nData: ${safeJson(data)}\nGenerate 1–2 sentences as Neuro (micro coaching).`;

    const resp = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: systemPrompt(lang) },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.5,
      max_tokens: 90,
    });

    const text = resp.choices?.[0]?.message?.content?.trim() ?? "";
    return NextResponse.json({ text: text || "" });
  } catch (err) {
    console.error("[neuro-reaction] error", err);
    // Not failing the UX
    return NextResponse.json({ text: "" }, { status: 200 });
  }
}
