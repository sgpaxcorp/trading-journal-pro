// lib/journalSyncSupabase.ts
import { supabaseBrowser } from "@/lib/supaBaseClient";

export async function syncJournalDate(date: string) {
  const { data: sessionData } = await supabaseBrowser.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) throw new Error("Not authenticated");

  const res = await fetch("/api/journal/sync", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ date }), // ✅ ahora sí
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json?.error ?? "Sync failed");
  return json; // { date, pnl, entries, exits, ... }
}


export async function syncJournalDates(dates: string[]) {
  const { data: sessionData } = await supabaseBrowser.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) throw new Error("Not authenticated");

  const res = await fetch("/api/journal/sync", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ dates }),
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json?.error ?? "Sync failed");
  return json as { ok: true; synced: number; dates: string[] };
}
