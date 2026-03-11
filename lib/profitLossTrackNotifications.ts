import { sendProfitLossAlertEmail } from "@/lib/email";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";

type AlertSeverity = "warning" | "critical";
type ProfitLossAlertKind = "renewal" | "overspend" | "variable_cost";

type ProfileRow = {
  user_id: string;
  account_id: string | null;
  trader_type: string | null;
  initial_capital: number | null;
  trading_days_per_month: number | null;
  avg_trades_per_month: number | null;
  include_education_in_break_even: boolean | null;
  include_owner_pay_in_break_even: boolean | null;
  owner_pay_target_monthly: number | null;
  renewal_alert_days: number | null;
  overspend_alert_pct: number | null;
  variable_cost_alert_ratio: number | null;
  finance_alerts_inapp_enabled: boolean | null;
  finance_alerts_push_enabled: boolean | null;
  finance_alerts_email_enabled: boolean | null;
};

type CostRow = {
  id: string;
  user_id: string;
  account_id: string | null;
  name: string;
  category: string;
  vendor: string | null;
  billing_cycle: "weekly" | "monthly" | "quarterly" | "semiannual" | "annual" | "one_time";
  amount: number | null;
  starts_at: string | null;
  ends_at: string | null;
  is_active: boolean | null;
  include_in_break_even: boolean | null;
  amortization_months: number | null;
  created_at: string | null;
};

type BudgetRow = {
  category: string;
  monthly_amount: number | null;
};

type SnapshotRow = {
  realized_usd: number | null;
};

type TradeCostRow = {
  commissions: number | null;
  fees: number | null;
};

type PushTokenRow = {
  expo_push_token: string;
};

type ProfitLossAlertCandidate = {
  userId: string;
  accountId: string | null;
  alertKind: ProfitLossAlertKind;
  alertKey: string;
  severity: AlertSeverity;
  title: string;
  message: string;
  detailLines: string[];
  inAppEnabled: boolean;
  pushEnabled: boolean;
  emailEnabled: boolean;
  metadata: Record<string, unknown>;
};

type DispatchProfitLossAlertsParams = {
  userId?: string | null;
};

const SYSTEM_RULES: Record<ProfitLossAlertKind, { key: string; triggerType: string }> = {
  renewal: { key: "profit_loss_renewal_system", triggerType: "profit_loss_renewal" },
  overspend: { key: "profit_loss_overspend_system", triggerType: "profit_loss_overspend" },
  variable_cost: { key: "profit_loss_variable_cost_system", triggerType: "profit_loss_variable_cost" },
};

const CATEGORY_LABELS: Record<string, string> = {
  subscription: "Subscriptions",
  data: "Market data",
  education: "Education",
  funding: "Funding fees",
  software: "Platforms & software",
  mentorship: "Mentorship",
  broker: "Broker & execution",
  admin: "Admin & business",
  other: "Other",
};

function safeNumber(value: unknown, fallback = 0) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function formatMoney(value: number) {
  return `$${Math.abs(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatSignedMoney(value: number) {
  return `${value >= 0 ? "+" : "-"}${formatMoney(value)}`;
}

function parseDate(value?: string | null) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toIso(date: Date) {
  return date.toISOString().slice(0, 10);
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function daysBetween(start: Date, end: Date) {
  const ms = end.getTime() - start.getTime();
  return Math.max(0, Math.floor(ms / 86400000) + 1);
}

function clampRange(start: Date, end: Date, min: Date, max: Date) {
  const safeStart = start > min ? start : min;
  const safeEnd = end < max ? end : max;
  if (safeEnd < safeStart) return null;
  return { start: safeStart, end: safeEnd };
}

function billingDays(cycle: CostRow["billing_cycle"]) {
  switch (cycle) {
    case "weekly":
      return 7;
    case "monthly":
      return 365 / 12;
    case "quarterly":
      return 365 / 4;
    case "semiannual":
      return 365 / 2;
    case "annual":
      return 365;
    default:
      return 0;
  }
}

function defaultAmortizationMonths(cost: CostRow) {
  if (cost.billing_cycle !== "one_time") return null;
  if (safeNumber(cost.amortization_months) > 0) return Math.max(1, Math.round(safeNumber(cost.amortization_months)));
  return cost.category === "education" ? 12 : 1;
}

function monthlyEquivalent(cost: CostRow) {
  const amount = safeNumber(cost.amount);
  if ((cost.is_active ?? true) === false || amount <= 0) return 0;
  switch (cost.billing_cycle) {
    case "weekly":
      return (amount * 52) / 12;
    case "monthly":
      return amount;
    case "quarterly":
      return amount / 3;
    case "semiannual":
      return amount / 6;
    case "annual":
      return amount / 12;
    case "one_time":
      return amount / Math.max(1, defaultAmortizationMonths(cost) ?? 1);
    default:
      return amount;
  }
}

function expenseForRange(cost: CostRow, rangeStart: Date, rangeEnd: Date) {
  const amount = safeNumber(cost.amount);
  if ((cost.is_active ?? true) === false || amount <= 0) return 0;

  const startDate = parseDate(cost.starts_at) ?? parseDate(cost.created_at) ?? new Date(2000, 0, 1);
  if (cost.billing_cycle === "one_time") {
    const months = Math.max(1, defaultAmortizationMonths(cost) ?? 1);
    const amortizationEnd = addMonths(startDate, months);
    amortizationEnd.setDate(amortizationEnd.getDate() - 1);
    const overlap = clampRange(rangeStart, rangeEnd, startDate, amortizationEnd);
    if (!overlap) return 0;
    const totalDays = Math.max(1, daysBetween(startDate, amortizationEnd));
    const overlapDays = daysBetween(overlap.start, overlap.end);
    return amount * (overlapDays / totalDays);
  }

  const costEnd = parseDate(cost.ends_at) ?? new Date(2999, 11, 31);
  const overlap = clampRange(rangeStart, rangeEnd, startDate, costEnd);
  if (!overlap) return 0;
  return amount * (daysBetween(overlap.start, overlap.end) / Math.max(1, billingDays(cost.billing_cycle)));
}

function addBillingStep(date: Date, cycle: CostRow["billing_cycle"]) {
  const next = new Date(date);
  switch (cycle) {
    case "weekly":
      next.setDate(next.getDate() + 7);
      return next;
    case "monthly":
      next.setMonth(next.getMonth() + 1);
      return next;
    case "quarterly":
      next.setMonth(next.getMonth() + 3);
      return next;
    case "semiannual":
      next.setMonth(next.getMonth() + 6);
      return next;
    case "annual":
      next.setFullYear(next.getFullYear() + 1);
      return next;
    default:
      return null;
  }
}

function nextRenewalDate(cost: CostRow, today: Date) {
  if ((cost.is_active ?? true) === false || cost.billing_cycle === "one_time") return null;
  const endDate = parseDate(cost.ends_at);
  const baseDate = parseDate(cost.starts_at) ?? parseDate(cost.created_at);
  if (!baseDate) return null;
  if (endDate && endDate < today) return null;

  let next = new Date(baseDate);
  let guard = 0;
  while (next < today && guard < 500) {
    const stepped = addBillingStep(next, cost.billing_cycle);
    if (!stepped) return null;
    next = stepped;
    guard += 1;
  }
  if (endDate && next > endDate) return null;
  return next;
}

function daysUntil(target: Date, base: Date) {
  const t = new Date(target);
  t.setHours(0, 0, 0, 0);
  const b = new Date(base);
  b.setHours(0, 0, 0, 0);
  return Math.round((t.getTime() - b.getTime()) / 86400000);
}

function costCountsInBreakEven(cost: CostRow, profile: ProfileRow) {
  if ((cost.is_active ?? true) === false) return false;
  if ((cost.include_in_break_even ?? true) === false) return false;
  if (cost.category === "education" && profile.include_education_in_break_even === false) return false;
  return true;
}

function isExpoPushToken(token: string) {
  return token.startsWith("ExponentPushToken") || token.startsWith("ExpoPushToken");
}

async function sendExpoMessages(messages: Array<Record<string, unknown>>) {
  const chunks: Array<Array<Record<string, unknown>>> = [];
  for (let i = 0; i < messages.length; i += 100) {
    chunks.push(messages.slice(i, i + 100));
  }

  const accepted = new Set<number>();
  let baseIndex = 0;

  for (const chunk of chunks) {
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(chunk),
    });
    const body = await res.json().catch(() => ({} as any));
    const items = Array.isArray((body as any)?.data) ? (body as any).data : [];
    for (let index = 0; index < items.length; index += 1) {
      if (items[index]?.status === "ok") accepted.add(baseIndex + index);
    }
    baseIndex += items.length;
    if (!res.ok) {
      console.error("[profitLossTrackNotifications] Expo push failed", res.status, body);
    }
  }

  return accepted;
}

async function ensureRule(userId: string, alertKind: ProfitLossAlertKind, candidate: ProfitLossAlertCandidate) {
  const ruleMeta = SYSTEM_RULES[alertKind];
  const { data: existingRule, error: ruleErr } = await supabaseAdmin
    .from("ntj_alert_rules")
    .select("id")
    .eq("user_id", userId)
    .eq("key", ruleMeta.key)
    .maybeSingle();

  if (ruleErr) throw new Error(ruleErr.message);

  const payload = {
    title: candidate.title,
    message: candidate.message,
    severity: candidate.severity,
    enabled: true,
    channels: ["inapp", "popup"],
    config: {
      source: "system",
      core: true,
      kind: "alarm",
      category: "profit_loss_track",
      alert_kind: alertKind,
      route: "/performance/profit-loss-track",
    },
  };

  const existingRuleId = String((existingRule as any)?.id ?? "");
  if (existingRuleId) {
    const { error: updateErr } = await supabaseAdmin
      .from("ntj_alert_rules")
      .update(payload)
      .eq("id", existingRuleId)
      .eq("user_id", userId);
    if (updateErr) throw new Error(updateErr.message);
    return existingRuleId;
  }

  const { data: createdRule, error: createErr } = await supabaseAdmin
    .from("ntj_alert_rules")
    .insert({
      user_id: userId,
      key: ruleMeta.key,
      trigger_type: ruleMeta.triggerType,
      ...payload,
    })
    .select("id")
    .single();

  if (createErr) throw new Error(createErr.message);
  return String((createdRule as any)?.id ?? "");
}

function applyNullableAccountFilter(query: any, accountId?: string | null) {
  if (accountId) return query.eq("account_id", accountId);
  return query.is("account_id", null);
}

async function userEmailAndName(userId: string, cache: Map<string, { email: string | null; name: string | null }>) {
  const cached = cache.get(userId);
  if (cached) return cached;
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (error || !data?.user) {
    const fallback = { email: null, name: null };
    cache.set(userId, fallback);
    return fallback;
  }
  const name =
    String((data.user.user_metadata as any)?.full_name || (data.user.user_metadata as any)?.name || "").trim() || null;
  const resolved = { email: data.user.email ?? null, name };
  cache.set(userId, resolved);
  return resolved;
}

async function dispatchCandidate(
  candidate: ProfitLossAlertCandidate,
  contactCache: Map<string, { email: string | null; name: string | null }>
) {
  const ruleId = await ensureRule(candidate.userId, candidate.alertKind, candidate);
  let inAppInserted = false;
  let pushSent = 0;
  let emailSent = 0;

  if (candidate.inAppEnabled) {
    const { data: existingInApp, error: inAppErr } = await applyNullableAccountFilter(
      supabaseAdmin
        .from("profit_loss_alert_deliveries")
        .select("id")
        .eq("user_id", candidate.userId)
        .eq("alert_kind", candidate.alertKind)
        .eq("alert_key", candidate.alertKey)
        .eq("channel", "inapp")
        .limit(1),
      candidate.accountId
    ).maybeSingle();

    if (inAppErr) throw new Error(inAppErr.message);

    if (!existingInApp?.id) {
      const nowIso = new Date().toISOString();
      const { data: eventRow, error: eventErr } = await supabaseAdmin
        .from("ntj_alert_events")
        .insert({
          user_id: candidate.userId,
          rule_id: ruleId,
          date: toIso(new Date()),
          status: "active",
          triggered_at: nowIso,
          dismissed_until: null,
          acknowledged_at: null,
          payload: {
            title: candidate.title,
            message: candidate.message,
            severity: candidate.severity,
            channels: ["inapp", "popup"],
            kind: "alarm",
            category: "profit_loss_track",
            alert_kind: candidate.alertKind,
            alert_key: candidate.alertKey,
            route: "/performance/profit-loss-track",
            account_id: candidate.accountId ?? null,
            ...candidate.metadata,
          },
        })
        .select("id")
        .single();

      if (eventErr) throw new Error(eventErr.message);

      const { error: deliveryErr } = await supabaseAdmin.from("profit_loss_alert_deliveries").insert({
        user_id: candidate.userId,
        account_id: candidate.accountId ?? null,
        alert_kind: candidate.alertKind,
        alert_key: candidate.alertKey,
        channel: "inapp",
        rule_id: ruleId,
        event_id: (eventRow as any)?.id ?? null,
        payload: {
          title: candidate.title,
          message: candidate.message,
          severity: candidate.severity,
        },
      });

      if (deliveryErr && deliveryErr.code !== "23505") throw new Error(deliveryErr.message);
      inAppInserted = true;
    }
  }

  if (candidate.pushEnabled) {
    const { data: sentPushRows, error: sentPushErr } = await applyNullableAccountFilter(
      supabaseAdmin
        .from("profit_loss_alert_deliveries")
        .select("delivery_target")
        .eq("user_id", candidate.userId)
        .eq("alert_kind", candidate.alertKind)
        .eq("alert_key", candidate.alertKey)
        .eq("channel", "push"),
      candidate.accountId
    );

    if (sentPushErr) throw new Error(sentPushErr.message);
    const deliveredTargets = new Set(
      (sentPushRows ?? []).map((row: any) => String(row?.delivery_target ?? "").trim()).filter(Boolean)
    );

    const { data: tokenRows, error: tokenErr } = await supabaseAdmin
      .from("push_tokens")
      .select("expo_push_token")
      .eq("user_id", candidate.userId)
      .eq("daily_reminder_enabled", true);

    if (tokenErr) throw new Error(tokenErr.message);

    const targets = ((tokenRows ?? []) as PushTokenRow[]).filter((row) => {
      const token = String(row.expo_push_token ?? "").trim();
      return isExpoPushToken(token) && !deliveredTargets.has(token);
    });

    if (targets.length) {
      const accepted = await sendExpoMessages(
        targets.map((row) => ({
          to: row.expo_push_token,
          title: candidate.title,
          body: candidate.message,
          sound: "default",
          data: {
            screen: "Messages",
            route: "/performance/profit-loss-track",
            type: "profit_loss_alert",
            alertKind: candidate.alertKind,
            alertKey: candidate.alertKey,
          },
        }))
      );

      const deliveries = targets
        .map((row, index) => ({ row, index }))
        .filter(({ index }) => accepted.has(index))
        .map(({ row }) => ({
          user_id: candidate.userId,
          account_id: candidate.accountId ?? null,
          alert_kind: candidate.alertKind,
          alert_key: candidate.alertKey,
          channel: "push" as const,
          delivery_target: row.expo_push_token,
          rule_id: ruleId,
          payload: {
            title: candidate.title,
            message: candidate.message,
            severity: candidate.severity,
          },
        }));

      if (deliveries.length) {
        const { error: deliveryErr } = await supabaseAdmin.from("profit_loss_alert_deliveries").insert(deliveries);
        if (deliveryErr && deliveryErr.code !== "23505") throw new Error(deliveryErr.message);
      }
      pushSent = deliveries.length;
    }
  }

  if (candidate.emailEnabled) {
    const contact = await userEmailAndName(candidate.userId, contactCache);
    if (contact.email) {
      const { data: existingEmail, error: emailCheckErr } = await applyNullableAccountFilter(
        supabaseAdmin
          .from("profit_loss_alert_deliveries")
          .select("id")
          .eq("user_id", candidate.userId)
          .eq("alert_kind", candidate.alertKind)
          .eq("alert_key", candidate.alertKey)
          .eq("channel", "email")
          .eq("delivery_target", contact.email)
          .limit(1),
        candidate.accountId
      ).maybeSingle();

      if (emailCheckErr) throw new Error(emailCheckErr.message);

      if (!existingEmail?.id) {
        await sendProfitLossAlertEmail({
          email: contact.email,
          name: contact.name,
          title: candidate.title,
          message: candidate.message,
          alertKind: candidate.alertKind,
          detailLines: candidate.detailLines,
          ctaUrl: "https://neurotrader-journal.com/performance/profit-loss-track",
        });

        const { error: deliveryErr } = await supabaseAdmin.from("profit_loss_alert_deliveries").insert({
          user_id: candidate.userId,
          account_id: candidate.accountId ?? null,
          alert_kind: candidate.alertKind,
          alert_key: candidate.alertKey,
          channel: "email",
          delivery_target: contact.email,
          rule_id: ruleId,
          payload: {
            title: candidate.title,
            message: candidate.message,
            severity: candidate.severity,
          },
        });

        if (deliveryErr && deliveryErr.code !== "23505") throw new Error(deliveryErr.message);
        emailSent = 1;
      }
    }
  }

  return { inAppInserted, pushSent, emailSent };
}

async function collectCandidatesForProfile(profile: ProfileRow, today: Date) {
  const monthStart = startOfMonth(today);
  const monthEnd = endOfMonth(today);
  const monthStartIso = toIso(monthStart);
  const monthEndIso = toIso(monthEnd);
  const nextMonthStartIso = toIso(new Date(today.getFullYear(), today.getMonth() + 1, 1));

  let costsQuery = supabaseAdmin
    .from("profit_loss_costs")
    .select(
      "id,user_id,account_id,name,category,vendor,billing_cycle,amount,starts_at,ends_at,is_active,include_in_break_even,amortization_months,created_at"
    )
    .eq("user_id", profile.user_id);
  costsQuery = applyNullableAccountFilter(costsQuery, profile.account_id);
  const { data: costsData, error: costsErr } = await costsQuery;
  if (costsErr) throw new Error(costsErr.message);

  let budgetsQuery = supabaseAdmin
    .from("profit_loss_budgets")
    .select("category,monthly_amount")
    .eq("user_id", profile.user_id);
  budgetsQuery = applyNullableAccountFilter(budgetsQuery, profile.account_id);
  const { data: budgetsData, error: budgetsErr } = await budgetsQuery;
  if (budgetsErr) throw new Error(budgetsErr.message);

  let snapshotsQuery = supabaseAdmin
    .from("daily_snapshots")
    .select("realized_usd")
    .eq("user_id", profile.user_id)
    .gte("date", monthStartIso)
    .lte("date", toIso(today));
  if (profile.account_id) snapshotsQuery = snapshotsQuery.eq("account_id", profile.account_id);
  const { data: snapshotsData, error: snapshotsErr } = await snapshotsQuery;
  if (snapshotsErr) throw new Error(snapshotsErr.message);

  let tradesQuery = supabaseAdmin
    .from("trades")
    .select("commissions,fees")
    .eq("user_id", profile.user_id)
    .gte("executed_at", `${monthStartIso}T00:00:00.000Z`)
    .lt("executed_at", `${nextMonthStartIso}T00:00:00.000Z`);
  if (profile.account_id) tradesQuery = tradesQuery.eq("account_id", profile.account_id);
  const { data: tradesData, error: tradesErr } = await tradesQuery;
  if (tradesErr) throw new Error(tradesErr.message);

  const costs = (costsData ?? []) as CostRow[];
  const budgets = (budgetsData ?? []) as BudgetRow[];
  const snapshots = (snapshotsData ?? []) as SnapshotRow[];
  const trades = (tradesData ?? []) as TradeCostRow[];

  const totalTrading = snapshots.reduce((sum, row) => sum + safeNumber(row.realized_usd), 0);
  const tradeCostsTotal = trades.reduce(
    (sum, row) => sum + Math.abs(safeNumber(row.commissions)) + Math.abs(safeNumber(row.fees)),
    0
  );
  const activeCosts = costs.filter((cost) => (cost.is_active ?? true) !== false);
  const periodExpenses = activeCosts.reduce((sum, cost) => sum + expenseForRange(cost, monthStart, today), 0);
  const monthlyBreakEvenBase = activeCosts
    .filter((cost) => costCountsInBreakEven(cost, profile))
    .reduce((sum, cost) => sum + monthlyEquivalent(cost), 0);
  const monthlyOwnerPay = profile.include_owner_pay_in_break_even ? safeNumber(profile.owner_pay_target_monthly) : 0;
  const monthlyBreakEven = monthlyBreakEvenBase + monthlyOwnerPay;
  const netAfterExpenses = totalTrading - periodExpenses;
  const belowBreakEven = netAfterExpenses < monthlyBreakEven;
  void belowBreakEven;

  const budgetMap = new Map<string, number>();
  budgets.forEach((row) => budgetMap.set(String(row.category || ""), safeNumber(row.monthly_amount)));

  const actualByCategory = new Map<string, number>();
  activeCosts.forEach((cost) => {
    const key = String(cost.category || "other");
    actualByCategory.set(key, (actualByCategory.get(key) || 0) + expenseForRange(cost, monthStart, today));
  });

  const candidates: ProfitLossAlertCandidate[] = [];
  const renewalAlertDays = Math.max(1, Math.round(safeNumber(profile.renewal_alert_days, 7)));
  const overspendAlertPct = Math.max(0, safeNumber(profile.overspend_alert_pct, 0.1));
  const variableCostAlertRatio = Math.max(0, safeNumber(profile.variable_cost_alert_ratio, 0.25));

  for (const cost of activeCosts) {
    const renewal = nextRenewalDate(cost, today);
    if (!renewal) continue;
    const days = daysUntil(renewal, today);
    if (days > 30) continue;
    const vendor = cost.vendor?.trim() || cost.name;
    const renewalIso = toIso(renewal);
    const severity: AlertSeverity = days <= renewalAlertDays ? "critical" : "warning";
    candidates.push({
      userId: profile.user_id,
      accountId: profile.account_id ?? null,
      alertKind: "renewal",
      alertKey: `renewal:${cost.id}:${renewalIso}:${severity}`,
      severity,
      title:
        severity === "critical"
          ? `Renewal due soon: ${vendor}`
          : `Upcoming renewal: ${vendor}`,
      message:
        severity === "critical"
          ? `${vendor} renews on ${renewalIso} for ${formatMoney(safeNumber(cost.amount))}. Review it before the charge hits.`
          : `${vendor} renews on ${renewalIso} for ${formatMoney(safeNumber(cost.amount))}. Keep it visible in your stack planning.`,
      detailLines: [
        `Cycle: ${cost.billing_cycle}`,
        `Amount: ${formatMoney(safeNumber(cost.amount))}`,
        `Days until renewal: ${days}`,
      ],
      inAppEnabled: profile.finance_alerts_inapp_enabled !== false,
      pushEnabled: profile.finance_alerts_push_enabled !== false,
      emailEnabled: profile.finance_alerts_email_enabled !== false,
      metadata: {
        vendor,
        cost_id: cost.id,
        renewal_date: renewalIso,
        days_until: days,
      },
    });
  }

  Array.from(actualByCategory.entries())
    .filter(([category]) => budgetMap.get(category)! > 0)
    .forEach(([category, actual]) => {
      const budget = budgetMap.get(category) || 0;
      if (budget <= 0 || actual <= budget * (1 + overspendAlertPct)) return;
      const overage = actual - budget;
      const categoryLabel = CATEGORY_LABELS[category] || category;
      candidates.push({
        userId: profile.user_id,
        accountId: profile.account_id ?? null,
        alertKind: "overspend",
        alertKey: `overspend:${monthStartIso}:${category}`,
        severity: "warning",
        title: `Over budget: ${categoryLabel}`,
        message: `${categoryLabel} is ${formatMoney(overage)} above budget this month.`,
        detailLines: [
          `Budget: ${formatMoney(budget)}`,
          `Actual: ${formatMoney(actual)}`,
          `Variance: -${formatMoney(overage)}`,
        ],
        inAppEnabled: profile.finance_alerts_inapp_enabled !== false,
        pushEnabled: profile.finance_alerts_push_enabled !== false,
        emailEnabled: profile.finance_alerts_email_enabled !== false,
        metadata: {
          category,
          period_start: monthStartIso,
          period_end: monthEndIso,
          budget,
          actual,
          overage,
        },
      });
    });

  if (tradeCostsTotal > 0 && tradeCostsTotal > monthlyBreakEvenBase * variableCostAlertRatio) {
    candidates.push({
      userId: profile.user_id,
      accountId: profile.account_id ?? null,
      alertKind: "variable_cost",
      alertKey: `variable_cost:${monthStartIso}`,
      severity: "warning",
      title: "Trading costs are elevated",
      message: `Observed broker commissions and fees are ${formatMoney(tradeCostsTotal)} this month.`,
      detailLines: [
        `Variable-cost threshold: ${formatMoney(monthlyBreakEvenBase * variableCostAlertRatio)}`,
        `Monthly operating break-even base: ${formatMoney(monthlyBreakEvenBase)}`,
        `Trading P&L (net): ${formatSignedMoney(totalTrading)}`,
      ],
      inAppEnabled: profile.finance_alerts_inapp_enabled !== false,
      pushEnabled: profile.finance_alerts_push_enabled !== false,
      emailEnabled: profile.finance_alerts_email_enabled !== false,
      metadata: {
        period_start: monthStartIso,
        period_end: monthEndIso,
        trade_costs_total: tradeCostsTotal,
        monthly_break_even_base: monthlyBreakEvenBase,
        monthly_break_even: monthlyBreakEven,
        variable_cost_threshold: monthlyBreakEvenBase * variableCostAlertRatio,
      },
    });
  }

  return candidates;
}

export async function dispatchProfitLossAlerts(params: DispatchProfitLossAlertsParams = {}) {
  let query = supabaseAdmin
    .from("profit_loss_profiles")
    .select(
      [
        "user_id",
        "account_id",
        "trader_type",
        "initial_capital",
        "trading_days_per_month",
        "avg_trades_per_month",
        "include_education_in_break_even",
        "include_owner_pay_in_break_even",
        "owner_pay_target_monthly",
        "renewal_alert_days",
        "overspend_alert_pct",
        "variable_cost_alert_ratio",
        "finance_alerts_inapp_enabled",
        "finance_alerts_push_enabled",
        "finance_alerts_email_enabled",
      ].join(",")
    )
    .limit(1000);

  if (params.userId) query = query.eq("user_id", params.userId);

  const { data: profiles, error } = await query;
  if (error) throw new Error(error.message);

  const rows = ((profiles ?? []) as unknown[]) as ProfileRow[];
  const today = new Date();
  const contactCache = new Map<string, { email: string | null; name: string | null }>();

  let inAppInserted = 0;
  let pushSent = 0;
  let emailSent = 0;
  let alertsEvaluated = 0;
  const details: Array<Record<string, unknown>> = [];

  for (const profile of rows) {
    const candidates = await collectCandidatesForProfile(profile, today);
    for (const candidate of candidates) {
      alertsEvaluated += 1;
      const result = await dispatchCandidate(candidate, contactCache);
      inAppInserted += result.inAppInserted ? 1 : 0;
      pushSent += result.pushSent;
      emailSent += result.emailSent;
      details.push({
        userId: candidate.userId,
        accountId: candidate.accountId,
        alertKind: candidate.alertKind,
        alertKey: candidate.alertKey,
        inAppInserted: result.inAppInserted,
        pushSent: result.pushSent,
        emailSent: result.emailSent,
      });
    }
  }

  return {
    profilesProcessed: rows.length,
    alertsEvaluated,
    inAppInserted,
    pushSent,
    emailSent,
    details,
  };
}
