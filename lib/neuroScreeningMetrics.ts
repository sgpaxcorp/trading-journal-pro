import { financialNumberOrNull } from "@/lib/neuroFinancialDataIntegrity";

export type ScreeningMetricInput = {
  name: string;
  value: number | null;
};

export type DerivedScreeningMetric = {
  value: number | null;
  formula: string;
  inputs: ScreeningMetricInput[];
  missingInputs: string[];
};

type FundamentalPeriod = {
  operatingIncome?: number | null;
  pretaxIncome?: number | null;
  incomeTaxExpense?: number | null;
  totalDebt?: number | null;
  stockholdersEquity?: number | null;
  cashAndCashEquivalents?: number | null;
  currentAssets?: number | null;
  currentLiabilities?: number | null;
  interestExpense?: number | null;
};

function input(name: string, value: unknown): ScreeningMetricInput {
  return { name, value: financialNumberOrNull(value) };
}

function missing(inputs: ScreeningMetricInput[]) {
  return inputs.filter((item) => item.value == null).map((item) => item.name);
}

export function calculateRoicProxy(period?: FundamentalPeriod | null): DerivedScreeningMetric {
  const inputs = [
    input("operating income", period?.operatingIncome),
    input("pretax income", period?.pretaxIncome),
    input("income tax expense", period?.incomeTaxExpense),
    input("total debt", period?.totalDebt),
    input("stockholders' equity", period?.stockholdersEquity),
    input("cash and equivalents", period?.cashAndCashEquivalents),
  ];
  const missingInputs = missing(inputs);
  const [operatingIncome, pretaxIncome, incomeTaxExpense, totalDebt, equity, cash] = inputs.map((item) => item.value);
  const formula = "operatingIncome * (1 - incomeTaxExpense / pretaxIncome) / (totalDebt + stockholdersEquity - cashAndEquivalents)";
  if (missingInputs.length || pretaxIncome == null || pretaxIncome <= 0) {
    return {
      value: null,
      formula,
      inputs,
      missingInputs: pretaxIncome != null && pretaxIncome <= 0
        ? [...missingInputs, "positive pretax income"]
        : missingInputs,
    };
  }

  const effectiveTaxRate = Math.min(1, Math.max(0, (incomeTaxExpense as number) / pretaxIncome));
  const investedCapital = (totalDebt as number) + (equity as number) - (cash as number);
  if (investedCapital <= 0) {
    return { value: null, formula, inputs, missingInputs: ["positive invested capital"] };
  }
  const value = ((operatingIncome as number) * (1 - effectiveTaxRate)) / investedCapital;
  return { value: Number.isFinite(value) ? value : null, formula, inputs, missingInputs: [] };
}

export function calculateCurrentRatio(period?: FundamentalPeriod | null): DerivedScreeningMetric {
  const inputs = [
    input("current assets", period?.currentAssets),
    input("current liabilities", period?.currentLiabilities),
  ];
  const missingInputs = missing(inputs);
  const formula = "currentAssets / currentLiabilities";
  if (missingInputs.length || inputs[1].value == null || inputs[1].value <= 0) {
    return {
      value: null,
      formula,
      inputs,
      missingInputs: inputs[1].value != null && inputs[1].value <= 0
        ? [...missingInputs, "positive current liabilities"]
        : missingInputs,
    };
  }
  return {
    value: (inputs[0].value as number) / inputs[1].value,
    formula,
    inputs,
    missingInputs: [],
  };
}

export function calculateInterestCoverage(period?: FundamentalPeriod | null): DerivedScreeningMetric {
  const inputs = [
    input("operating income", period?.operatingIncome),
    input("interest expense", period?.interestExpense),
  ];
  const missingInputs = missing(inputs);
  const formula = "operatingIncome / abs(interestExpense)";
  if (missingInputs.length || inputs[1].value == null || inputs[1].value === 0) {
    return {
      value: null,
      formula,
      inputs,
      missingInputs: inputs[1].value === 0
        ? [...missingInputs, "non-zero interest expense"]
        : missingInputs,
    };
  }
  return {
    value: (inputs[0].value as number) / Math.abs(inputs[1].value),
    formula,
    inputs,
    missingInputs: [],
  };
}
