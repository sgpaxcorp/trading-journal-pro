// lib/journalNotes.ts

export type InstrumentType =
  | "stock"
  | "option"
  | "future"
  | "crypto"
  | "forex"
  | "other";

export type StoredTradeRow = {
  id: string;
  symbol: string; // antes "asset"
  kind: InstrumentType;
  price: number;
  quantity: number;
  time: string; // "HH:mm" o "HH:mm AM"
};

export type TradesPayload = {
  premarket?: string;
  live?: string;
  post?: string;
  entries?: StoredTradeRow[];
  exits?: StoredTradeRow[];
};

// parse seguro del JSON de notes
export function parseNotes(notes?: string | null): TradesPayload {
  if (!notes || typeof notes !== "string") return {};
  try {
    const parsed = JSON.parse(notes);
    if (parsed && typeof parsed === "object") return parsed as TradesPayload;
    return {};
  } catch {
    // Si era html plano antes, lo tratamos como premarket
    return { premarket: notes };
  }
}
