type Lang = "en" | "es";

export type NeuroEventType =
  | "import_success"
  | "import_error"
  | "sync_success"
  | "sync_error"
  | "pnl_profit"
  | "pnl_loss"
  | "pnl_flat";

export type NeuroEventPayload = {
  filename?: string;
  importedCount?: number;
  syncedCount?: number;
  symbol?: string;
  pnl?: number;
  currency?: string;
  timeframe?: string;
  notes?: string;
};

let lastSentAt = 0;

export async function sendNeuroEvent(args: {
  type: NeuroEventType;
  payload?: NeuroEventPayload;
  contextPath: string;
  lang: Lang;
  cooldownMs?: number; // default 2500
}): Promise<{ text: string } | null> {
  const cooldownMs = args.cooldownMs ?? 2500;

  const now = Date.now();
  if (now - lastSentAt < cooldownMs) return null; // anti-spam
  lastSentAt = now;

  const res = await fetch("/api/neuro-event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: args.type,
      payload: args.payload ?? {},
      contextPath: args.contextPath,
      lang: args.lang,
    }),
  });

  if (!res.ok) return null;

  const data = (await res.json()) as { text?: string };
  return { text: data.text || "" };
}
