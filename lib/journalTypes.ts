// lib/journalTypes.ts

export type JournalEntry = {
  date: string; // YYYY-MM-DD
  pnl: number; // P&L in USD
  instrument?: string;
  direction?: "long" | "short";
  entryPrice?: number;
  exitPrice?: number;
  size?: number;
  screenshots?: string[]; // URLs
  notes?: string; // aquí va tu JSON string (premarket/live/post/entries/exits)
  emotion?: string;
  tags?: string[];
  respectedPlan?: boolean;
};
