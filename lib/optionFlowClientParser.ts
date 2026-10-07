export type OptionFlowProviderId =
  | "unusualwhales"
  | "optionstrat"
  | "cheddarflow"
  | "quantdata"
  | "other";

export type OptionFlowParseProgress = {
  percent: number;
  scanned: number;
  accepted: number;
};

export type OptionFlowParsedFile = {
  rows: Array<Record<string, unknown>>;
  scanned: number;
  detectedSymbols: string[];
};

export const OPTION_FLOW_PROVIDERS: Array<{
  id: OptionFlowProviderId;
  label: string;
  hint: string;
}> = [
  { id: "unusualwhales", label: "Unusual Whales", hint: "Unusual Whales export" },
  { id: "optionstrat", label: "OptionStrat", hint: "OptionStrat flow export" },
  { id: "cheddarflow", label: "Cheddar Flow", hint: "Cheddar Flow export" },
  { id: "quantdata", label: "Quantdata", hint: "Quantdata flow export" },
  { id: "other", label: "Other", hint: "Generic options-flow file" },
];

const COLUMN_ALIASES: Record<string, string[]> = {
  underlying: [
    "underlying",
    "underlying_symbol",
    "underlying symbol",
    "underlier",
    "underlier_symbol",
    "root",
    "root_symbol",
    "ticker",
  ],
  symbol: ["option_chain_id", "option chain id", "option_symbol", "option symbol", "contract", "symbol"],
  expiry: ["expiry", "expiration", "expiration date", "exp", "exp date"],
  strike: ["strike", "strike price", "strk"],
  type: ["type", "option type", "call_put", "put_call", "call/put", "put/call", "cp"],
  side: ["side", "side code", "trade side", "at", "aggressor", "print"],
  size: ["size", "qty", "quantity", "contracts"],
  volume: ["volume", "vol"],
  premium: ["premium", "notional", "value", "cost", "total premium"],
  oi: ["oi", "open interest", "open_interest", "openinterest", "open int", "openint"],
  oiChange: ["oi change", "oi_change", "open interest change", "open_interest_change"],
  oiAsOfDate: ["oi as of date", "open interest as of date", "oi date", "open_interest_date"],
  bid: ["nbbo_bid", "nbbo bid", "bid", "bid price"],
  ask: ["nbbo_ask", "nbbo ask", "ask", "ask price"],
  tradePrice: ["trade", "trade_price", "trade price", "option price", "price", "fill", "executed"],
  underlyingPrice: ["underlying_price", "underlying price", "spot", "reference price"],
  delta: ["delta"],
  iv: ["implied_volatility", "implied volatility", "implied vol", "implied_vol", "iv"],
  date: ["trade date", "date"],
  time: ["trade time", "time", "timestamp", "date/time", "datetime"],
};

function normalizedKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeSymbol(value: unknown) {
  return String(value ?? "").toUpperCase().replace(/[^A-Z0-9.^=-]/g, "");
}

function extractUnderlying(value: unknown): string | null {
  const normalized = normalizeSymbol(value);
  if (!normalized) return null;
  const occ = normalized.match(/^([A-Z]{1,8})(?:W)?\d{6}[CP]\d{8}$/);
  if (occ) return occ[1];
  const verbose = normalized.match(/^([A-Z]{1,8})(?:W)?\d{4}/);
  if (verbose) return verbose[1];
  const plain = normalized.match(/^[A-Z.^=-]{1,10}$/);
  return plain ? plain[0] : null;
}

function findValue(row: Record<string, unknown>, aliases: string[]) {
  const entries = Object.entries(row);
  for (const alias of aliases) {
    const target = normalizedKey(alias);
    const exact = entries.find(([key]) => normalizedKey(key) === target);
    if (exact && exact[1] !== "") return exact[1];
  }
  return null;
}

export function normalizeOptionFlowClientRow(row: Record<string, unknown>) {
  const normalized: Record<string, unknown> = { ...row };
  for (const [canonical, aliases] of Object.entries(COLUMN_ALIASES)) {
    const value = findValue(row, aliases);
    if (value != null) normalized[canonical] = value;
  }
  return normalized;
}

export function detectOptionFlowRowSymbol(row: Record<string, unknown>): string | null {
  for (const key of ["underlying", "ticker", "root", "symbol", "option_chain_id", "contract"]) {
    const value = findValue(row, COLUMN_ALIASES[key] ?? [key]);
    const symbol = extractUnderlying(value);
    if (symbol) return symbol;
  }
  for (const value of Object.values(row)) {
    const symbol = extractUnderlying(value);
    if (symbol) return symbol;
  }
  return null;
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

function headerScore(cells: unknown[]): number {
  const hints = Object.values(COLUMN_ALIASES).flat().map(normalizedKey);
  return cells.reduce<number>((score, cell) => {
    const key = normalizedKey(String(cell ?? ""));
    return score + (key && hints.some((hint) => key === hint || key.includes(hint)) ? 1 : 0);
  }, 0);
}

async function parseCsvFile(
  file: File,
  onProgress: (progress: OptionFlowParseProgress) => void,
  maxRows: number
): Promise<Array<Record<string, unknown>>> {
  const workerSource = `
    const parseLine = ${parseCsvLine.toString()};
    const normalizedKey = ${normalizedKey.toString()};
    const aliases = ${JSON.stringify(COLUMN_ALIASES)};
    const hints = Object.values(aliases).flat().map(normalizedKey);
    const headerScore = (cells) => cells.reduce((score, cell) => {
      const key = normalizedKey(String(cell || ""));
      return score + (key && hints.some((hint) => key === hint || key.includes(hint)) ? 1 : 0);
    }, 0);
    self.onmessage = async ({ data }) => {
      const text = await data.file.text();
      const lines = text.split(/\\r?\\n/).filter((line) => line.trim());
      let headerIndex = 0;
      let bestScore = -1;
      for (let index = 0; index < Math.min(lines.length, 12); index += 1) {
        const score = headerScore(parseLine(lines[index]));
        if (score > bestScore) { bestScore = score; headerIndex = index; }
      }
      const header = parseLine(lines[headerIndex]).map((cell, index) => cell || 'column_' + index);
      const rows = [];
      let scanned = 0;
      for (let index = headerIndex + 1; index < lines.length && rows.length < data.maxRows; index += 1) {
        const cells = parseLine(lines[index]);
        if (cells.length <= 1) continue;
        const row = {};
        header.forEach((key, cellIndex) => { row[key] = cells[cellIndex] || ''; });
        rows.push(row);
        scanned += 1;
        if (scanned % 250 === 0) {
          self.postMessage({ type: 'progress', percent: Math.round((index / lines.length) * 100), scanned, accepted: rows.length });
        }
      }
      self.postMessage({ type: 'complete', rows, scanned });
    };
  `;
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([workerSource], { type: "text/javascript" }));
    const worker = new Worker(url);
    worker.onmessage = (event) => {
      if (event.data?.type === "progress") {
        onProgress({
          percent: Number(event.data.percent ?? 0),
          scanned: Number(event.data.scanned ?? 0),
          accepted: Number(event.data.accepted ?? 0),
        });
        return;
      }
      if (event.data?.type === "complete") {
        worker.terminate();
        URL.revokeObjectURL(url);
        resolve(event.data.rows ?? []);
      }
    };
    worker.onerror = (error) => {
      worker.terminate();
      URL.revokeObjectURL(url);
      reject(error);
    };
    worker.postMessage({ file, maxRows });
  });
}

function normalizeSpreadsheetCell(value: any): string | number | boolean {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== "object") return value;
  if (Array.isArray(value.richText)) {
    return value.richText.map((part: any) => String(part?.text ?? "")).join("");
  }
  if ("result" in value) return normalizeSpreadsheetCell(value.result);
  if ("text" in value) return String(value.text ?? "");
  return String(value);
}

async function parseExcelFile(
  file: File,
  onProgress: (progress: OptionFlowParseProgress) => void,
  maxRows: number
) {
  onProgress({ percent: 10, scanned: 0, accepted: 0 });
  const excelModule = await import("exceljs");
  const ExcelJS = (excelModule.default ?? excelModule) as typeof import("exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load((await file.arrayBuffer()) as any);
  const grid: any[][] = [];
  workbook.worksheets[0]?.eachRow({ includeEmpty: false }, (row) => {
    const values = Array.isArray(row.values) ? row.values.slice(1) : [];
    grid.push(values.map(normalizeSpreadsheetCell));
  });
  const populated = grid.filter((row) => row.some((cell) => String(cell ?? "").trim()));
  if (!populated.length) return [];
  let headerIndex = 0;
  let bestScore = -1;
  populated.slice(0, 12).forEach((row, index) => {
    const score = headerScore(row);
    if (score > bestScore) {
      bestScore = score;
      headerIndex = index;
    }
  });
  const header = populated[headerIndex].map((cell, index) => String(cell || `column_${index}`));
  const rows = populated.slice(headerIndex + 1, headerIndex + 1 + maxRows).map((cells) => {
    const row: Record<string, unknown> = {};
    header.forEach((key, index) => {
      row[key] = cells[index] ?? "";
    });
    return row;
  });
  onProgress({ percent: 100, scanned: populated.length - headerIndex - 1, accepted: rows.length });
  return rows;
}

export async function parseOptionFlowFile(
  file: File,
  _provider: OptionFlowProviderId,
  onProgress: (progress: OptionFlowParseProgress) => void,
  maxRows = 2_000
): Promise<OptionFlowParsedFile> {
  const name = file.name.toLowerCase();
  let rawRows: Array<Record<string, unknown>> = [];
  if (name.endsWith(".csv")) rawRows = await parseCsvFile(file, onProgress, maxRows);
  else if (name.endsWith(".xlsx")) rawRows = await parseExcelFile(file, onProgress, maxRows);
  else throw new Error("Only CSV and XLSX files are supported.");

  const rows = rawRows.map(normalizeOptionFlowClientRow);
  const detectedSymbols = Array.from(
    new Set(rows.map(detectOptionFlowRowSymbol).filter((symbol): symbol is string => Boolean(symbol)))
  ).sort();
  onProgress({ percent: 100, scanned: rawRows.length, accepted: rows.length });
  return { rows, scanned: rawRows.length, detectedSymbols };
}

export async function sha256File(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function rowsForOptionFlowSymbol(
  rows: Array<Record<string, unknown>>,
  symbol: string
): Array<Record<string, unknown>> {
  const target = normalizeSymbol(symbol);
  if (!target) return [];
  return rows.filter((row) => {
    const candidate = normalizeSymbol(detectOptionFlowRowSymbol(row));
    return candidate === target || candidate === `${target}W` || target === `${candidate}W`;
  });
}
