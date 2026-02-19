export type InstrumentType =
  | "stock"
  | "option"
  | "future"
  | "crypto"
  | "forex"
  | "other";

export type StoredTradeRow = {
  id: string;
  symbol: string;
  kind: InstrumentType;

  side?: "long" | "short";
  premium?: "Debit" | "Credit";
  strategy?: string;

  price: number;
  quantity: number;
  time: string;
};

export type TradesPayload = {
  premarket?: string;
  live?: string;
  post?: string;
  entries?: StoredTradeRow[];
  exits?: StoredTradeRow[];
};

export function parseNotes(notes?: string | null): TradesPayload {
  if (!notes || typeof notes !== "string") return {};
  try {
    const parsed = JSON.parse(notes);
    if (parsed && typeof parsed === "object") return parsed as TradesPayload;
    return {};
  } catch {
    return { premarket: notes };
  }
}
