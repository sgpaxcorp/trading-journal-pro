import { supabaseAdmin } from "@/lib/supaBaseAdmin";

export type GoalScope = "day" | "week" | "month" | "quarter";

type PushTokenRow = {
  expo_push_token: string;
  locale: string | null;
  user_id: string;
};

type NotifyGoalAchievementParams = {
  userId: string;
  goalScope: GoalScope;
  periodKey: string;
  accountId?: string | null;
  locale?: string | null;
  goalAmount?: number | null;
  actualAmount?: number | null;
  targetBalance?: number | null;
  progress?: number | null;
  title?: string | null;
  message?: string | null;
  metadata?: Record<string, unknown>;
};

type GoalCopy = {
  title: string;
  body: string;
  ruleKey: string;
  triggerType: string;
};

type ExpoSendResult = {
  ok: boolean;
  status: number;
  body: unknown;
};

const SYSTEM_RULES: Record<GoalScope, { key: string; triggerType: string }> = {
  day: { key: "daily_goal_achieved_system", triggerType: "daily_goal" },
  week: { key: "weekly_goal_achieved_system", triggerType: "weekly_goal" },
  month: { key: "monthly_goal_achieved_system", triggerType: "monthly_goal" },
  quarter: { key: "quarterly_goal_achieved_system", triggerType: "quarterly_goal" },
};

function isExpoPushToken(token: string) {
  return token.startsWith("ExponentPushToken") || token.startsWith("ExpoPushToken");
}

function formatMoney(value: number, opts?: { signed?: boolean }) {
  const safe = Number.isFinite(value) ? value : 0;
  const abs = Math.abs(safe).toFixed(2);
  if (opts?.signed) {
    return `${safe >= 0 ? "+" : "-"}$${abs}`;
  }
  return `$${abs}`;
}

function normalizeLocale(locale?: string | null) {
  return String(locale || "").toLowerCase().startsWith("es") ? "es" : "en";
}

function buildDefaultCopy(params: NotifyGoalAchievementParams, locale: "en" | "es"): GoalCopy {
  const system = SYSTEM_RULES[params.goalScope];
  const actual = Number(params.actualAmount ?? 0);
  const goal = Number(params.goalAmount ?? 0);
  const target = Number(params.targetBalance ?? 0);
  const hasAmounts = Number.isFinite(actual) && Number.isFinite(goal) && goal > 0;
  const hasTarget = Number.isFinite(target) && target > 0;

  const scopeLabel =
    locale === "es"
      ? params.goalScope === "day"
        ? "diaria"
        : params.goalScope === "week"
          ? "semanal"
          : params.goalScope === "month"
            ? "mensual"
            : "trimestral"
      : params.goalScope === "day"
        ? "daily"
        : params.goalScope === "week"
          ? "weekly"
          : params.goalScope === "month"
            ? "monthly"
            : "quarter";

  const title =
    locale === "es"
      ? `Meta ${scopeLabel} alcanzada`
      : `${scopeLabel.charAt(0).toUpperCase()}${scopeLabel.slice(1)} goal achieved`;

  if (locale === "es") {
    const parts = [`Has alcanzado tu meta ${scopeLabel}.`];
    if (hasAmounts) {
      parts.push(`P&L actual ${formatMoney(actual, { signed: true })} vs meta ${formatMoney(goal)}.`);
    }
    if (hasTarget) {
      parts.push(`Balance objetivo ${formatMoney(target)}.`);
    }
    parts.push(
      params.goalScope === "day"
        ? "Protege la ganancia y mantén la disciplina."
        : "Cierra con estructura y define el siguiente checkpoint."
    );
    return {
      title,
      body: parts.join(" "),
      ruleKey: system.key,
      triggerType: system.triggerType,
    };
  }

  const parts = [`You reached your ${scopeLabel} goal.`];
  if (hasAmounts) {
    parts.push(`Current P&L ${formatMoney(actual, { signed: true })} vs goal ${formatMoney(goal)}.`);
  }
  if (hasTarget) {
    parts.push(`Target balance ${formatMoney(target)}.`);
  }
  parts.push(
    params.goalScope === "day"
      ? "Protect the win and keep discipline."
      : "Close it with structure and define the next checkpoint."
  );

  return {
    title,
    body: parts.join(" "),
    ruleKey: system.key,
    triggerType: system.triggerType,
  };
}

async function ensureRule(userId: string, copy: GoalCopy, goalScope: GoalScope) {
  const { data: existingRule, error: ruleErr } = await supabaseAdmin
    .from("ntj_alert_rules")
    .select("id")
    .eq("user_id", userId)
    .eq("key", copy.ruleKey)
    .maybeSingle();

  if (ruleErr) throw new Error(ruleErr.message);

  const payload = {
    title: copy.title,
    message: copy.body,
    severity: "success",
    enabled: true,
    channels: ["inapp", "popup"],
    config: {
      source: "system",
      core: true,
      kind: "reminder",
      category: "achievement",
      goal_scope: goalScope,
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
      key: copy.ruleKey,
      trigger_type: copy.triggerType,
      ...payload,
    })
    .select("id")
    .single();

  if (createErr) throw new Error(createErr.message);
  return String((createdRule as any)?.id ?? "");
}

function applyAccountFilter(query: any, accountId?: string | null) {
  if (accountId) return query.eq("account_id", accountId);
  return query.is("account_id", null);
}

async function sendExpoMessages(messages: Array<Record<string, unknown>>) {
  const chunks: Array<Array<Record<string, unknown>>> = [];
  const size = 100;
  for (let i = 0; i < messages.length; i += size) {
    chunks.push(messages.slice(i, i + size));
  }

  const results: ExpoSendResult[] = [];
  for (const chunk of chunks) {
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(chunk),
    });
    const body = await res.json().catch(() => ({}));
    results.push({ ok: res.ok, status: res.status, body });
  }
  return results;
}

function collectAcceptedMessageIndices(results: ExpoSendResult[]) {
  const accepted = new Set<number>();
  let baseIndex = 0;

  for (const result of results) {
    const items = Array.isArray((result as any)?.body?.data) ? (result as any).body.data : [];
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      if (item?.status === "ok" && typeof item?.id === "string") {
        accepted.add(baseIndex + index);
      }
    }
    baseIndex += items.length;
  }

  return accepted;
}

export async function notifyGoalAchievement(params: NotifyGoalAchievementParams) {
  const scope = params.goalScope;
  if (!params.userId) throw new Error("Missing userId");
  if (!params.periodKey) throw new Error("Missing periodKey");

  let tokensQuery = supabaseAdmin
    .from("push_tokens")
    .select("expo_push_token, locale, user_id")
    .eq("user_id", params.userId)
    .eq("daily_reminder_enabled", true);

  const { data: tokenRows, error: tokenErr } = await tokensQuery;
  if (tokenErr) throw new Error(tokenErr.message);

  const pushRows = (tokenRows ?? []) as PushTokenRow[];
  const effectiveLocale = normalizeLocale(params.locale ?? pushRows[0]?.locale ?? null);
  const copy = {
    ...buildDefaultCopy(params, effectiveLocale),
    title: String(params.title || "").trim() || buildDefaultCopy(params, effectiveLocale).title,
    body: String(params.message || "").trim() || buildDefaultCopy(params, effectiveLocale).body,
  };

  const ruleId = await ensureRule(params.userId, copy, scope);

  let inAppInserted = false;
  let inAppQuery = supabaseAdmin
    .from("goal_achievement_deliveries")
    .select("id")
    .eq("user_id", params.userId)
    .eq("goal_scope", scope)
    .eq("period_key", params.periodKey)
    .eq("channel", "inapp")
    .limit(1);
  inAppQuery = applyAccountFilter(inAppQuery, params.accountId);
  const { data: existingInApp, error: inAppErr } = await inAppQuery.maybeSingle();
  if (inAppErr) throw new Error(inAppErr.message);

  if (!existingInApp?.id) {
    const nowIso = new Date().toISOString();
    const dateKey = scope === "day" ? params.periodKey : new Date().toISOString().slice(0, 10);
    const { data: eventRow, error: eventErr } = await supabaseAdmin
      .from("ntj_alert_events")
      .insert({
        user_id: params.userId,
        rule_id: ruleId,
        date: dateKey,
        status: "active",
        triggered_at: nowIso,
        dismissed_until: null,
        acknowledged_at: null,
        payload: {
          title: copy.title,
          message: copy.body,
          severity: "success",
          channels: ["inapp", "popup"],
          kind: "reminder",
          category: "achievement",
          goal_scope: scope,
          period_key: params.periodKey,
          account_id: params.accountId ?? null,
          goal_amount: params.goalAmount ?? null,
          actual_amount: params.actualAmount ?? null,
          target_balance: params.targetBalance ?? null,
          progress: params.progress ?? null,
          ...(params.metadata ?? {}),
        },
      })
      .select("id")
      .single();

    if (eventErr) throw new Error(eventErr.message);

    const { error: deliveryErr } = await supabaseAdmin.from("goal_achievement_deliveries").insert({
      user_id: params.userId,
      account_id: params.accountId ?? null,
      goal_scope: scope,
      period_key: params.periodKey,
      channel: "inapp",
      rule_id: ruleId,
      event_id: (eventRow as any)?.id ?? null,
      payload: {
        title: copy.title,
        message: copy.body,
      },
    });

    if (deliveryErr && deliveryErr.code !== "23505") {
      throw new Error(deliveryErr.message);
    }

    inAppInserted = true;
  }

  let sentPushQuery = supabaseAdmin
    .from("goal_achievement_deliveries")
    .select("delivery_target")
    .eq("user_id", params.userId)
    .eq("goal_scope", scope)
    .eq("period_key", params.periodKey)
    .eq("channel", "push");
  sentPushQuery = applyAccountFilter(sentPushQuery, params.accountId);

  const { data: sentPushRows, error: sentPushErr } = await sentPushQuery;
  if (sentPushErr) throw new Error(sentPushErr.message);

  const deliveredTargets = new Set(
    (sentPushRows ?? [])
      .map((row: any) => String(row?.delivery_target ?? "").trim())
      .filter(Boolean)
  );

  const pushTargets = pushRows.filter((row) => {
    const token = String(row.expo_push_token || "").trim();
    if (!isExpoPushToken(token)) return false;
    if (deliveredTargets.has(token)) return false;
    return true;
  });

  if (!pushTargets.length) {
    return {
      ok: true,
      inAppInserted,
      pushSent: 0,
      pushCandidates: 0,
    };
  }

  const messages = pushTargets.map((row) => ({
    to: row.expo_push_token,
    title: copy.title,
    body: copy.body,
    sound: "default",
    data: {
      screen: "Messages",
      type: "goal_achievement",
      goalScope: scope,
      periodKey: params.periodKey,
    },
  }));

  const results = await sendExpoMessages(messages);
  const acceptedIndices = collectAcceptedMessageIndices(results);

  const pushDeliveries = pushTargets
    .map((row, index) => ({ row, index }))
    .filter(({ index }) => acceptedIndices.has(index))
    .map(({ row }) => ({
      user_id: params.userId,
      account_id: params.accountId ?? null,
      goal_scope: scope,
      period_key: params.periodKey,
      channel: "push",
      delivery_target: row.expo_push_token,
      rule_id: ruleId,
      payload: {
        title: copy.title,
        message: copy.body,
      },
    }));

  if (pushDeliveries.length > 0) {
    const { error: deliveryErr } = await supabaseAdmin
      .from("goal_achievement_deliveries")
      .insert(pushDeliveries);

    if (deliveryErr && deliveryErr.code !== "23505") {
      throw new Error(deliveryErr.message);
    }
  }

  return {
    ok: true,
    inAppInserted,
    pushSent: pushDeliveries.length,
    pushCandidates: pushTargets.length,
    results,
  };
}
