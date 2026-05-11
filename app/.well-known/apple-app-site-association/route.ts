import { NextResponse } from "next/server";
import { buildAppleAppSiteAssociation } from "@/lib/appLinks";

export const runtime = "nodejs";

export function GET() {
  return new NextResponse(JSON.stringify(buildAppleAppSiteAssociation()), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=300, must-revalidate",
    },
  });
}
