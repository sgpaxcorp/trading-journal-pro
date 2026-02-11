# Security Best Practices Report — trading-journal-pro (Consolidated)

Date: 2026-02-11
Scope: Static review of the Next.js (TypeScript) codebase + recent changes from this session. No dynamic security testing or infrastructure inspection performed.

## Executive Summary
The project is in a **much stronger security posture** than the initial audit. The highest‑risk gaps (unauthenticated write endpoints and OpenAI endpoints) are now protected with auth and rate limiting. Remaining issues are **medium/low severity** and mostly defense‑in‑depth: sanitizing HTML output and adding baseline security headers.

**Findings summary**
- High: 0
- Medium: 2
- Low: 2

---

## Medium Severity Findings

### M-01: Potential XSS in Option Flow chat rendering
**Location:** `app/(private)/option-flow/page.tsx` (lines 3002–3005)

**Evidence:**
```tsx
<div dangerouslySetInnerHTML={{ __html: msg.html }} />
```

**Impact:** If `msg.html` ever contains untrusted HTML (AI output or user‑supplied content), it can execute in the browser. This is a classic XSS sink.

**Fix:** Sanitize HTML with an allowlist (e.g., DOMPurify) before rendering, or render structured data into React components instead of raw HTML.

---

### M-02: Missing baseline security headers (CSP, clickjacking protection, nosniff)
**Location:** `next.config.ts` (lines 1–7)

**Evidence:**
```ts
const nextConfig: NextConfig = {
  /* config options here */
};
```

**Impact:** Reduced defense‑in‑depth against XSS, clickjacking, and MIME‑type confusion attacks.

**Fix:** Add a baseline security header policy in `next.config.ts` (CSP, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, and `frame-ancestors` / `X-Frame-Options`). Verify at runtime.

---

## Low Severity Findings

### L-01: Public contact endpoint lacks rate limiting / abuse controls
**Location:** `app/api/contact/route.ts` (lines 7–38)

**Evidence:**
```ts
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  ...
  await resend.emails.send({ ... })
}
```

**Impact:** Can be spammed to flood support inbox or send abusive content. Also inserts user content into HTML emails.

**Fix:** Add rate limiting and CAPTCHA/honeypot. Consider escaping or sanitizing message HTML.

---

### L-02: Public email/beta stub endpoints in production could be log‑spam vectors
**Locations:**
- `app/api/email/route.ts` (lines 1–8)
- `app/api/email/beta-request/route.ts` (lines 1–12)

**Impact:** Not dangerous by itself, but can be abused to spam logs and create noise in production monitoring.

**Fix:** Remove or protect with auth in production, or add a minimal rate limit.

---

## Resolved Since Prior Audit (Verified)
- **Stripe checkout endpoints** now require auth and use server‑side allowlisted URLs.
- **Checklist upsert** now derives `userId` from auth token (no IDOR).
- **AI endpoints** (`ask`, `notebook-ai`, `neuro-assistant`, `neuro-reaction`, `ai-coach`) now enforce auth + rate limiting.
- **OpenAI keys** are server‑only (no `NEXT_PUBLIC_*` fallback).

---

## Load Testing Summary (k6)
- **Smoke (20 VUs / 2m):** p95 = 596ms, error rate 0%
- **Ramp (10→50 VUs / 3m30s):** p95 = 812ms, error rate 0%
- **Spike (80 VUs / 1m30s):** p95 = 1.65s, error rate 0%

**Interpretation:** The app is stable under moderate load, with latency spikes at 80 VUs. For production, add caching/edge optimization and test on staging.

---

## Status After Remediation (This Session)
All four recommended remediations were implemented:
1. **Option Flow HTML** now passes through a strict allowlist sanitizer before rendering.
2. **Security headers** (CSP + baseline headers) were added in `next.config.ts`.
3. **Contact endpoint** now has IP rate‑limit + honeypot and optional hCaptcha verification.
4. **Email stub endpoints** return 404 in production.

**Note:** The HTML sanitizer is a local allowlist (no external dependency). If you want a battle‑tested sanitizer, swap it to DOMPurify when package installs are available.
