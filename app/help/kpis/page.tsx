import {
  KPI_CATEGORY_LABELS,
  KPI_DEFINITIONS,
  KPI_DIRECTION,
  formatKpiInputs,
  getKpiText,
  humanizeKpiFormula,
  type KPICategory,
} from "@/lib/kpiLibrary";
import { getHelpLocale } from "../_lib/locale";

const CATEGORY_ORDER: KPICategory[] = [
  "profitability_edge",
  "risk_drawdown",
  "risk_adjusted",
  "distribution",
  "execution",
  "exposure",
];

const CATEGORY_LABELS_ES: Record<KPICategory, string> = {
  profitability_edge: "Rentabilidad y ventaja",
  risk_drawdown: "Riesgo y drawdown",
  risk_adjusted: "Riesgo ajustado y relativo",
  distribution: "Estabilidad y métricas por trade",
  execution: "Ejecución y costos",
  exposure: "Exposición y MAE/MFE",
};

export default async function HelpKpisPage() {
  const lang = await getHelpLocale();
  const isEs = lang === "es";
  const T = (en: string, es: string) => (isEs ? es : en);
  const categoryLabels = isEs ? CATEGORY_LABELS_ES : KPI_CATEGORY_LABELS;

  const groups = CATEGORY_ORDER.map((category) => ({
    category,
    label: categoryLabels[category],
    items: KPI_DEFINITIONS.filter((kpi) => kpi.category === category),
  }));

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.3em] text-emerald-400">
          {T("KPIs & Metrics", "KPIs y métricas")}
        </p>
        <h1 className="text-2xl font-semibold text-slate-100">
          {T("Institutional KPI Library", "Biblioteca de KPIs institucionales")}
        </h1>
        <p className="text-sm text-slate-300">
          {T(
            "Use this page as the reference for what each KPI means, how it is calculated, and how to interpret it.",
            "Usa esta página como referencia de qué significa cada KPI, cómo se calcula y cómo interpretarlo."
          )}
        </p>
      </header>

      {groups.map((group) => (
        <section key={group.category} className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-100">{group.label}</h2>
          <div className="space-y-3">
            {group.items.map((kpi) => {
              const direction = KPI_DIRECTION[kpi.id];
              const text = getKpiText(kpi, lang);
              const formula = humanizeKpiFormula(text.formula, lang);
              const inputs = formatKpiInputs(kpi.requiredInputs, lang);
              const interpretation =
                direction === "higher"
                  ? T("Higher is better.", "Más alto es mejor.")
                  : direction === "lower"
                    ? T("Lower is better.", "Más bajo es mejor.")
                    : T("Interpret in context.", "Interpretar en contexto.");

              const purpose = [text.notes, text.method].filter(Boolean).join(" ");
              const edgeCases = kpi.edgeCases?.length ? kpi.edgeCases.join("; ") : "—";

              return (
                <details
                  key={kpi.id}
                  className="rounded-2xl border px-4 py-3"
                  style={{
                    backgroundColor: "rgba(15, 23, 42, 0.82)",
                    borderColor: "rgba(148, 163, 184, 0.22)",
                  }}
                >
                  <summary className="cursor-pointer text-sm font-semibold text-slate-100 flex flex-wrap items-center gap-2">
                    <span>{text.name}</span>
                    <span className="text-[11px] font-mono text-slate-500">{kpi.id}</span>
                  </summary>
                  <div className="mt-3 space-y-2 text-sm text-slate-300">
                    <p>
                      <span className="text-slate-400">{T("Meaning", "Significado")}: </span>
                      {text.definition}
                    </p>
                    <p>
                      <span className="text-slate-400">{T("Purpose", "Para qué sirve")}: </span>
                      {purpose || "—"}
                    </p>
                    <p>
                      <span className="text-slate-400">{T("Interpretation", "Interpretación")}: </span>
                      {interpretation}
                    </p>
                    <p>
                      <span className="text-slate-400">{T("Formula", "Fórmula")}: </span>
                      <span className="text-emerald-200">{formula}</span>
                    </p>
                    <p>
                      <span className="text-slate-400">{T("Required inputs", "Datos necesarios")}: </span>
                      {inputs.length ? (
                        <span className="inline-flex flex-wrap gap-2 mt-1">
                          {inputs.map((input) => (
                            <span
                              key={input}
                              className="rounded-full border border-slate-700/60 bg-slate-950/40 px-2 py-0.5 text-[11px] text-slate-200"
                            >
                              {input}
                            </span>
                          ))}
                        </span>
                      ) : (
                        <span>—</span>
                      )}
                    </p>
                    <p>
                      <span className="text-slate-400">{T("Example", "Ejemplo")}: </span>
                      {text.example}
                    </p>
                    <p>
                      <span className="text-slate-400">{T("Edge cases", "Casos especiales")}: </span>
                      {edgeCases}
                    </p>
                    <p className="text-xs text-slate-500">
                      {T("Unit", "Unidad")}: {kpi.unit} · {T("Data type", "Tipo de dato")}: {kpi.dataType}
                    </p>
                  </div>
                </details>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
