import { AlertCircle, ExternalLink, Network } from "lucide-react";

import {
  PORTFOLIO_EXPOSURE_LABELS,
  type PortfolioDependencyGraph,
  type PortfolioExposureMap,
} from "@/lib/neuroPortfolioExposure";
import { DATA_NOT_AVAILABLE } from "@/lib/neuroFinancialDataIntegrity";

type Props = {
  map: PortfolioExposureMap | null;
  isEs: boolean;
  loading: boolean;
  onRun: () => void;
};

function formatPct(value: number | null, isEs: boolean) {
  if (value == null || !Number.isFinite(value)) return DATA_NOT_AVAILABLE;
  return new Intl.NumberFormat(isEs ? "es-PR" : "en-US", {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(value / 100);
}

function tone(value: string) {
  if (value === "high" || value === "negative") return "border-rose-400/40 text-rose-200";
  if (value === "medium" || value === "mixed") return "border-amber-400/40 text-amber-200";
  if (value === "low" || value === "positive") return "border-emerald-400/40 text-emerald-200";
  return "border-slate-700 text-slate-400";
}

function graphColor(direction: string) {
  if (direction === "positive") return "#34d399";
  if (direction === "negative") return "#fb7185";
  if (direction === "mixed") return "#fbbf24";
  return "#64748b";
}

function magnitudeWidth(magnitude: string) {
  if (magnitude === "high") return 3.5;
  if (magnitude === "medium") return 2.25;
  return 1.25;
}

function visibleGraph(graph: PortfolioDependencyGraph, commonNames: Set<string>) {
  const preferred = graph.driverNodes.filter((node) => commonNames.has(node.dependencyName)).slice(0, 8);
  const drivers = preferred.length ? preferred : graph.driverNodes.slice(0, 8);
  const driverIds = new Set(drivers.map((node) => node.id));
  const edges = graph.edges.filter((edge) => driverIds.has(edge.target));
  const holdingIds = new Set(edges.map((edge) => edge.source));
  const holdings = graph.holdingNodes.filter((node) => holdingIds.has(node.id));
  return { drivers, edges, holdings };
}

function DependencyGraph({ map, isEs }: { map: PortfolioExposureMap; isEs: boolean }) {
  const commonNames = new Set(map.commonDependencies.map((dependency) => dependency.dependencyName));
  const graph = visibleGraph(map.dependencyGraph, commonNames);
  const width = 960;
  const rowCount = Math.max(graph.holdings.length, graph.drivers.length, 4);
  const height = Math.max(340, 72 + rowCount * 64);
  const holdingY = new Map(
    graph.holdings.map((node, index) => [node.id, ((index + 1) * height) / (graph.holdings.length + 1)])
  );
  const driverY = new Map(
    graph.drivers.map((node, index) => [node.id, ((index + 1) * height) / (graph.drivers.length + 1)])
  );

  if (!graph.edges.length) {
    return (
      <div className="flex min-h-56 items-center justify-center border-y border-slate-800 px-6 text-center text-sm leading-6 text-slate-500">
        {isEs
          ? "Todavía no hay conexiones respaldadas por evidencia para dibujar."
          : "There are not yet enough evidence-backed connections to draw the graph."}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto border-y border-slate-800 bg-slate-950/30">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="min-w-[900px]"
        style={{ width: "100%", height: `${height}px` }}
        role="img"
        aria-label={isEs ? "Grafo de dependencias económicas de la cartera" : "Portfolio economic dependency graph"}
      >
        <text x="28" y="30" fill="#64748b" fontSize="11" fontWeight="700">
          {isEs ? "POSICIONES" : "HOLDINGS"}
        </text>
        <text x="710" y="30" fill="#64748b" fontSize="11" fontWeight="700">
          {isEs ? "DEPENDENCIAS ECONÓMICAS" : "ECONOMIC DEPENDENCIES"}
        </text>
        {graph.edges.map((edge) => {
          const y1 = holdingY.get(edge.source);
          const y2 = driverY.get(edge.target);
          if (y1 == null || y2 == null) return null;
          return (
            <path
              key={edge.id}
              d={`M 208 ${y1} C 410 ${y1}, 520 ${y2}, 700 ${y2}`}
              fill="none"
              stroke={graphColor(edge.direction)}
              strokeOpacity="0.62"
              strokeWidth={magnitudeWidth(edge.magnitude)}
            />
          );
        })}
        {graph.holdings.map((node) => {
          const y = holdingY.get(node.id) ?? 0;
          return (
            <g key={node.id}>
              <rect x="24" y={y - 22} width="184" height="44" rx="7" fill="#0f172a" stroke="#334155" />
              <text x="40" y={y - 3} fill="#f8fafc" fontSize="13" fontWeight="700">{node.ticker}</text>
              <text x="40" y={y + 13} fill="#94a3b8" fontSize="10">{formatPct(node.weightPct, isEs)}</text>
            </g>
          );
        })}
        {graph.drivers.map((node) => {
          const y = driverY.get(node.id) ?? 0;
          const name = node.dependencyName.length > 31 ? `${node.dependencyName.slice(0, 30)}...` : node.dependencyName;
          return (
            <g key={node.id}>
              <rect x="700" y={y - 25} width="232" height="50" rx="7" fill="#082f49" stroke="#0e7490" />
              <text x="716" y={y - 5} fill="#cffafe" fontSize="11" fontWeight="700">{name}</text>
              <text x="716" y={y + 12} fill="#67e8f9" fontSize="9">
                {PORTFOLIO_EXPOSURE_LABELS[node.driver]} / {formatPct(node.grossPortfolioWeightPct, isEs)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default function PortfolioExposureMapPanel({ map, isEs, loading, onRun }: Props) {
  if (!map) {
    return (
      <section className="rounded-xl border border-cyan-400/25 bg-slate-900/80 p-5 shadow-lg shadow-slate-950/20">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Network className="h-4 w-4 text-cyan-300" />
              <h2 className="text-base font-semibold">{isEs ? "Mapa de Exposición de Cartera" : "Portfolio Exposure Map"}</h2>
            </div>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              {isEs
                ? "Descubre dependencias económicas compartidas que no aparecen al contar tickers o sectores."
                : "Reveal shared economic dependencies that ticker counts and sector labels cannot show."}
            </p>
          </div>
          <button
            type="button"
            onClick={onRun}
            disabled={loading}
            className="inline-flex min-h-10 items-center justify-center rounded-lg border border-cyan-400/50 bg-cyan-400/10 px-4 py-2 text-sm font-semibold text-cyan-100 hover:bg-cyan-400/20 disabled:opacity-50"
          >
            {loading ? (isEs ? "Analizando..." : "Analyzing...") : (isEs ? "Crear mapa" : "Build map")}
          </button>
        </div>
      </section>
    );
  }

  const crossSectorCount = map.commonDependencies.filter((dependency) => dependency.crossSector).length;
  const coveredTickers = new Set(map.holdingExposures.map((exposure) => exposure.ticker)).size;

  return (
    <section className="rounded-xl border border-cyan-400/25 bg-slate-900/80 p-4 shadow-lg shadow-slate-950/20 sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-4xl">
          <div className="flex items-center gap-2">
            <Network className="h-4 w-4 text-cyan-300" />
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-300">
              {isEs ? "Mapa de Exposición de Cartera" : "Portfolio Exposure Map"}
            </p>
          </div>
          <h2 className="mt-2 text-lg font-semibold text-slate-50">
            {isEs ? "Las dependencias que conectan tus posiciones" : "The dependencies connecting your holdings"}
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">{map.summary}</p>
        </div>
        <span className={`inline-flex min-h-9 items-center self-start rounded-full border px-3 py-2 text-xs font-bold ${
          map.evidenceStatus === "ready"
            ? "border-emerald-400/50 bg-emerald-400/10 text-emerald-100"
            : map.evidenceStatus === "partial"
              ? "border-amber-400/50 bg-amber-400/10 text-amber-100"
              : "border-slate-600 bg-slate-950/60 text-slate-200"
        }`}>
          {map.evidenceStatus.toUpperCase()}
        </span>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          [isEs ? "Dependencias comunes" : "Common dependencies", map.commonDependencies.length],
          [isEs ? "Cruzan sectores" : "Cross-sector links", crossSectorCount],
          [isEs ? "Posiciones cubiertas" : "Holdings covered", coveredTickers],
          [isEs ? "Exposiciones verificadas" : "Verified exposures", map.holdingExposures.length],
        ].map(([label, value]) => (
          <div key={String(label)} className="border-l-2 border-cyan-400/40 bg-slate-950/35 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase text-slate-500">{label}</p>
            <p className="mt-1 text-lg font-bold text-slate-100">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-6">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase text-slate-300">{isEs ? "Grafo de dependencias" : "Dependency graph"}</p>
            <p className="mt-1 text-[11px] text-slate-500">
              {isEs
                ? "El grosor refleja sensibilidad documentada; el color refleja dirección, no una recomendación."
                : "Line width reflects documented sensitivity; color reflects direction, not a recommendation."}
            </p>
          </div>
          <div className="flex flex-wrap gap-3 text-[10px] font-semibold text-slate-500">
            <span className="text-emerald-300">{isEs ? "Positiva" : "Positive"}</span>
            <span className="text-rose-300">{isEs ? "Negativa" : "Negative"}</span>
            <span className="text-amber-300">{isEs ? "Mixta" : "Mixed"}</span>
          </div>
        </div>
        <DependencyGraph map={map} isEs={isEs} />
      </div>

      <div className="mt-6">
        <p className="text-xs font-semibold uppercase text-slate-300">
          {isEs ? "Dependencias compartidas" : "Shared dependencies"}
        </p>
        <div className="mt-2 divide-y divide-slate-800 border-y border-slate-800">
          {map.commonDependencies.map((dependency) => (
            <article key={`${dependency.driver}-${dependency.dependencyName}`} className="py-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-slate-100">{dependency.dependencyName}</p>
                    <span className="rounded-full border border-cyan-400/30 px-2 py-1 text-[10px] font-semibold text-cyan-200">
                      {PORTFOLIO_EXPOSURE_LABELS[dependency.driver]}
                    </span>
                    {dependency.crossSector ? (
                      <span className="rounded-full border border-violet-400/30 px-2 py-1 text-[10px] font-semibold text-violet-200">
                        {isEs ? "Cruza sectores" : "Cross-sector"}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 text-xs leading-5 text-slate-400">{dependency.mechanism}</p>
                  <p className="mt-2 text-[11px] text-slate-500">
                    {dependency.tickers.join(" / ")}{dependency.sectors.length ? ` · ${dependency.sectors.join(" / ")}` : ""}
                  </p>
                </div>
                <div className="w-full shrink-0 lg:w-56">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">{isEs ? "Peso bruto conectado" : "Connected gross weight"}</span>
                    <span className="font-semibold text-slate-100">{formatPct(dependency.grossPortfolioWeightPct, isEs)}</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-800">
                    <div className="h-full rounded-full bg-cyan-400" style={{ width: `${dependency.grossPortfolioWeightPct == null ? 0 : Math.min(100, dependency.grossPortfolioWeightPct)}%` }} />
                  </div>
                </div>
              </div>
            </article>
          ))}
          {!map.commonDependencies.length ? (
            <p className="py-5 text-sm text-slate-500">
              {isEs
                ? "No se verificaron dependencias compartidas entre dos o más posiciones."
                : "No shared dependency was verified across two or more holdings."}
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-6 overflow-x-auto border-y border-slate-800">
        <table className="w-full min-w-[900px] text-left text-xs">
          <thead className="bg-slate-950/50 text-[10px] uppercase text-slate-500">
            <tr>
              <th className="px-3 py-3">{isEs ? "Posición" : "Holding"}</th>
              <th className="px-3 py-3">{isEs ? "Driver" : "Driver"}</th>
              <th className="px-3 py-3">{isEs ? "Dependencia" : "Dependency"}</th>
              <th className="px-3 py-3">{isEs ? "Dirección" : "Direction"}</th>
              <th className="px-3 py-3">{isEs ? "Magnitud" : "Magnitude"}</th>
              <th className="px-3 py-3">{isEs ? "Evidencia" : "Evidence"}</th>
            </tr>
          </thead>
          <tbody>
            {map.holdingExposures.slice(0, 40).map((exposure, index) => {
              const evidence = exposure.evidence.find((row) => row.status === "identified");
              return (
                <tr key={`${exposure.ticker}-${exposure.driver}-${index}`} className="border-t border-slate-800 align-top">
                  <td className="px-3 py-3 font-semibold text-slate-100">{exposure.ticker}</td>
                  <td className="px-3 py-3 text-slate-400">{PORTFOLIO_EXPOSURE_LABELS[exposure.driver]}</td>
                  <td className="px-3 py-3">
                    <p className="font-semibold text-slate-200">{exposure.dependencyName}</p>
                    <p className="mt-1 max-w-lg leading-5 text-slate-500">{exposure.channel}</p>
                  </td>
                  <td className="px-3 py-3">
                    <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${tone(exposure.direction)}`}>
                      {exposure.direction.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${tone(exposure.magnitude)}`}>
                      {exposure.magnitude.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-slate-500">
                    {evidence?.sourceUrl ? (
                      <a href={evidence.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-cyan-300 hover:text-cyan-100">
                        {evidence.sourceLabel} / {evidence.sourceDate}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <span>{evidence?.sourceLabel ?? (isEs ? "No disponible" : "Unavailable")} / {evidence?.sourceDate ?? "-"}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {map.missingEvidence.length ? (
        <div className="mt-5 border-l-2 border-amber-300 pl-4">
          <div className="flex items-center gap-2 text-amber-200">
            <AlertCircle className="h-4 w-4" />
            <p className="text-xs font-semibold uppercase">{isEs ? "Evidencia pendiente" : "Evidence still needed"}</p>
          </div>
          <ul className="mt-2 space-y-1 text-xs leading-5 text-amber-100/75">
            {map.missingEvidence.slice(0, 10).map((item, index) => <li key={`exposure-missing-${index}`}>• {item}</li>)}
          </ul>
        </div>
      ) : null}

      <p className="mt-5 border-t border-slate-800 pt-4 text-xs font-semibold text-slate-500">
        {isEs
          ? "Este mapa presenta exposición y magnitud para revisión humana. No recomienda diversificar, rebalancear ni ejecutar trades automáticamente."
          : "This map presents exposure and magnitude for human review. It does not automatically recommend diversification, rebalancing, or trades."}
      </p>
    </section>
  );
}
