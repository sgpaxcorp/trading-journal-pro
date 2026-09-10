"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supaBaseClient";
import { useAuth } from "@/context/AuthContext";
import type { FundedAccountProfile, TradingAccountType } from "@/lib/fundedAccounts";

export type TradingAccount = {
  id: string;
  user_id: string;
  name: string;
  broker?: string | null;
  account_type: TradingAccountType;
  funded_profile?: FundedAccountProfile | null;
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
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.warn("[useTradingAccounts] list error:", body?.error || res.status);
        setAccounts([]);
        setActiveAccountId(null);
        setError(body?.error || "Failed to load accounts");
        return;
      }

      const rows: TradingAccount[] = Array.isArray(body?.accounts) ? body.accounts : [];
      setAccounts(rows);
      const savedActive = typeof body?.activeAccountId === "string" ? body.activeAccountId : null;
      const savedAccount = savedActive ? rows.find((row) => row.id === savedActive) : null;
      const preferred = savedAccount ?? rows.find((row) => row.is_default) ?? rows[0] ?? null;

      // Make the usable account available immediately so dependent pages can
      // hydrate while the preference is being repaired on the server.
      setActiveAccountId(preferred?.id ?? null);

      if (rows.length === 0) {
        // create a default account
        await createAccount("Primary", "");
      } else if (preferred?.id && preferred.id !== savedActive) {
        await setActive(preferred.id);
      }
    } catch (err: any) {
      console.warn("[useTradingAccounts] load error:", err);
      setError(err?.message || "Failed to load accounts");
    } finally {
      setLoading(false);
    }
  }, []);

  const createAccount = useCallback(async (
    name: string,
    broker?: string,
    configuration?: {
      accountType?: TradingAccountType;
      fundedProfile?: FundedAccountProfile | null;
    }
  ) => {
    const { data: sessionData } = await supabaseBrowser.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) throw new Error("Unauthorized");

    const res = await fetch("/api/trading-accounts/create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        name,
        broker,
        accountType: configuration?.accountType ?? "personal",
        fundedProfile: configuration?.fundedProfile ?? null,
      }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body?.error || "Failed to create account");

    await fetchAccounts();
    return body.account as TradingAccount;
  }, [fetchAccounts]);

  const updateAccount = useCallback(async (input: {
    accountId: string;
    name: string;
    broker?: string;
    accountType: TradingAccountType;
    fundedProfile?: FundedAccountProfile | null;
  }) => {
    const { data: sessionData } = await supabaseBrowser.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) throw new Error("Unauthorized");

    const res = await fetch("/api/trading-accounts/update", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(input),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body?.error || "Failed to update account");

    await fetchAccounts();
    return body.account as TradingAccount;
  }, [fetchAccounts]);

  const deleteAccount = useCallback(async (accountId: string) => {
    const { data: sessionData } = await supabaseBrowser.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) throw new Error("Unauthorized");

    const res = await fetch("/api/trading-accounts/delete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ accountId }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body?.error || "Failed to delete account");

    await fetchAccounts();
    return true;
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
    updateAccount,
    deleteAccount,
    setActiveAccount: setActive,
  };
}
