"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supaBaseClient";
import { useAuth } from "@/context/AuthContext";

export type TradingAccount = {
  id: string;
  user_id: string;
  name: string;
  broker?: string | null;
  is_default?: boolean | null;
  created_at?: string | null;
};

export function useTradingAccounts() {
  const { user } = useAuth() as any;
  const [accounts, setAccounts] = useState<TradingAccount[]>([]);
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAccounts = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const { data: sessionData } = await supabaseBrowser.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) {
        setAccounts([]);
        setActiveAccountId(null);
        return;
      }

      const res = await fetch("/api/trading-accounts/list", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || "Failed to load accounts");

      const rows: TradingAccount[] = Array.isArray(body?.accounts) ? body.accounts : [];
      setAccounts(rows);
      const nextActive = body?.activeAccountId ?? null;
      setActiveAccountId(nextActive);

      if (rows.length === 0) {
        // create a default account
        await createAccount("Primary", "");
      } else if (!nextActive) {
        const preferred = rows.find((r: TradingAccount) => r.is_default) ?? rows[0];
        if (preferred?.id) {
          await setActive(preferred.id);
        }
      }
    } catch (err: any) {
      console.error("[useTradingAccounts] load error:", err);
      setError(err?.message || "Failed to load accounts");
    } finally {
      setLoading(false);
    }
  }, []);

  const createAccount = useCallback(async (name: string, broker?: string) => {
    const { data: sessionData } = await supabaseBrowser.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) throw new Error("Unauthorized");

    const res = await fetch("/api/trading-accounts/create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name, broker }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body?.error || "Failed to create account");

    await fetchAccounts();
    return body.account as TradingAccount;
  }, [fetchAccounts]);

  const setActive = useCallback(async (accountId: string) => {
    const { data: sessionData } = await supabaseBrowser.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) throw new Error("Unauthorized");

    const res = await fetch("/api/trading-accounts/set-active", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ accountId }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body?.error || "Failed to set active account");

    setActiveAccountId(body?.activeAccountId ?? accountId);
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    fetchAccounts();
  }, [user?.id, fetchAccounts]);

  return {
    accounts,
    activeAccountId,
    loading,
    error,
    refresh: fetchAccounts,
    createAccount,
    setActiveAccount: setActive,
  };
}
