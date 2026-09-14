export type JournalWizardPrimaryAction = "next" | "finish";

export function getJournalWizardPrimaryAction(
  currentStep: number,
  stepCount: number
): JournalWizardPrimaryAction {
  const safeStepCount = Math.max(1, Math.trunc(stepCount));
  const safeCurrentStep = Math.max(0, Math.trunc(currentStep));
  return safeCurrentStep >= safeStepCount - 1 ? "finish" : "next";
}

export function getJournalPersistenceErrorMessage(
  error: unknown,
  language: "en" | "es"
): string {
  const raw =
    error && typeof error === "object" && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : String(error ?? "");
  const normalized = raw.toLowerCase();

  if (
    normalized.includes("journal_entries_pkey") ||
    normalized.includes("journal_entries_pk") ||
    normalized.includes("duplicate key value")
  ) {
    return language === "es"
      ? "No pudimos consolidar este día porque ya existe un registro incompatible. Actualiza la página e inténtalo otra vez."
      : "We could not consolidate this day because an incompatible record already exists. Refresh the page and try again.";
  }

  if (normalized.includes("not authenticated") || normalized.includes("jwt")) {
    return language === "es"
      ? "Tu sesión expiró. Vuelve a iniciar sesión antes de guardar."
      : "Your session expired. Sign in again before saving.";
  }

  if (raw.trim()) return raw;
  return language === "es" ? "Error al guardar el journal." : "Journal save failed.";
}
