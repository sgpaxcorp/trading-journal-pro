import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supaBaseAdmin";

type AuthLike = {
  userId?: string | null;
  email?: string | null;
};

function splitEmailList(value?: string | null) {
  return String(value ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email.includes("@"));
}

function ownerEmails() {
  return [
    ...splitEmailList(process.env.SMART_TOOLS_OWNER_EMAILS),
    ...splitEmailList(process.env.ADMIN_EMAILS),
  ];
}

async function isAdminUserId(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("admin_users")
    .select("user_id, active")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) return false;
  return Boolean(data?.user_id) && data?.active !== false;
}

async function getUserEmail(userId: string) {
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (error) return null;
  return data?.user?.email ?? null;
}

export async function isSmartToolsOwner(auth: AuthLike) {
  const userId = String(auth.userId ?? "").trim();
  const email = String(auth.email ?? "").trim().toLowerCase();
  if (!userId && !email) return false;

  const allowList = ownerEmails();
  if (email && allowList.includes(email)) return true;
  if (userId && (await isAdminUserId(userId))) return true;

  if (userId && allowList.length > 0) {
    const fetchedEmail = String((await getUserEmail(userId)) ?? "").trim().toLowerCase();
    return Boolean(fetchedEmail && allowList.includes(fetchedEmail));
  }

  return false;
}

export function smartToolsAccessDeniedResponse() {
  return NextResponse.json(
    {
      error: "Smart Tools is in closed beta.",
      code: "smart_tools_closed_beta",
      beta: true,
    },
    { status: 403 }
  );
}

export async function requireSmartToolsOwner(auth: AuthLike) {
  return (await isSmartToolsOwner(auth)) ? null : smartToolsAccessDeniedResponse();
}
