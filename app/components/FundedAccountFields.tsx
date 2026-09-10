"use client";

import type { FundedAccountProfile } from "@/lib/fundedAccounts";

type Props = {
  profile: FundedAccountProfile;
  onChange: (profile: FundedAccountProfile) => void;
  lang: "en" | "es";
  idPrefix: string;
};

export default function FundedAccountFields({ profile, onChange, lang, idPrefix }: Props) {
  const L = (en: string, es: string) => (lang === "es" ? es : en);
  const inputClass =
    "mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 outline-none focus:border-emerald-400";

  const update = <K extends keyof FundedAccountProfile>(
    key: K,
    value: FundedAccountProfile[K]
  ) => onChange({
    ...profile,
    [key]: value,
    rulesConfirmedAt:
      key === "rulesConfirmedAt"
        ? (value as FundedAccountProfile["rulesConfirmedAt"])
        : key === "currentEquity"
          ? profile.rulesConfirmedAt
          : null,
  });

  const numberValue = (value: number | null) => (value == null || value === 0 ? "" : String(value));
  const numberChange = (key: keyof FundedAccountProfile, raw: string) => {
    const value = raw.trim() === "" ? 0 : Math.max(0, Number(raw) || 0);
    update(key, value as never);
  };
  const nullableNumberChange = (key: keyof FundedAccountProfile, raw: string) => {
    const value = raw.trim() === "" ? null : Math.max(0, Number(raw) || 0);
    update(key, value as never);
  };

  return (
    <div className="border-t border-slate-800 pt-4">
      <div className="mb-3">
        <p className="text-xs font-semibold text-emerald-200">
          {L("Funded account identity and rules", "Identidad y reglas de la cuenta fondeada")}
        </p>
        <p className="mt-1 text-[11px] leading-5 text-slate-400">
          {L(
            "Identify the exact firm account, then enter its official program limits. Create a separate NeuroTrader account for every prop-firm credential, even when two accounts use the same program and size.",
            "Identifica la cuenta exacta de la firma y luego ingresa sus límites oficiales. Crea una cuenta separada en NeuroTrader por cada credencial de prop firm, aunque dos cuentas usen el mismo programa y tamaño."
          )}
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <label className="text-[11px] text-slate-400" htmlFor={`${idPrefix}-firm`}>
          {L("Funding firm *", "Firma de fondeo *")}
          <input
            id={`${idPrefix}-firm`}
            value={profile.firmName}
            onChange={(event) => update("firmName", event.target.value)}
            className={inputClass}
            placeholder={L("Firm name", "Nombre de la firma")}
          />
        </label>

        <label className="text-[11px] text-slate-400" htmlFor={`${idPrefix}-program`}>
          {L("Account program / category *", "Programa / categoría de cuenta *")}
          <input
            id={`${idPrefix}-program`}
            value={profile.programName}
            onChange={(event) => update("programName", event.target.value)}
            className={inputClass}
            placeholder={L("e.g. Express, One Step, Static", "ej. Express, One Step, Static")}
          />
        </label>

        <label className="text-[11px] text-slate-400" htmlFor={`${idPrefix}-stage`}>
          {L("Current stage *", "Etapa actual *")}
          <select
            id={`${idPrefix}-stage`}
            value={profile.stage}
            onChange={(event) => update("stage", event.target.value as FundedAccountProfile["stage"])}
            className={inputClass}
          >
            <option value="evaluation">{L("Evaluation", "Evaluación")}</option>
            <option value="verification">{L("Verification", "Verificación")}</option>
            <option value="funded">{L("Funded", "Fondeada")}</option>
          </select>
        </label>

        <label className="text-[11px] text-slate-400" htmlFor={`${idPrefix}-nominal`}>
          {L("Nominal account size *", "Tamaño nominal *")}
          <input
            id={`${idPrefix}-nominal`}
            type="number"
            min="0"
            step="0.01"
            value={numberValue(profile.nominalAccountSize)}
            onChange={(event) => {
              const nominal = Math.max(0, Number(event.target.value) || 0);
              onChange({
                ...profile,
                nominalAccountSize: nominal,
                currentEquity: profile.currentEquity > 0 ? profile.currentEquity : nominal,
                rulesConfirmedAt: null,
              });
            }}
            className={inputClass}
            placeholder="50000"
          />
        </label>

        <label className="text-[11px] text-slate-400" htmlFor={`${idPrefix}-equity`}>
          {L("Current equity *", "Equity actual *")}
          <input
            id={`${idPrefix}-equity`}
            type="number"
            min="0"
            step="0.01"
            value={numberValue(profile.currentEquity)}
            onChange={(event) => numberChange("currentEquity", event.target.value)}
            className={inputClass}
            placeholder="50000"
          />
        </label>

        <label className="text-[11px] text-slate-400" htmlFor={`${idPrefix}-target`}>
          {profile.stage === "funded"
            ? L("Cycle profit target above nominal *", "Meta del ciclo sobre el nominal *")
            : L("Evaluation profit target *", "Meta de ganancia de evaluación *")}
          <input
            id={`${idPrefix}-target`}
            type="number"
            min="0"
            step="0.01"
            value={numberValue(profile.profitTarget)}
            onChange={(event) => numberChange("profitTarget", event.target.value)}
            className={inputClass}
            placeholder="3000"
          />
        </label>

        <label className="text-[11px] text-slate-400" htmlFor={`${idPrefix}-daily-loss`}>
          {L("Official daily loss limit *", "Límite oficial de pérdida diaria *")}
          <input
            id={`${idPrefix}-daily-loss`}
            type="number"
            min="0"
            step="0.01"
            value={numberValue(profile.dailyLossLimit)}
            onChange={(event) => numberChange("dailyLossLimit", event.target.value)}
            className={inputClass}
            placeholder="1000"
          />
        </label>

        <label className="text-[11px] text-slate-400" htmlFor={`${idPrefix}-drawdown`}>
          {L("Maximum drawdown *", "Drawdown máximo *")}
          <input
            id={`${idPrefix}-drawdown`}
            type="number"
            min="0"
            step="0.01"
            value={numberValue(profile.maxDrawdown)}
            onChange={(event) => numberChange("maxDrawdown", event.target.value)}
            className={inputClass}
            placeholder="2000"
          />
        </label>

        <label className="text-[11px] text-slate-400" htmlFor={`${idPrefix}-drawdown-type`}>
          {L("Drawdown calculation", "Cálculo del drawdown")}
          <select
            id={`${idPrefix}-drawdown-type`}
            value={profile.drawdownType}
            onChange={(event) =>
              update("drawdownType", event.target.value as FundedAccountProfile["drawdownType"])
            }
            className={inputClass}
          >
            <option value="static">{L("Static", "Estático")}</option>
            <option value="trailing_eod">{L("Trailing end of day", "Trailing al cierre")}</option>
            <option value="trailing_intraday">{L("Trailing intraday", "Trailing intradía")}</option>
          </select>
        </label>

        <label className="text-[11px] text-slate-400" htmlFor={`${idPrefix}-floor`}>
          {L("Current breach floor", "Nivel actual de incumplimiento")}
          <input
            id={`${idPrefix}-floor`}
            type="number"
            min="0"
            step="0.01"
            value={numberValue(profile.drawdownFloor)}
            onChange={(event) => nullableNumberChange("drawdownFloor", event.target.value)}
            className={inputClass}
            placeholder={L("Calculated if blank", "Se calcula si está vacío")}
          />
        </label>

        <label className="text-[11px] text-slate-400" htmlFor={`${idPrefix}-minimum-days`}>
          {L("Minimum trading days", "Días mínimos de trading")}
          <input
            id={`${idPrefix}-minimum-days`}
            type="number"
            min="0"
            step="1"
            value={numberValue(profile.minimumTradingDays)}
            onChange={(event) => numberChange("minimumTradingDays", event.target.value)}
            className={inputClass}
          />
        </label>

        <label className="text-[11px] text-slate-400" htmlFor={`${idPrefix}-deadline`}>
          {L("Evaluation deadline", "Fecha límite de evaluación")}
          <input
            id={`${idPrefix}-deadline`}
            type="date"
            value={profile.evaluationDeadline ?? ""}
            onChange={(event) => update("evaluationDeadline", event.target.value || null)}
            className={inputClass}
          />
        </label>

        <label className="text-[11px] text-slate-400" htmlFor={`${idPrefix}-consistency`}>
          {L("Consistency limit (%)", "Límite de consistencia (%)")}
          <input
            id={`${idPrefix}-consistency`}
            type="number"
            min="0"
            max="100"
            step="0.01"
            value={numberValue(profile.consistencyRulePercent)}
            onChange={(event) => nullableNumberChange("consistencyRulePercent", event.target.value)}
            className={inputClass}
          />
        </label>

        <label className="text-[11px] text-slate-400" htmlFor={`${idPrefix}-positions`}>
          {L("Maximum positions/contracts", "Máximo de posiciones/contratos")}
          <input
            id={`${idPrefix}-positions`}
            type="number"
            min="0"
            step="1"
            value={numberValue(profile.maxPositions)}
            onChange={(event) => nullableNumberChange("maxPositions", event.target.value)}
            className={inputClass}
          />
        </label>

        {profile.stage === "funded" ? (
          <>
            <label className="text-[11px] text-slate-400" htmlFor={`${idPrefix}-split`}>
              {L("Trader profit split (%)", "Participación del trader (%)")}
              <input
                id={`${idPrefix}-split`}
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={numberValue(profile.profitSplitPercent)}
                onChange={(event) => nullableNumberChange("profitSplitPercent", event.target.value)}
                className={inputClass}
              />
            </label>
            <label className="text-[11px] text-slate-400" htmlFor={`${idPrefix}-payout`}>
              {L("Minimum payout", "Payout mínimo")}
              <input
                id={`${idPrefix}-payout`}
                type="number"
                min="0"
                step="0.01"
                value={numberValue(profile.payoutMinimum)}
                onChange={(event) => nullableNumberChange("payoutMinimum", event.target.value)}
                className={inputClass}
              />
            </label>
            <label className="text-[11px] text-slate-400" htmlFor={`${idPrefix}-payout-days`}>
              {L("Days required for payout", "Días requeridos para payout")}
              <input
                id={`${idPrefix}-payout-days`}
                type="number"
                min="0"
                step="1"
                value={numberValue(profile.payoutEligibleDays)}
                onChange={(event) => nullableNumberChange("payoutEligibleDays", event.target.value)}
                className={inputClass}
              />
            </label>
          </>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[11px] text-slate-300">
        {[
          ["newsTradingAllowed", L("News trading allowed", "Trading en noticias permitido")],
          ["overnightAllowed", L("Overnight positions allowed", "Posiciones overnight permitidas")],
          ["weekendAllowed", L("Weekend holding allowed", "Posiciones durante fin de semana permitidas")],
        ].map(([key, label]) => (
          <label key={key} className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={Boolean(profile[key as keyof FundedAccountProfile])}
              onChange={(event) => update(key as keyof FundedAccountProfile, event.target.checked as never)}
              className="h-4 w-4 accent-emerald-400"
            />
            {label}
          </label>
        ))}
      </div>

      <label className="mt-4 flex items-start gap-2 border-t border-slate-800 pt-4 text-[11px] leading-5 text-slate-300">
        <input
          type="checkbox"
          checked={Boolean(profile.rulesConfirmedAt)}
          onChange={(event) =>
            update("rulesConfirmedAt", event.target.checked ? new Date().toISOString() : null)
          }
          className="mt-0.5 h-4 w-4 accent-emerald-400"
        />
        <span>
          {L(
            "I verified these limits against the current official program rules. I understand the platform calculates operating guardrails but the firm's official agreement remains authoritative.",
            "Verifiqué estos límites con las reglas oficiales vigentes del programa. Entiendo que la plataforma calcula guardrails operativos, pero el acuerdo oficial de la firma continúa siendo la autoridad."
          )}
        </span>
      </label>
    </div>
  );
}
