import { NextResponse } from "next/server";

import { getAuthUser } from "@/lib/authServer";
import {
  formatSnaptradeError,
  snaptradeGetBalances,
  snaptradeGetHoldings,
  snaptradeListAccounts,
} from "@/lib/snaptradeClient";
import { getNeuroAnalysisSnaptradeUser } from "@/lib/snaptradeStorage";
import { requireSmartToolsOwner } from "@/lib/smartToolsAccess";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const smartToolsGate = await requireSmartToolsOwner(authUser);
    if (smartToolsGate) return smartToolsGate;

    const row = await getNeuroAnalysisSnaptradeUser(authUser.userId);
    if (!row) {
      return NextResponse.json({
        connected: false,
        accounts: [],
        holdings: [],
        balances: null,
      });
    }

    const url = new URL(req.url);
    const requestedAccountId = String(url.searchParams.get("accountId") ?? "").trim();
    const accounts = await snaptradeListAccounts(row.snaptrade_user_id, row.snaptrade_user_secret);
    const accountId =
      requestedAccountId ||
      String(accounts?.[0]?.id ?? accounts?.[0]?.accountId ?? accounts?.[0]?.account_id ?? "");

    if (!accountId) {
      return NextResponse.json({
        connected: true,
        accounts: accounts ?? [],
        holdings: [],
        balances: null,
      });
    }

    const [holdingsResult, balancesResult] = await Promise.allSettled([
      snaptradeGetHoldings(row.snaptrade_user_id, row.snaptrade_user_secret, accountId),
      snaptradeGetBalances(row.snaptrade_user_id, row.snaptrade_user_secret, accountId),
    ]);

    const holdingsRaw = holdingsResult.status === "fulfilled" ? holdingsResult.value : null;
    const balancesRaw = balancesResult.status === "fulfilled" ? balancesResult.value : null;

    return NextResponse.json({
      connected: true,
      accounts: accounts ?? [],
      accountId,
      holdings: Array.isArray(holdingsRaw?.holdings) ? holdingsRaw.holdings : holdingsRaw ?? [],
      balances: balancesRaw?.balances ?? balancesRaw ?? null,
      errors: {
        holdings: holdingsResult.status === "rejected" ? formatSnaptradeError(holdingsResult.reason) : null,
        balances: balancesResult.status === "rejected" ? formatSnaptradeError(balancesResult.reason) : null,
      },
    });
  } catch (error: any) {
    return NextResponse.json(formatSnaptradeError(error), { status: 500 });
  }
}
