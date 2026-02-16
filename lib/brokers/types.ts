export type BrokerId = "thinkorswim" | "tos" | "ibkr" | "tradovate" | "ninjatrader" | "other";
export type ImportType = "order_history" | "trade_history" | "fills" | "other";

export type OrderEventType =
  | "ORDER_PLACED"
  | "ORDER_FILLED"
  | "ORDER_CANCELED"
  | "ORDER_REPLACED";

export type AssetKind = "option" | "stock" | "future" | "forex" | "crypto" | "other";

export type NormalizedOrderEvent = {
  date: string; // YYYY-MM-DD (source tz)
  ts_utc: string; // ISO UTC
  ts_source?: string | null;
  source_tz?: string | null;
  event_type: OrderEventType;
  status?: string | null;
  side?: string | null; // BUY/SELL
  pos_effect?: string | null; // TO_OPEN/TO_CLOSE
  qty?: number | null;
  symbol?: string | null;
  instrument_key: string;
  asset_kind?: AssetKind | null;
  order_type?: string | null; // LMT/MKT/STP/etc
  limit_price?: number | null;
  stop_price?: number | null;
  oco_id?: string | null;
  replace_id?: string | null;
  raw?: Record<string, any>;
};

export type ParseResult = {
  events: NormalizedOrderEvent[];
  warnings: string[];
  stats: {
    rows_found: number;
    rows_parsed: number;
    events_saved: number;
    header_row?: number | null;
  };
};

export type ParserOptions = {
  sourceTz: string;
};

export type BrokerParser = (rawText: string, opts: ParserOptions) => ParseResult;
