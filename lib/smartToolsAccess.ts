import { NextResponse } from "next/server";

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
  const explicitOwners = splitEmailList(process.env.SMART_TOOLS_OWNER_EMAILS);
  const adminEmails = splitEmailList(process.env.ADMIN_EMAILS);
  return [...new Set([...explicitOwners, ...adminEmails])];
}

async function getUserEmail(userId: string) {
  const { supabaseAdmin } = await import("@/lib/supaBaseAdmin");
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

  if (userId) {
    const { isAdminAccount } = await import("@/lib/adminAuth");
    if (await isAdminAccount(userId, email || null)) return true;

    if (!allowList.length) return false;
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
