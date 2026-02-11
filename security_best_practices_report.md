# Security Best Practices Report — trading-journal-pro

Date: 2026-02-10
Scope: Static review of the Next.js (TypeScript) codebase. No dynamic testing or infrastructure inspection performed.

## Executive Summary
This codebase is a Next.js + React application with multiple API routes (Stripe, AI coaching, option flow, journal, etc.).
Key high-risk findings include **unauthenticated state‑changing endpoints** (some using service‑role Supabase), and **public AI endpoints** that can be abused to burn OpenAI credits. There is also an XSS risk in Option Flow chat rendering, and missing baseline security headers.

**Findings summary**
- High: 3
- Medium: 3
- Low: 2

---

## High Severity Findings

### H-01: Unauthenticated checklist write endpoint (service‑role) allows tampering with any user’s data
**Location:** `app/api/checklist/upsert/route.ts` (lines 9–43)

**Evidence:**
```ts
// app/api/checklist/upsert/route.ts
const body = await req.json();
const userId = String(body.userId || "");
...
await supabaseAdmin.from("daily_checklists").upsert({ user_id: userId, ... })
```

**Impact:** An attacker can overwrite any user’s checklist by submitting any `userId`, because the endpoint does **not** authenticate the caller and uses the **service‑role** client (bypasses RLS). This is a direct integrity compromise.

**Fix:** Require authorization and derive `userId` from the verified token (Supabase `auth.getUser`). Reject any request where userId is not from auth. Consider using an RLS‑enforced client instead of the admin client.

**Mitigation (if fix is delayed):** Add a temporary shared secret or rate‑limit + allowlist while you implement full auth.

---

### H-02: Stripe checkout endpoints accept arbitrary userId/email and trust unverified Origin
**Locations:**
- `app/api/stripe/create-checkout-session/route.ts` (lines 24–40, 66–68)
- `app/api/stripe/create-addon-session/route.ts` (lines 10–23, 32–35)

**Evidence:**
```ts
const body = await req.json();
const userId = body.userId as string | undefined;
const email = body.email as string | undefined;
...
const origin = req.headers.get("origin") ?? process.env.NEXT_PUBLIC_APP_URL;
```

**Impact:** Anyone can create checkout sessions for any email/userId, polluting Stripe customers/subscriptions and potentially enabling phishing via forged `Origin`. The endpoint is unauthenticated and trusts a mutable header for redirect URLs.

**Fix:** Require auth, derive `userId/email` from token. Use a strict allowlist for return URLs (server-side env only). Add rate limiting and abuse protection.

---

### H-03: Unauthenticated OpenAI endpoints allow token abuse and cost escalation
**Locations:**
- `app/api/notebook-ai/route.ts` (lines 9–40)
- `app/api/neuro-assistant/route.ts` (lines 81–182)
- `app/api/neuro-assistant/neuro-reaction/route.ts` (lines 7–170+)
- `app/api/ask/ask/route.ts` (lines 8–44)

**Evidence:**
```ts
// Example: app/api/notebook-ai/route.ts
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
export async function POST(req: Request) { ... }
```

**Impact:** These endpoints can be called by anyone (no auth). Attackers can drain API credits, create denial‑of‑wallet, or automate abusive content generation.

**Fix:** Require auth for in‑app endpoints. For public marketing assistants (if needed), add strict rate limits, CAPTCHA, and abuse detection. Consider per‑user quotas.

---

## Medium Severity Findings

### M-01: Potential XSS in Option Flow chat rendering
**Location:** `app/(private)/option-flow/page.tsx` (lines 2546–2549)

**Evidence:**
```tsx
{msg.html && (
  <div ...>
    <div dangerouslySetInnerHTML={{ __html: msg.html }} />
  </div>
)}
```

**Impact:** If `msg.html` ever contains untrusted HTML (user content or AI output with injected script), it can execute in the browser. This is a classic XSS sink.

**Fix:** Sanitize HTML (DOMPurify with an allowlist) or render structured data into React components instead of raw HTML.

---

### M-02: Server route falls back to `NEXT_PUBLIC_OPENAI_API_KEY`
**Location:** `app/api/ai-coach/route.ts` (lines 600–606)

**Evidence:**
```ts
const apiKey = process.env.OPENAI_API_KEY
  || process.env.AI_COACH_OPENAI_API_KEY
  || process.env.NEXT_PUBLIC_OPENAI_API_KEY;
```

**Impact:** `NEXT_PUBLIC_*` variables are browser‑exposed. If misconfigured, this could leak secrets into the client bundle and weaken key management.

**Fix:** Remove the `NEXT_PUBLIC_*` fallback. Require a server‑only key.

---

### M-03: Missing baseline security headers (CSP, clickjacking protection, nosniff)
**Evidence:** No `headers()` config found in `next.config.*`.

**Impact:** Reduced defense‑in‑depth against XSS, clickjacking, and MIME‑type confusion attacks.

**Fix:** Add a security header baseline in `next.config.js` (CSP, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, and `frame-ancestors` / `X-Frame-Options`). Verify with runtime headers.

---

## Low Severity Findings

### L-01: Contact/email endpoints are unauthenticated and lack rate limiting
**Location:** `app/api/contact/route.ts` (lines 7–43)

**Impact:** Abuse/spam risk (email flooding), potential support mailbox abuse.

**Fix:** Add rate limiting (IP/user) and CAPTCHA or honeypot fields.

---

### L-02: Contact endpoint interpolates user content into HTML email
**Location:** `app/api/contact/route.ts` (lines 20–28)

**Impact:** Low risk since it goes to internal support, but can render HTML inside emails and create phishing vectors for support.

**Fix:** Sanitize or send text‑only email. Optionally escape HTML.

---

## Recommendations (Next Steps)
1. **Fix auth gaps first** (H‑01, H‑02, H‑03). These are the highest impact.
2. **Add rate limiting** on all public endpoints (contact, AI, checkout).
3. **Harden rendering** of AI output (sanitize HTML, avoid raw HTML when possible).
4. **Add security headers** in `next.config.js` or at the edge (Vercel).
5. **Secrets hygiene**: enforce server‑only OpenAI key usage; ensure `NEXT_PUBLIC_*` has no secrets.

## Out of Scope / Assumptions
- No dynamic tests or penetration tests were performed.
- Infrastructure/WAF/CDN headers not inspected.
- Dependency vulnerability scanning (SCA) not executed.

If you want, I can start fixing these issues one by one (starting with the High severity items).
