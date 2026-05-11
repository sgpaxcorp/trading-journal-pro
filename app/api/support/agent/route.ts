import fs from "node:fs";
import path from "node:path";

import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";

import { getAuthUser } from "@/lib/authServer";
import { getClientIp, rateLimit, rateLimitHeaders } from "@/lib/rateLimit";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";

export const runtime = "nodejs";

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const DOCS_ROOT = path.resolve(process.cwd(), "docs", "user-manual");
const DEFAULT_MODEL = process.env.SUPPORT_AGENT_MODEL || "gpt-4.1-mini";

type SupportTicketRow = {
  id: string;
  user_id: string | null;
  subject?: string | null;
  status?: string | null;
};

type SupportMessageRow = {
  id: string;
  ticket_id: string;
  user_id: string | null;
  author_role?: string | null;
  message: string;
  created_at?: string | null;
};

type AgentDecision = {
  canAnswer: boolean;
  reply: string;
  rationale: string;
  suggestedCategory: string;
};

function parseAdminEmails(envValue?: string | null) {
  return (envValue || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

async function isAdmin(userId: string, email?: string | null) {
  const { data, error } = await supabaseAdmin
    .from("admin_users")
    .select("user_id,active")
    .eq("user_id", userId)
    .eq("active", true)
    .limit(1);

  if (!error && (data ?? []).length > 0) return true;

  const allowList = parseAdminEmails(process.env.ADMIN_EMAILS);
  return Boolean(email && allowList.includes(email.toLowerCase()));
}

function detectLanguage(text: string): "es" | "en" {
  const lower = text.toLowerCase();
  if (
    /[áéíóúñ¿¡]/.test(lower) ||
    /\b(hola|gracias|ayuda|problema|no puedo|no me|correo|pago|suscrip|factur|mensaje|soporte|usuario|cuenta)\b/.test(lower)
  ) {
    return "es";
  }
  return "en";
}

function fallbackReply(language: "es" | "en") {
  if (language === "es") {
    return "Gracias por escribirnos. Ya estamos evaluando tu caso y un miembro del equipo te responderá en un plazo de 24 a 48 horas.";
  }
  return "Thanks for reaching out. We are reviewing your case and a team member will reply within 24 to 48 hours.";
}

function safeDocPath(relativePath: string) {
  const fullPath = path.join(DOCS_ROOT, relativePath);
  if (!fullPath.startsWith(DOCS_ROOT)) {
    throw new Error("Invalid support doc path.");
  }
  return fullPath;
}

function loadDocSnippet(relativePath: string, maxChars = 4000) {
  try {
    const filePath = safeDocPath(relativePath);
    const content = fs.readFileSync(filePath, "utf8").trim();
    return content.slice(0, maxChars);
  } catch {
    return "";
  }
}

const DOC_CATALOG = [
  {
    key: "overview",
    fileEn: "en/overview.md",
    fileEs: "es/overview.md",
    keywords: ["overview", "workspace", "platform", "dashboard", "general", "features", "benefits"],
  },
  {
    key: "getting_started",
    fileEn: "en/getting-started.md",
    fileEs: "es/getting-started.md",
    keywords: ["signup", "verify", "account", "login", "mobile", "start", "setup", "create account", "verification"],
  },
  {
    key: "billing",
    fileEn: "en/billing.md",
    fileEs: "es/billing.md",
    keywords: ["billing", "plan", "subscription", "renew", "renewal", "cancel", "payment", "invoice", "receipt", "checkout", "stripe", "broker sync", "option flow", "facturacion", "suscripcion", "pago", "cancelacion", "renovacion"],
  },
  {
    key: "journal",
    fileEn: "en/journal.md",
    fileEs: "es/journal.md",
    keywords: ["journal", "session", "premarket", "post-trade", "entry", "exit", "trades", "journalear", "sesion"],
  },
  {
    key: "analytics",
    fileEn: "en/analytics.md",
    fileEs: "es/analytics.md",
    keywords: ["analytics", "kpi", "metrics", "reports", "performance", "analitica", "reporte"],
  },
  {
    key: "rules_alarms",
    fileEn: "en/rules-alarms.md",
    fileEs: "es/rules-alarms.md",
    keywords: ["alarm", "alert", "reminder", "rule", "notific", "alarma", "recordatorio"],
  },
  {
    key: "data_inputs",
    fileEn: "en/data-inputs.md",
    fileEs: "es/data-inputs.md",
    keywords: ["import", "csv", "broker", "snaptrade", "webull", "tradovate", "data", "importacion"],
  },
  {
    key: "ai_coaching",
    fileEn: "en/ai-coaching.md",
    fileEs: "es/ai-coaching.md",
    keywords: ["ai", "coach", "coaching", "assistant", "ia", "coach"],
  },
];

function buildSupportContext(language: "es" | "en", queryText: string) {
  const lower = queryText.toLowerCase();
  const ranked = DOC_CATALOG
    .map((doc) => {
      const score = doc.keywords.reduce(
        (sum, keyword) => sum + (lower.includes(keyword.toLowerCase()) ? 1 : 0),
        0
      );
      return { ...doc, score };
    })
    .sort((a, b) => b.score - a.score);

  const selected = ranked
    .filter((doc) => doc.score > 0)
    .slice(0, 3);

  if (!selected.length) {
    selected.push(...ranked.filter((doc) => ["overview", "getting_started", "billing"].includes(doc.key)).slice(0, 3));
  }

  return selected
    .map((doc) => {
      const file = language === "es" ? doc.fileEs : doc.fileEn;
      const content = loadDocSnippet(file);
      return content ? `### ${doc.key}\n${content}` : "";
    })
    .filter(Boolean)
    .join("\n\n");
}

function buildConversationSummary(ticket: SupportTicketRow, messages: SupportMessageRow[]) {
  const recent = messages.slice(-10);
  return [
    `Ticket subject: ${ticket.subject || "Support request"}`,
    ...recent.map((message) => {
      const role =
        message.author_role === "admin"
          ? "human_support"
          : message.author_role === "assistant"
            ? "service_agent"
            : "user";
      return `${role}: ${String(message.message || "").trim()}`;
    }),
  ].join("\n");
}

function tryParseDecision(rawText: string | null | undefined): AgentDecision | null {
  const text = String(rawText || "").trim();
  if (!text) return null;
  const normalized = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/, "");
  try {
    const parsed = JSON.parse(normalized);
    return {
      canAnswer: Boolean(parsed?.canAnswer),
      reply: String(parsed?.reply ?? "").trim(),
      rationale: String(parsed?.rationale ?? "").trim(),
      suggestedCategory: String(parsed?.suggestedCategory ?? "").trim(),
    };
  } catch {
    return null;
  }
}

async function createAgentDecision(params: {
  ticket: SupportTicketRow;
  messages: SupportMessageRow[];
  language: "es" | "en";
}) {
  if (!openai) {
    return {
      canAnswer: false,
      reply: fallbackReply(params.language),
      rationale: "OPENAI_API_KEY is not configured.",
      suggestedCategory: "manual_review",
    } satisfies AgentDecision;
  }

  const context = buildSupportContext(
    params.language,
    `${params.ticket.subject || ""}\n${params.messages.map((message) => message.message).join("\n")}`
  );
  const conversation = buildConversationSummary(params.ticket, params.messages);
  const instructions =
    params.language === "es"
      ? [
          "Eres el agente de servicio de NeuroTrader Journal.",
          "Responde solo con información sustentada por la conversación y el contexto de ayuda provisto.",
          "Si la pregunta requiere revisar cuenta específica, pagos excepcionales, reembolso, bug técnico, activación manual, o algo no claramente cubierto por la documentación, NO inventes: marca canAnswer=false.",
          "Si sí puedes responder, da una respuesta corta, clara y útil en el mismo idioma del usuario.",
          "Devuelve JSON válido solamente con las claves: canAnswer, reply, rationale, suggestedCategory.",
        ].join(" ")
      : [
          "You are the NeuroTrader Journal service agent.",
          "Answer only with information supported by the ticket conversation and the provided help context.",
          "If the request needs account-specific investigation, refund exceptions, technical bug triage, manual activation, or anything not clearly supported by the docs, do NOT guess: set canAnswer=false.",
          "If you can answer, keep it short, clear, and useful in the user's language.",
          "Return valid JSON only with the keys: canAnswer, reply, rationale, suggestedCategory.",
        ].join(" ");

  const completion = await openai.chat.completions.create({
    model: DEFAULT_MODEL,
    temperature: 0.15,
    max_tokens: 500,
    messages: [
      {
        role: "system",
        content: instructions,
      },
      {
        role: "user",
        content: `Help context:\n${context}\n\nTicket conversation:\n${conversation}`,
      },
    ],
  });

  const parsed = tryParseDecision(completion.choices[0]?.message?.content);
  if (!parsed || !parsed.reply) {
    return {
      canAnswer: false,
      reply: fallbackReply(params.language),
      rationale: "Model response could not be parsed safely.",
      suggestedCategory: "manual_review",
    } satisfies AgentDecision;
  }

  return parsed;
}

export async function POST(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      ticketId?: string;
      dryRun?: boolean;
    };

    const ticketId = String(body?.ticketId ?? "").trim();
    const dryRun = body?.dryRun === true;

    if (!ticketId) {
      return NextResponse.json({ error: "Missing ticketId" }, { status: 400 });
    }

    const [{ data: ticket, error: ticketError }, admin] = await Promise.all([
      supabaseAdmin
        .from("support_tickets")
        .select("id,user_id,subject,status")
        .eq("id", ticketId)
        .maybeSingle(),
      isAdmin(authUser.userId, authUser.email),
    ]);

    if (ticketError || !ticket) {
      return NextResponse.json({ error: ticketError?.message ?? "Ticket not found" }, { status: 404 });
    }

    if (!admin && ticket.user_id !== authUser.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (dryRun && !admin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const rateKey = dryRun
      ? `support-agent:dry-run:admin:${authUser.userId}:ticket:${ticketId}`
      : admin
        ? `support-agent:admin:${authUser.userId}:ticket:${ticketId}`
        : `support-agent:user:${authUser.userId}:ticket:${ticketId}:ip:${getClientIp(req)}`;
    const limiter = await rateLimit(rateKey, {
      limit: dryRun ? 6 : admin ? 12 : 4,
      windowMs: dryRun ? 5 * 60_000 : admin ? 10 * 60_000 : 15 * 60_000,
    });
    if (!limiter.allowed) {
      const retryAfter = Math.max(1, Math.ceil((limiter.resetAt - Date.now()) / 1000));
      return NextResponse.json(
        { error: "Rate limit exceeded" },
        {
          status: 429,
          headers: {
            "Retry-After": String(retryAfter),
            ...rateLimitHeaders(limiter),
          },
        }
      );
    }

    const { data: messages, error: messagesError } = await supabaseAdmin
      .from("support_messages")
      .select("id,ticket_id,user_id,author_role,message,created_at")
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: true });

    if (messagesError) {
      return NextResponse.json({ error: messagesError.message }, { status: 500 });
    }

    const thread = (messages ?? []) as SupportMessageRow[];
    const latestMessage = thread.at(-1) ?? null;
    if (!latestMessage) {
      return NextResponse.json({ error: "No ticket messages found." }, { status: 400 });
    }

    if (latestMessage.author_role !== "user" && !dryRun) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        canAnswer: false,
        reply: "",
        status: String((ticket as SupportTicketRow).status ?? "open"),
      });
    }

    const conversationText = `${ticket.subject || ""}\n${thread.map((message) => message.message).join("\n")}`;
    const language = detectLanguage(conversationText);
    const decision = await createAgentDecision({
      ticket: ticket as SupportTicketRow,
      messages: thread,
      language,
    });

    const finalReply =
      decision.canAnswer && decision.reply.trim()
        ? decision.reply.trim()
        : fallbackReply(language);

    const nextStatus = decision.canAnswer ? "waiting_user" : "waiting_support";

    if (!dryRun) {
      const { error: insertError } = await supabaseAdmin.from("support_messages").insert({
        ticket_id: ticketId,
        user_id: null,
        author_role: "assistant",
        message: finalReply,
        attachments: [],
      });

      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }

      const { error: updateError } = await supabaseAdmin
        .from("support_tickets")
        .update({
          status: nextStatus,
          last_message_at: new Date().toISOString(),
          last_message_by: "assistant",
        })
        .eq("id", ticketId);

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }
    }

    return NextResponse.json({
      ok: true,
      canAnswer: decision.canAnswer,
      reply: finalReply,
      rationale: decision.rationale,
      suggestedCategory: decision.suggestedCategory,
      status: nextStatus,
      skipped: false,
    });
  } catch (err: any) {
    console.error("[support/agent] error:", err);
    return NextResponse.json(
      { error: err?.message ?? "Unexpected support agent error" },
      { status: 500 }
    );
  }
}
