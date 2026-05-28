import { NextResponse } from "next/server";

import { getAuthUser } from "@/lib/authServer";
import { isSmartToolsOwner } from "@/lib/smartToolsAccess";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = await getAuthUser(req);
  if (!auth) {
    return NextResponse.json({ allowed: false, beta: true });
  }

  return NextResponse.json({
    allowed: await isSmartToolsOwner(auth),
    beta: true,
  });
}
