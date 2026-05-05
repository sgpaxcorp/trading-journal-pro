import { supabaseBrowser } from "@/lib/supaBaseClient";

export type AdminStatus = {
  isAdmin: boolean;
  userId?: string | null;
  email?: string | null;
};

export async function getAdminStatus(): Promise<AdminStatus> {
  const { data: sessionData, error: sessionError } =
    await supabaseBrowser.auth.getSession();

  if (sessionError || !sessionData.session?.access_token) {
    return { isAdmin: false };
  }

  const response = await fetch("/api/admin/me", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${sessionData.session.access_token}`,
    },
    cache: "no-store",
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    return { isAdmin: false };
  }

  return {
    isAdmin: Boolean(payload?.isAdmin),
    userId: payload?.userId ?? null,
    email: payload?.email ?? null,
  };
}
