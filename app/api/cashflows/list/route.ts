import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";

export const runtime = "nodejs";

type CashflowRow = {
  id: string;
  user_id: string;
  date: string;
  type: "deposit" | "withdrawal";
  amount: number;
  note: string | null;
  created_at: string;
};

function toNum(x: unknown, fb = 0): number {
  const n = Number(x);
  return Number.isFinite(n) ? n : fb;
}

function normalizeCashflowType(raw: unknown, amountRaw: number): "deposit" | "withdrawal" {
  const t = String(raw ?? "").toLowerCase().trim();
  if (t.includes("with") || t.includes("wd")) return "withdrawal";
  if (t.includes("dep") || t.includes("add") || t.includes("fund")) return "deposit";
  if (amountRaw < 0) return "withdrawal";
  return "deposit";
}

function resolveCashflowDate(raw: any): string {
  const v = raw?.date ?? raw?.cashflow_date ?? raw?.created_at ?? raw?.createdAt ?? "";
  if (!v) return "";
  const s = String(v);
  if (s.length >= 10) return s.slice(0, 10);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function mapCashflowRow(row: any): CashflowRow {
  const amountRaw = toNum(row?.amount ?? row?.amount_usd ?? row?.amountUsd ?? row?.usd_amount ?? row?.value ?? 0, 0);
  const type = normalizeCashflowType(row?.type ?? row?.cashflow_type ?? row?.kind ?? row?.txn_type ?? "", amountRaw);
  const amount = Math.abs(amountRaw);
  return {
    id: String(row?.id ?? ""),
    user_id: String(row?.user_id ?? row?.userId ?? ""),
    date: resolveCashflowDate(row),
    type,
    amount,
    note: row?.note ?? row?.memo ?? null,
    created_at: String(row?.created_at ?? row?.createdAt ?? ""),
  };
}

function isMissingRelation(err: any): boolean {
  const msg = String(err?.message ?? "").toLowerCase();
  return err?.code === "42P01" || msg.includes("does not exist") || msg.includes("undefined table");
}

function isMissingColumn(err: any): boolean {
  const msg = String(err?.message ?? "").toLowerCase();
  return err?.code === "42703" || (msg.includes("column") && msg.includes("does not exist"));
}

async function queryCashflowsTable(
  table: string,
  userId: string
): Promise<{ data: any[]; error: any | null }> {
  let q = supabaseAdmin.from(table).select("*").eq("user_id", userId);
  let { data, error } = await q.order("date", { ascending: false }).order("created_at", { ascending: false });

  if (error && isMissingColumn(error)) {
    const retry = await supabaseAdmin.from(table).select("*").eq("user_id", userId).order("created_at", { ascending: false });
    data = retry.data as any[] | null;
    error = retry.error;
  }

  return { data: (data ?? []) as any[], error };
}

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return NextResponse.json({ cashflows: [] }, { status: 401 });

    const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !authData?.user) {
      return NextResponse.json({ cashflows: [] }, { status: 401 });
    }

    const userId = authData.user.id;
    const { searchParams } = new URL(req.url);
    const fromDate = searchParams.get("fromDate") || "";
    const toDate = searchParams.get("toDate") || "";

    let rows: any[] = [];

    let primary = await queryCashflowsTable("cashflows", userId);
    if (primary.error && isMissingRelation(primary.error)) {
      const legacy = await queryCashflowsTable("ntj_cashflows", userId);
      if (legacy.error) throw legacy.error;
      rows = legacy.data;
    } else if (primary.error) {
      throw primary.error;
    } else {
      rows = primary.data;
      if (!rows.length) {
        const legacy = await queryCashflowsTable("ntj_cashflows", userId);
        if (!legacy.error && legacy.data?.length) rows = legacy.data;
      }
    }

    const normalized = rows.map(mapCashflowRow).filter((r) => {
      if (!r.date) return true;
      if (fromDate && r.date < fromDate) return false;
      if (toDate && r.date > toDate) return false;
      return true;
    });

    return NextResponse.json({ cashflows: normalized });
  } catch (err: any) {
    console.error("[cashflows/list] error:", err);
    return NextResponse.json({ error: err?.message ?? "Unknown error", cashflows: [] }, { status: 500 });
  }
}
