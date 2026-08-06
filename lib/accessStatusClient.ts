import { supabaseBrowser } from "@/lib/supaBaseClient";

export type AccessStatusResponse = {
  ok: boolean;
  userId: string;
  profile: {
    email: string;
    subscriptionStatus: string;
    onboardingCompleted: boolean;
    plan: string;
    isProfileActive: boolean;
  };
  entitlements: Array<{
    entitlement_key: string;
    status: string;
    metadata?: Record<string, unknown> | null;
  }>;
  hasPlatformAccess: boolean;
  hasScopedAccess?: boolean;
  hasAppAccess: boolean;
  diagnostics?: {
    profileFoundById: boolean;
    profileFoundByEmail: boolean;
    matchedProfileId?: string | null;
  };
};

let inFlightAccessStatus: Promise<AccessStatusResponse | null> | null = null;

type FetchAccessStatusOptions = {
  timeoutMs?: number;
  signal?: AbortSignal;
};

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs?: number
): Promise<T | null> {
  if (!timeoutMs || timeoutMs <= 0) return promise;

  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<null>((resolve) => {
    timeoutId = setTimeout(() => resolve(null), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function resolveAccessStatus({
  timeoutMs,
  signal,
}: FetchAccessStatusOptions = {}): Promise<AccessStatusResponse | null> {
  const sessionResult = await withTimeout(
    supabaseBrowser.auth.getSession(),
    timeoutMs
  );
  const sessionData = sessionResult?.data;
  const token = sessionData?.session?.access_token;
  if (!token) return null;

  const res = await withTimeout(
    fetch("/api/access/status", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
      signal,
    }),
    timeoutMs
  );

  if (!res?.ok) return null;
  const body = (await res.json()) as AccessStatusResponse;
  if (!body?.ok) return null;
  return body;
}

export async function fetchAccessStatus(
  options: FetchAccessStatusOptions = {}
): Promise<AccessStatusResponse | null> {
  const shouldShareInFlight = !options.timeoutMs && !options.signal;

  if (!shouldShareInFlight) {
    try {
      return await resolveAccessStatus(options);
    } catch (err: any) {
      if (err?.name === "AbortError") return null;
      throw err;
    }
  }

  if (inFlightAccessStatus) return inFlightAccessStatus;

  inFlightAccessStatus = resolveAccessStatus();

  try {
    return await inFlightAccessStatus;
  } finally {
    inFlightAccessStatus = null;
  }
}
