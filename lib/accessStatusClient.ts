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

export async function fetchAccessStatus(): Promise<AccessStatusResponse | null> {
  const { data: sessionData } = await supabaseBrowser.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) return null;

  const res = await fetch("/api/access/status", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  if (!res.ok) return null;
  const body = (await res.json()) as AccessStatusResponse;
  if (!body?.ok) return null;
  return body;
}
