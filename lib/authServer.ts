// lib/authServer.ts
import { supabaseAdmin } from "@/lib/supaBaseAdmin";

export function getBearerToken(req: Request): string {
  const authHeader = req.headers.get("authorization") || "";
  if (!authHeader) return "";
  return authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
}

export async function getAuthUser(req: Request): Promise<{ userId: string; email: string | null } | null> {
  const token = getBearerToken(req);
  if (!token) return null;

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user?.id) return null;

  return { userId: data.user.id, email: data.user.email ?? null };
}
