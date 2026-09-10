import { NextRequest, NextResponse } from "next/server";

import { getAuthUser } from "@/lib/authServer";
import { searchNotebookKnowledge } from "@/lib/notebookRetrievalServer";
import { requireAdvancedPlan } from "@/lib/serverFeatureAccess";

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const gate = await requireAdvancedPlan(auth.userId);
    if (gate) return gate;

    const query = req.nextUrl.searchParams.get("q")?.trim() ?? "";
    const scope = req.nextUrl.searchParams.get("scope") ?? "account";
    const accountId = req.nextUrl.searchParams.get("accountId");
    const result = await searchNotebookKnowledge({
      userId: auth.userId,
      scope,
      accountId,
      query,
      limit: 24,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("[notebook/search]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Search failed." },
      { status: 500 }
    );
  }
}
