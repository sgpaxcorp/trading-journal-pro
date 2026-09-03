export const CURRENT_TERMS_VERSION = "2026-09-03";
export const CURRENT_PRIVACY_VERSION = "2026-09-03";
export const CHECKOUT_DISCLOSURE_VERSION = "2026-09-03";
export const FREE_TRIAL_DAYS = 5;

export type LegalAcceptanceSource =
  | "signup"
  | "start"
  | "checkout"
  | "addon_checkout"
  | "in_app_update";

export function hasCurrentLegalAcceptance(input: {
  termsVersion?: unknown;
  privacyVersion?: unknown;
  acceptedAt?: unknown;
}) {
  return (
    String(input.termsVersion ?? "") === CURRENT_TERMS_VERSION &&
    String(input.privacyVersion ?? "") === CURRENT_PRIVACY_VERSION &&
    Boolean(input.acceptedAt)
  );
}

export function isCurrentLegalAcceptancePayload(input: {
  legalAccepted?: unknown;
  termsVersion?: unknown;
  privacyVersion?: unknown;
}) {
  return (
    input.legalAccepted === true &&
    String(input.termsVersion ?? "") === CURRENT_TERMS_VERSION &&
    String(input.privacyVersion ?? "") === CURRENT_PRIVACY_VERSION
  );
}
