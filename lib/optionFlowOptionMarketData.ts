import "server-only";

import {
  normalizeOccOptionSymbol,
  type OptionFlowContractSnapshot,
} from "@/lib/optionFlowIntelligence";

const FETCH_TIMEOUT_MS = 12_000;
const MASSIVE_BASE_URL = "https://api.massive.com";

type ContractRequest = {
  underlying: string;
  contractSymbol: string;
};

export type OptionFlowMarketDataStatus = {
  provider: "massive" | "none";
  configured: boolean;
  mode: "automatic" | "import_only";
  capabilities: string[];
  message: string;
};

function finiteOrNull(value: unknown): number | null {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function nanosecondsToIso(value: unknown): string | null {
  if (value == null || value === "") return null;
  const raw = Number(value);
  if (!Number.isFinite(raw)) return null;
  const milliseconds = raw > 10_000_000_000_000 ? Math.trunc(raw / 1_000_000) : raw;
  const date = new Date(milliseconds);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function getOptionFlowMarketDataStatus(): OptionFlowMarketDataStatus {
  const configured = Boolean(String(process.env.MASSIVE_OPTIONS_API_KEY ?? "").trim());
  return configured
    ? {
        provider: "massive",
        configured: true,
        mode: "automatic",
        capabilities: ["daily_open_interest", "contract_price", "bid_ask", "volume", "greeks", "implied_volatility"],
        message: "Automatic options snapshots are enabled through Massive.",
      }
    : {
        provider: "none",
        configured: false,
        mode: "import_only",
        capabilities: ["uploaded_open_interest", "uploaded_contract_price", "uploaded_bid_ask", "uploaded_volume"],
        message: "Automatic options market data is not configured. Uploaded evidence remains available and is labeled by source quality.",
      };
}

async function fetchMassiveContractSnapshot(input: ContractRequest): Promise<OptionFlowContractSnapshot> {
  const apiKey = String(process.env.MASSIVE_OPTIONS_API_KEY ?? "").trim();
  if (!apiKey) throw new Error("MASSIVE_OPTIONS_API_KEY is not configured.");
  const underlying = input.underlying.trim().toUpperCase().replace(/[^A-Z0-9.^=-]/g, "");
  const contractSymbol = normalizeOccOptionSymbol(input.contractSymbol);
  if (!underlying || !contractSymbol) throw new Error("A valid underlying and OCC contract symbol are required.");

  const endpoint = `/v3/snapshot/options/${encodeURIComponent(underlying)}/O:${encodeURIComponent(contractSymbol)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(`${MASSIVE_BASE_URL}${endpoint}`, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Massive option snapshot failed with ${response.status}${detail ? `: ${detail.slice(0, 180)}` : ""}.`);
    }
    const payload = await response.json();
    const result = payload?.results ?? payload?.result ?? null;
    if (!result || typeof result !== "object") throw new Error("Massive returned no option snapshot.");

    const details = result.details ?? {};
    const quote = result.last_quote ?? {};
    const trade = result.last_trade ?? {};
    const day = result.day ?? {};
    const greeks = result.greeks ?? {};
    const underlyingAsset = result.underlying_asset ?? {};
    const bid = finiteOrNull(quote.bid);
    const ask = finiteOrNull(quote.ask);
    const midpoint = finiteOrNull(quote.midpoint) ?? (bid != null && ask != null ? (bid + ask) / 2 : null);

    return {
      contractSymbol,
      underlyingSymbol: underlying,
      expiry: typeof details.expiration_date === "string" ? details.expiration_date : null,
      strike: finiteOrNull(details.strike_price),
      optionType: details.contract_type === "call" ? "C" : details.contract_type === "put" ? "P" : null,
      observedAt: nanosecondsToIso(quote.last_updated ?? trade.sip_timestamp) ?? new Date().toISOString(),
      sourceId: "massive",
      sourceReference: `massive:${endpoint}`,
      openInterest: finiteOrNull(result.open_interest),
      volume: finiteOrNull(day.volume),
      lastPrice: finiteOrNull(trade.price) ?? finiteOrNull(result.fmv),
      closePrice: finiteOrNull(day.close),
      bid,
      ask,
      midpoint,
      impliedVolatility: finiteOrNull(result.implied_volatility),
      delta: finiteOrNull(greeks.delta),
      underlyingPrice: finiteOrNull(underlyingAsset.price),
      oiTemporalStatus: "verified_prior_close",
      priceSessionDate: null,
      openInterestAsOfDate: null,
      snapshotKind: null,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchOptionFlowContractMarketSnapshots(input: {
  contracts: ContractRequest[];
  snapshotKind: string;
  priceSessionDate?: string | null;
  openInterestAsOfDate?: string | null;
  concurrency?: number;
}): Promise<{
  provider: "massive" | "none";
  snapshots: OptionFlowContractSnapshot[];
  errors: Array<{ contractSymbol: string; message: string }>;
}> {
  const status = getOptionFlowMarketDataStatus();
  if (!status.configured) return { provider: "none", snapshots: [], errors: [] };

  const unique = Array.from(
    new Map(
      input.contracts
        .map((contract) => ({ ...contract, contractSymbol: normalizeOccOptionSymbol(contract.contractSymbol) }))
        .filter((contract): contract is ContractRequest => Boolean(contract.contractSymbol))
        .map((contract) => [contract.contractSymbol, contract])
    ).values()
  );
  const snapshots: OptionFlowContractSnapshot[] = [];
  const errors: Array<{ contractSymbol: string; message: string }> = [];
  const concurrency = Math.max(1, Math.min(8, Math.trunc(input.concurrency ?? 4)));
  let cursor = 0;

  async function worker() {
    while (cursor < unique.length) {
      const index = cursor;
      cursor += 1;
      const contract = unique[index];
      try {
        const snapshot = await fetchMassiveContractSnapshot(contract);
        snapshots.push({
          ...snapshot,
          snapshotKind: input.snapshotKind,
          priceSessionDate: input.priceSessionDate ?? null,
          openInterestAsOfDate: input.openInterestAsOfDate ?? null,
        });
      } catch (error) {
        errors.push({
          contractSymbol: contract.contractSymbol,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, unique.length || 1) }, () => worker()));
  return { provider: "massive", snapshots, errors };
}
