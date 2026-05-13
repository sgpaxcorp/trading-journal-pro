"use client";

import { Fragment } from "react";

type BrokerSupport = {
  name: string;
  region: "US" | "International" | "File import";
  snaptrade: boolean;
  csv: boolean;
};

type BrokerSupportTableProps = {
  L: (en: string, es: string) => string;
  title?: string;
  subtitle?: string;
  className?: string;
};

const BROKERS: BrokerSupport[] = [
  { name: "Alpaca", region: "US", snaptrade: true, csv: false },
  { name: "Alpaca Paper", region: "US", snaptrade: true, csv: false },
  { name: "Chase", region: "US", snaptrade: true, csv: false },
  { name: "E*Trade", region: "US", snaptrade: true, csv: false },
  { name: "Empower", region: "US", snaptrade: true, csv: false },
  { name: "Fidelity", region: "US", snaptrade: true, csv: false },
  { name: "Moomoo", region: "US", snaptrade: true, csv: false },
  { name: "Public", region: "US", snaptrade: true, csv: false },
  { name: "Robinhood", region: "US", snaptrade: true, csv: false },
  { name: "Schwab", region: "US", snaptrade: true, csv: false },
  { name: "Schwab OAuth", region: "US", snaptrade: true, csv: false },
  { name: "tastytrade", region: "US", snaptrade: true, csv: false },
  { name: "TD Direct Investing", region: "US", snaptrade: true, csv: false },
  { name: "TradeStation", region: "US", snaptrade: true, csv: false },
  { name: "TradeStation Paper", region: "US", snaptrade: true, csv: false },
  { name: "Tradier", region: "US", snaptrade: true, csv: false },
  { name: "Vanguard US", region: "US", snaptrade: true, csv: false },
  { name: "Webull US", region: "US", snaptrade: true, csv: true },
  { name: "Webull US OAuth", region: "US", snaptrade: true, csv: true },
  { name: "Wells Fargo", region: "US", snaptrade: true, csv: false },
  { name: "Interactive Brokers", region: "International", snaptrade: true, csv: true },
  { name: "Coinbase (crypto)", region: "International", snaptrade: true, csv: true },
  { name: "Thinkorswim (Schwab/TOS)", region: "File import", snaptrade: false, csv: true },
  { name: "Tradovate", region: "File import", snaptrade: false, csv: true },
  { name: "NinjaTrader", region: "File import", snaptrade: false, csv: true },
  { name: "Binance", region: "File import", snaptrade: false, csv: true },
];

const REGION_ORDER: BrokerSupport["region"][] = ["US", "International", "File import"];

function Check({ active }: { active: boolean }) {
  if (!active) {
    return <span className="text-slate-600 text-xs">—</span>;
  }
  return (
    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-emerald-400/70 bg-emerald-400/15 text-emerald-300 text-xs">
      ✓
    </span>
  );
}

export function BrokerSupportTable({
  L,
  title,
  subtitle,
  className = "",
}: BrokerSupportTableProps) {
  const groups = REGION_ORDER.map((region) => ({
    region,
    label:
      region === "US"
          ? L("Secure broker sync — US", "Sync seguro del bróker — US")
        : region === "International"
          ? L("Secure broker sync — International", "Sync seguro del bróker — Internacional")
          : L("Direct file imports", "Imports directos de archivos"),
    items: BROKERS.filter((b) => b.region === region),
  }));

  return (
    <div className={`rounded-3xl border border-slate-800 bg-slate-950/90 p-6 ${className}`}>
      <div className="flex flex-col gap-2 mb-4">
        <p className="text-emerald-400 text-xs uppercase tracking-[0.2em]">
          {L("Supported brokers", "Brokers soportados")}
        </p>
        <h3 className="text-xl md:text-2xl font-semibold text-slate-50">
          {title ?? L("Broker data coverage", "Cobertura de data del bróker")}
        </h3>
        <p className="text-[11px] text-slate-400">
          {subtitle ??
            L(
              "Use the strongest data path for each broker: secure sync, account statements, order history, or supported CSV/XLSX files.",
              "Usa la ruta de data más fuerte para cada bróker: sync seguro, account statements, order history o archivos CSV/XLSX soportados."
            )}
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-[11px]">
          <thead>
            <tr className="border-b border-slate-800 text-slate-300">
              <th className="py-3 pr-3">{L("Broker", "Broker")}</th>
              <th className="py-3 pr-3">{L("Region", "Región")}</th>
              <th className="py-3 pr-3 text-center">{L("Secure sync", "Sync seguro")}</th>
              <th className="py-3 text-center">{L("Statement / file import", "Import statement / archivo")}</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <Fragment key={group.region}>
                <tr>
                  <td colSpan={4} className="pt-4 pb-2 text-[10px] uppercase tracking-[0.2em] text-slate-500">
                    {group.label}
                  </td>
                </tr>
                {group.items.map((item) => (
                  <tr key={`${group.region}-${item.name}`} className="border-b border-slate-900/70">
                    <td className="py-2 pr-3 text-slate-100">{item.name}</td>
                    <td className="py-2 pr-3 text-slate-400">
                      {item.region === "US"
                        ? L("US", "EE. UU.")
                        : item.region === "International"
                          ? L("International", "Internacional")
                          : L("File import", "Import de archivo")}
                    </td>
                    <td className="py-2 pr-3 text-center">
                      <Check active={item.snaptrade} />
                    </td>
                    <td className="py-2 text-center">
                      <Check active={item.csv} />
                    </td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
