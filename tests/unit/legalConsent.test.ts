import { describe, expect, it } from "vitest";

import {
  CHECKOUT_DISCLOSURE_VERSION,
  CURRENT_PRIVACY_VERSION,
  CURRENT_TERMS_VERSION,
  isCurrentCheckoutLegalAcceptancePayload,
  isCurrentSignupLegalAcceptancePayload,
} from "@/lib/legalConsent";

describe("legal consent payloads", () => {
  it("requires separate signup agreements for terms, privacy, and platform disclosure", () => {
    const base = {
      legalAccepted: true,
      termsVersion: CURRENT_TERMS_VERSION,
      privacyVersion: CURRENT_PRIVACY_VERSION,
    };

    expect(isCurrentSignupLegalAcceptancePayload(base)).toBe(false);
    expect(
      isCurrentSignupLegalAcceptancePayload({
        ...base,
        termsReadAccepted: true,
        privacyReadAccepted: true,
        platformDisclosureAccepted: true,
      })
    ).toBe(true);
  });

  it("requires checkout disclosure version before subscription checkout", () => {
    const base = {
      legalAccepted: true,
      termsVersion: CURRENT_TERMS_VERSION,
      privacyVersion: CURRENT_PRIVACY_VERSION,
      termsReadAccepted: true,
      privacyReadAccepted: true,
      checkoutDisclosureAccepted: true,
    };

    expect(isCurrentCheckoutLegalAcceptancePayload(base)).toBe(false);
    expect(
      isCurrentCheckoutLegalAcceptancePayload({
        ...base,
        disclosureVersion: CHECKOUT_DISCLOSURE_VERSION,
      })
    ).toBe(true);
  });
});
