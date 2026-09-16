export const INVESTMENT_PROBABILITY_NOT_AVAILABLE =
  "INVESTMENT PROBABILITY NOT AVAILABLE";

export type ValidatedStatisticalModelDisclosure = {
  modelName: string;
  modelVersion: string;
  methodology: string;
  validationEvidence: string;
  sampleDefinition: string;
  assumptions: string[];
  limitations: string[];
  calculationTimestamp: string;
  sourceData: string[];
};

function hasText(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function hasTextArray(value: unknown) {
  return Array.isArray(value) && value.length > 0 && value.every(hasText);
}

export function hasValidatedStatisticalModelDisclosure(
  value: unknown
): value is ValidatedStatisticalModelDisclosure {
  if (!value || typeof value !== "object") return false;
  const disclosure = value as Record<string, unknown>;
  return (
    hasText(disclosure.modelName) &&
    hasText(disclosure.modelVersion) &&
    hasText(disclosure.methodology) &&
    hasText(disclosure.validationEvidence) &&
    hasText(disclosure.sampleDefinition) &&
    hasTextArray(disclosure.assumptions) &&
    hasTextArray(disclosure.limitations) &&
    hasText(disclosure.calculationTimestamp) &&
    hasTextArray(disclosure.sourceData)
  );
}

const PROBABILITY_VALUE =
  String.raw`(?:\d{1,3}(?:\.\d+)?\s*%|\d{1,3}(?:\.\d+)?\s*\/\s*(?:10|100)|0\.\d+)`;
const PROBABILITY_TERM =
  String.raw`(?:probability|chance|likelihood|odds|probabilidad|posibilidad|probabilidades)`;
const LLM_CERTAINTY_TERM =
  String.raw`(?:AI\s+confidence|LLM\s+confidence|model\s+confidence|confidence(?:\s+score)?|certainty|AI\s+certainty|confianza(?:\s+(?:de\s+la\s+)?IA)?|confianza\s+del\s+modelo|puntaje\s+de\s+confianza|certeza(?:\s+(?:de\s+la\s+)?IA)?)`;
const INVESTMENT_OUTCOME =
  String.raw`(?:stock|share|price|investment|return|market|thesis|security|equity|acción|acciones|precio|inversión|retorno|rendimiento|mercado|tesis|valor)`;
const OUTCOME_DIRECTION =
  String.raw`(?:increase|rise|gain|outperform|succeed|success|decline|fall|lose|underperform|subir|aumentar|ganar|superar|éxito|bajar|caer|perder|fracasar)`;

const FORBIDDEN_PATTERNS = [
  new RegExp(`${PROBABILITY_VALUE}[^\n]{0,90}${PROBABILITY_TERM}|${PROBABILITY_TERM}[^\n]{0,90}${PROBABILITY_VALUE}`, "i"),
  new RegExp(`${LLM_CERTAINTY_TERM}[^\n]{0,40}${PROBABILITY_VALUE}`, "i"),
  new RegExp(`${PROBABILITY_VALUE}[^\n]{0,100}${INVESTMENT_OUTCOME}[^\n]{0,80}${OUTCOME_DIRECTION}`, "i"),
  new RegExp(`${PROBABILITY_VALUE}[^\n]{0,100}${OUTCOME_DIRECTION}[^\n]{0,80}${INVESTMENT_OUTCOME}`, "i"),
  new RegExp(
    String.raw`(?:high|strong|very high|alta|gran|muy alta)\s+(?:AI\s+|model\s+|LLM\s+|de\s+la\s+IA\s+|del\s+modelo\s+)?(?:confidence|certainty|confianza|certeza)[^\n]{0,120}${INVESTMENT_OUTCOME}[^\n]{0,80}${OUTCOME_DIRECTION}`,
    "i"
  ),
  new RegExp(
    String.raw`(?:high|strong|very high|alta|gran|muy alta)\s+(?:AI\s+|model\s+|LLM\s+|de\s+la\s+IA\s+|del\s+modelo\s+)?(?:confidence|certainty|confianza|certeza)[^\n]{0,120}${OUTCOME_DIRECTION}`,
    "i"
  ),
];

function containsForbiddenInvestmentProbabilityClaim(text: string) {
  return FORBIDDEN_PATTERNS.some((pattern) => pattern.test(text));
}

export function enforceInvestmentProbabilityIntegrity(
  text: string,
  options: { validatedModel?: unknown } = {}
) {
  const input = String(text ?? "");
  if (hasValidatedStatisticalModelDisclosure(options.validatedModel)) {
    return { text: input, blockedClaimCount: 0, validatedStatisticalModelUsed: true };
  }

  let blockedClaimCount = 0;
  const output: string[] = [];
  for (const line of input.split("\n")) {
    if (!containsForbiddenInvestmentProbabilityClaim(line)) {
      output.push(line);
      continue;
    }
    blockedClaimCount += 1;
    const replacement = `${INVESTMENT_PROBABILITY_NOT_AVAILABLE} - no separately validated statistical model was supplied.`;
    if (output.at(-1) !== replacement) output.push(replacement);
  }

  return {
    text: output.join("\n"),
    blockedClaimCount,
    validatedStatisticalModelUsed: false,
  };
}

export function auditAiInvestmentProbabilityPayload(
  value: unknown,
  options: { validatedModel?: unknown } = {}
): unknown {
  if (typeof value === "string") {
    return enforceInvestmentProbabilityIntegrity(value, options).text;
  }
  if (Array.isArray(value)) {
    return value.map((item) => auditAiInvestmentProbabilityPayload(item, options));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        auditAiInvestmentProbabilityPayload(item, options),
      ])
    );
  }
  return value;
}

export const INVESTMENT_PROBABILITY_INTEGRITY_PROMPT = `
INVESTMENT PROBABILITY INTEGRITY RULE (MANDATORY):
- Never present language-model confidence, certainty, conviction, evidence strength, explanation quality, or a heuristic score as a probability of price appreciation, return, investment success, thesis success, downside, or loss.
- Never output statements such as "85% chance this stock will increase", "AI confidence: 92%", "Probability of successful investment: 78%", or equivalent statements in another language.
- Language-model certainty about an explanation is not statistical evidence about future market returns.
- An investment probability may be displayed only when it comes from a separately validated statistical model whose supplied disclosure includes model name and version, methodology, validation evidence, sample definition, assumptions, limitations, calculation timestamp, and source data.
- Without that complete statistical-model disclosure, express uncertainty qualitatively, identify evidence gaps, and never manufacture a percentage.
`.trim();
