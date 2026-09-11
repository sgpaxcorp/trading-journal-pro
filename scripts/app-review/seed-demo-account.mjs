import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";

function loadLocalEnv() {
  try {
    const source = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of source.split(/\r?\n/)) {
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match || process.env[match[1]]) continue;
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[match[1]] = value;
    }
  } catch {
    // CI and production scripts can provide variables directly.
  }
}

loadLocalEnv();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const reviewEmail = (process.env.APP_REVIEW_DEMO_EMAIL || "appreview@neurotrader-journal.com").toLowerCase();
const deletionEmail = (process.env.APP_REVIEW_DELETE_EMAIL || "appreview-delete@neurotrader-journal.com").toLowerCase();
const password = process.env.APP_REVIEW_DEMO_PASSWORD;
const currentTermsVersion = "2026-09-03";
const currentPrivacyVersion = "2026-09-10";

if (!supabaseUrl || !serviceRoleKey || !password) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and APP_REVIEW_DEMO_PASSWORD are required."
  );
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const response = await fetch(`${supabaseUrl}/rest/v1/`, {
  headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
});
const openApi = response.ok ? await response.json() : {};
const definitions = openApi?.definitions ?? {};

function tableExists(table) {
  return Boolean(definitions?.[table]);
}

function filterColumns(table, row) {
  const columns = definitions?.[table]?.properties;
  if (!columns) return row;
  return Object.fromEntries(
    Object.entries(row).filter(([key, value]) => Object.hasOwn(columns, key) && value !== undefined)
  );
}

async function findAuthUser(email) {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const found = data.users.find((user) => String(user.email ?? "").toLowerCase() === email);
    if (found) return found;
    if (data.users.length < 1000) break;
  }
  return null;
}

async function ensureAuthUser(email, firstName, lastName) {
  const existing = await findAuthUser(email);
  if (existing) {
    const { data, error } = await supabase.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
      user_metadata: {
        ...existing.user_metadata,
        first_name: firstName,
        last_name: lastName,
        plan: "advanced",
        subscriptionStatus: "active",
        accessSource: "app_review_demo",
      },
    });
    if (error) throw error;
    return data.user;
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      first_name: firstName,
      last_name: lastName,
      plan: "advanced",
      subscriptionStatus: "active",
      accessSource: "app_review_demo",
    },
  });
  if (error || !data.user) throw error ?? new Error(`Could not create ${email}`);
  return data.user;
}

async function deleteByUser(table, userId) {
  if (!tableExists(table)) return;
  const { error } = await supabase.from(table).delete().eq("user_id", userId);
  if (error) throw new Error(`${table} cleanup failed: ${error.message}`);
}

async function insertRows(table, rows) {
  if (!tableExists(table) || !rows.length) return;
  for (let index = 0; index < rows.length; index += 250) {
    const batch = rows.slice(index, index + 250).map((row) => filterColumns(table, row));
    const { error } = await supabase.from(table).insert(batch);
    if (error) throw new Error(`${table} insert failed: ${error.message}`);
  }
}

async function upsertRow(table, row, onConflict) {
  if (!tableExists(table)) return;
  const { error } = await supabase.from(table).upsert(filterColumns(table, row), { onConflict });
  if (error) throw new Error(`${table} upsert failed: ${error.message}`);
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function weekdaysFrom(startIso, count) {
  const dates = [];
  const date = new Date(`${startIso}T12:00:00Z`);
  while (dates.length < count) {
    const day = date.getUTCDay();
    if (day !== 0 && day !== 6) dates.push(isoDate(date));
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return dates;
}

const STOCK_SYMBOLS = ["NVDA", "AAPL", "MSFT", "TSLA", "AMZN", "META"];
const CRYPTO_MARKETS = ["BTC/USD", "ETH/USD"];
const FOREX_MARKETS = ["EUR/USD", "GBP/USD", "USD/JPY"];

function roundTo(value, digits = 2) {
  return Number(Number(value).toFixed(digits));
}

function datePlusDays(dateIso, days) {
  const date = new Date(`${dateIso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date;
}

function nextFridayOption(dateIso, index) {
  const expiry = datePlusDays(dateIso, 10);
  while (expiry.getUTCDay() !== 5) expiry.setUTCDate(expiry.getUTCDate() + 1);
  const expiryCode = expiry.toISOString().slice(2, 10).replaceAll("-", "");
  const roots = ["SPY", "QQQ"];
  const strikes = [650, 585];
  const slot = index % roots.length;
  const right = index % 3 === 1 ? "P" : "C";
  return {
    symbol: `${roots[slot]}${expiryCode}${right}${strikes[slot]}`,
    dte: Math.round((expiry.getTime() - new Date(`${dateIso}T12:00:00Z`).getTime()) / 86_400_000),
  };
}

function instrumentBlueprints(date, index) {
  const option = nextFridayOption(date, index);
  const stockSymbol = STOCK_SYMBOLS[index % STOCK_SYMBOLS.length];
  const cryptoSymbol = CRYPTO_MARKETS[index % CRYPTO_MARKETS.length];
  const forexSymbol = FOREX_MARKETS[index % FOREX_MARKETS.length];
  const stockPrices = { NVDA: 184.2, AAPL: 231.4, MSFT: 512.8, TSLA: 348.6, AMZN: 244.1, META: 706.5 };
  const cryptoPrices = { "BTC/USD": 112_450, "ETH/USD": 4_820 };
  const forexPrices = { "EUR/USD": 1.1642, "GBP/USD": 1.3524, "USD/JPY": 146.28 };
  const variation = 1 + ((index % 9) - 4) * 0.0015;

  return [
    {
      symbol: stockSymbol,
      kind: "stock",
      side: index % 7 === 3 ? "short" : "long",
      premium: "—",
      strategy: "Opening range continuation",
      dte: null,
      entryPrice: roundTo(stockPrices[stockSymbol] * variation, 2),
      entryTime: "09:42",
      exitTime: "10:18",
    },
    {
      symbol: option.symbol,
      kind: "option",
      side: "long",
      premium: "Debit",
      strategy: "single",
      dte: option.dte,
      entryPrice: roundTo(6.4 + (index % 7) * 0.38, 2),
      entryTime: "10:05",
      exitTime: "11:12",
    },
    {
      symbol: cryptoSymbol,
      kind: "crypto",
      side: index % 6 === 2 ? "short" : "long",
      premium: "—",
      strategy: "Trend pullback",
      dte: null,
      entryPrice: roundTo(cryptoPrices[cryptoSymbol] * variation, 2),
      entryTime: "12:20",
      exitTime: "13:45",
    },
    {
      symbol: forexSymbol,
      kind: "forex",
      side: index % 5 === 2 ? "short" : "long",
      premium: "—",
      strategy: "London-New York continuation",
      dte: null,
      entryPrice: roundTo(forexPrices[forexSymbol] * variation, forexSymbol === "USD/JPY" ? 3 : 5),
      entryTime: "14:10",
      exitTime: "15:20",
    },
  ];
}

function positionQuantity(blueprint, targetPnl) {
  const target = Math.max(Math.abs(targetPnl), 1);
  if (blueprint.kind === "stock") return Math.max(10, Math.ceil(target / 5 / 5) * 5);
  if (blueprint.kind === "option") return Math.max(1, Math.ceil(target / 125));
  if (blueprint.kind === "crypto") {
    const desiredMove = blueprint.symbol.startsWith("BTC") ? 650 : 45;
    return Math.max(0.05, roundTo(target / desiredMove, 3));
  }
  const desiredMove = blueprint.symbol === "USD/JPY" ? 0.35 : 0.0025;
  return Math.max(10_000, Math.ceil(target / desiredMove / 1_000) * 1_000);
}

function exitPriceFor(blueprint, quantity, targetPnl) {
  const multiplier = blueprint.kind === "option" ? 100 : 1;
  const direction = blueprint.side === "short" ? -1 : 1;
  const raw = blueprint.entryPrice + targetPnl / (quantity * multiplier * direction);
  const digits = blueprint.kind === "forex" ? (blueprint.symbol === "USD/JPY" ? 3 : 5) : 2;
  return roundTo(Math.max(raw, 0.00001), digits);
}

function buildTradeExecutions({ date, index, grossPnl, showcase }) {
  const blueprints = instrumentBlueprints(date, index);
  const selected = showcase ? blueprints : [blueprints[index % blueprints.length]];
  const ratios = selected.length === 1
    ? [grossPnl >= 0 ? 1 : -1]
    : grossPnl >= 0
      ? [0.46, 0.31, 0.28, -0.05]
      : [-0.48, -0.37, 0.1, -0.25];
  const grossMagnitude = Math.abs(grossPnl);

  return selected.map((blueprint, tradeIndex) => {
    const targetPnl = roundTo(grossMagnitude * ratios[tradeIndex], 2);
    const quantity = positionQuantity(blueprint, targetPnl);
    return {
      ...blueprint,
      quantity,
      exitPrice: exitPriceFor(blueprint, quantity, targetPnl),
      targetPnl,
      emotions: [tradeIndex === selected.length - 1 && targetPnl < 0 ? "Patient" : "Focused"],
      strategyChecklist: ["Risk defined", "Entry matched setup", "Exit documented"],
    };
  });
}

function noteTrade(trade, leg) {
  return {
    id: randomUUID(),
    symbol: trade.symbol,
    kind: trade.kind,
    side: trade.side,
    premiumSide: trade.kind === "option" ? "debit" : "none",
    optionStrategy: trade.kind === "option" ? "single" : undefined,
    strategy: trade.strategy,
    dte: trade.dte,
    price: leg === "entry" ? trade.entryPrice : trade.exitPrice,
    quantity: trade.quantity,
    time: leg === "entry" ? trade.entryTime : trade.exitTime,
    emotions: trade.emotions,
    strategyChecklist: trade.strategyChecklist,
    simulatedPnl: trade.targetPnl,
  };
}

function buildSessions({ userId, accountId, startIso, count, startingBalance, pattern }) {
  let balance = startingBalance;
  return weekdaysFrom(startIso, count).map((date, index) => {
    const pct = pattern[index % pattern.length];
    const pnl = Number((balance * (pct / 100)).toFixed(2));
    const openingBalance = balance;
    balance = Number((balance + pnl).toFixed(2));
    const showcase = index >= count - 8;
    const commissions = showcase ? 6.8 : 1.25;
    const fees = showcase ? 2.35 : 0.35;
    const grossPnl = roundTo(pnl + commissions + fees, 2);
    const tradeExecutions = buildTradeExecutions({ date, index, grossPnl, showcase });
    const entries = tradeExecutions.map((trade) => noteTrade(trade, "entry"));
    const exits = tradeExecutions.map((trade) => noteTrade(trade, "exit"));
    const instrument = showcase
      ? tradeExecutions.map((trade) => trade.symbol).join(" | ")
      : tradeExecutions[0].symbol;
    const respectedPlan = index % 17 !== 16;
    const emotion = pct > 0 ? "Focused" : "Patient";
    const note = {
      premarket: "Reviewed scheduled events, marked decision levels, and confirmed the daily loss limit before execution.",
      live: showcase
        ? "Executed four independent setups across equity, options, digital assets, and currency markets. Each position used predefined risk and its own invalidation level."
        : `Executed the planned ${tradeExecutions[0].kind} setup only after price confirmed the level.`,
      post: respectedPlan
        ? "Closed the session within the operating plan. Recorded fills, costs, decision quality, and one improvement for the next session."
        : "Stopped immediately after the documented deviation and reduced next-session size instead of attempting to recover the loss.",
      summary: respectedPlan
        ? "Executed the planned setup, respected size, and closed according to the invalidation rule."
        : "Stopped after the first rule deviation, documented it, and reduced size for the next session.",
      account_balance: { asOfDate: date, openingBalance, endingBalance: balance, source: "simulated_app_review" },
      entries,
      exits,
      costs: { commissions, fees },
      pnl: { gross: grossPnl, net: pnl },
      mindset: { emotional_balance: respectedPlan ? 5 : 3, impulse_control: respectedPlan ? 5 : 3, setup_quality: 4, probability: 4 },
      checklists: {
        premarket: ["News/events checked", "Key levels marked", "Bias & plan defined", "Risk & size set"],
        inside: ["Entry matched setup", "Stop placed immediately", "Position size respected", "Managed per plan"],
        after: ["Execution record updated", "Mistakes noted", "Lesson captured", "Next action defined"],
        strategy: ["A+ setup", "R/R ≥ 2R", "Clear invalidation", "Followed plan"],
        impulses: [],
        states: [respectedPlan ? "Focused" : "Calm"],
      },
      after_review: {
        checklist: {
          followed_exit_plan: respectedPlan,
          exit_at_level: respectedPlan,
          exit_emotion: false,
          moved_stop_no_plan: false,
          let_winner_run: pnl > 0,
          partials_ok: true,
          size_ok: true,
          fomo_revenge: false,
          early_exit: false,
          discipline_pressure: true,
        },
        ratings: { execution: respectedPlan ? 5 : 3, patience: respectedPlan ? 5 : 3, clarity: 4 },
        notes: {
          didWell: "Defined risk before every entry and kept each market thesis independent.",
          improve: pnl > 0
            ? "Keep the same selection standard; do not increase risk because the session was profitable."
            : "Wait for cleaner confirmation and preserve the daily stop without adding recovery trades.",
        },
      },
      review: {
        followedPlan: respectedPlan,
        lesson: pct > 0 ? "Repeat the setup without increasing risk." : "Accept the planned loss and preserve decision quality.",
      },
      instrument_mix: tradeExecutions.map(({ symbol, kind, side, strategy, targetPnl }) => ({ symbol, kind, side, strategy, simulatedPnl: targetPnl })),
      demo: true,
    };
    const journalTags = [
      "PRE: News/events checked",
      "PRE: Key levels marked",
      "PRE: Bias & plan defined",
      "PRE: Risk & size set",
      "IN: Entry matched setup",
      "IN: Stop placed immediately",
      "IN: Position size respected",
      "IN: Managed per plan",
      "POST: Execution record updated",
      "POST: Lesson captured",
      "POST: Next action defined",
      "STRAT: A+ setup",
      "STRAT: R/R ≥ 2R",
      "STRAT: Clear invalidation",
      ...(respectedPlan ? ["STRAT: Followed plan"] : []),
      pnl > 0 ? "Take Profit Hit" : "Stopped out (loss)",
    ];
    return {
      id: randomUUID(),
      user_id: userId,
      account_id: accountId,
      date,
      pnl,
      instrument,
      direction: tradeExecutions[0].side,
      entry_price: tradeExecutions[0].entryPrice,
      exit_price: tradeExecutions[0].exitPrice,
      size: showcase ? tradeExecutions.length : tradeExecutions[0].quantity,
      notes: JSON.stringify(note),
      emotion,
      tags: journalTags,
      respected_plan: respectedPlan,
      created_at: `${date}T16:00:00.000Z`,
      updated_at: `${date}T16:15:00.000Z`,
      openingBalance,
      endingBalance: balance,
      tradeExecutions,
      respectedPlan,
    };
  });
}

function journalTradeRows(session) {
  return session.tradeExecutions.flatMap((trade) => [
    {
      user_id: session.user_id, account_id: session.account_id,
      journal_date: session.date, leg: "entry", symbol: trade.symbol, kind: trade.kind, side: trade.side,
      premium: trade.premium, strategy: trade.strategy, dte: trade.dte,
      price: trade.entryPrice, quantity: trade.quantity, time: trade.entryTime,
      emotions: trade.emotions, strategy_checklist: trade.strategyChecklist,
      created_at: `${session.date}T13:42:00.000Z`,
    },
    {
      user_id: session.user_id, account_id: session.account_id,
      journal_date: session.date, leg: "exit", symbol: trade.symbol, kind: trade.kind, side: trade.side,
      premium: trade.premium, strategy: trade.strategy, dte: trade.dte,
      price: trade.exitPrice, quantity: trade.quantity, time: trade.exitTime,
      emotions: [trade.targetPnl >= 0 ? "Calm" : "Patient"], strategy_checklist: ["Exit documented", "Daily risk reviewed"],
      created_at: `${session.date}T19:20:00.000Z`,
    },
  ]);
}

function validateDemoSessions(sessions, expectedCount) {
  if (sessions.length !== expectedCount) throw new Error(`Expected ${expectedCount} demo sessions, found ${sessions.length}.`);
  if (sessions.at(-1)?.endingBalance !== 250_007.28) {
    throw new Error(`Expected the demo to end at $250,007.28, found $${sessions.at(-1)?.endingBalance}.`);
  }
  const kinds = new Set(sessions.flatMap((session) => session.tradeExecutions.map((trade) => trade.kind)));
  for (const kind of ["stock", "option", "crypto", "forex"]) {
    if (!kinds.has(kind)) throw new Error(`Demo sessions are missing ${kind} executions.`);
  }
  for (const session of sessions) {
    for (const trade of session.tradeExecutions) {
      if (!trade.symbol || trade.quantity <= 0 || trade.entryPrice <= 0 || trade.exitPrice <= 0) {
        throw new Error(`Invalid ${trade.kind} execution generated for ${session.date}.`);
      }
    }
  }
  for (const session of sessions.slice(-8)) {
    if (session.tradeExecutions.length !== 4) throw new Error(`Showcase session ${session.date} must contain four completed trades.`);
  }
}

function planSteps({ title, requiredDailyPct, objectiveNote }) {
  const checklist = (prefix, items) => items.map((text, index) => ({
    id: `${prefix}-${index + 1}`, text, isSuggested: true, isActive: true,
  }));
  return {
    business_analysis: {
      selectedScenarioId: "moderate",
      selectedScenario: {
        id: "moderate",
        title: "Controlled growth",
        dailyGoalPct: requiredDailyPct,
        expectedLossDayPct: 0.65,
        maxDailyLossPct: 1,
        riskPerTradePct: 0.5,
      },
      operatingModel: {
        returnModelMode: "moderate",
        selectedPlanId: "moderate",
        tradingInstrument: "stocks",
        averageTradingDaysPerWeek: 5,
        winningDaysPerWeek: 4,
        expectedLossDayPct: 0.65,
        estimatedCostPerSessionUsd: 4,
        estimatedTaxReservePct: 20,
        plannedDepositSettings: { enabled: false, frequency: "monthly", amount: 0, startPeriodIndex: 1 },
        plannedWithdrawalSettings: { enabled: false, frequency: "monthly", amount: 0, startPeriodIndex: 1 },
      },
      demoDisclosure: "All activity is simulated for App Review. Projections are educational planning outputs, not promised results.",
    },
    prepare: {
      title: "Prepare before trading",
      checklist: checklist("prep", ["Review market context", "Mark levels", "Confirm emotional readiness"]),
      notes: objectiveNote,
    },
    analysis: { title: "Analysis model", styles: ["trend", "market structure"], notes: "Trade only when context and setup agree." },
    strategy: {
      title: "Strategy, entry, exit, and management",
      strategies: [{ id: "demo-orb", name: "Opening range continuation", setup: "Trend aligned, defined invalidation, minimum 2:1 planned reward-to-risk." }],
      notes: title,
    },
    execution_and_journal: {
      title: "Execution and journal system",
      requiredFields: ["emotions", "journal_notes", "risk", "invalidation"],
      system: {
        doList: checklist("do", ["Define risk before entry", "Record the trade", "Stop after the daily loss limit"]),
        dontList: checklist("dont", ["Do not chase price", "Do not increase size after a loss", "Do not trade without invalidation"]),
        orderList: checklist("order", ["Context", "Setup", "Risk", "Execution", "Review"]),
      },
    },
  };
}

function buildPlan({ id, userId, accountId, starting, target, start, end, dailyPct, completed = false }) {
  return {
    id,
    user_id: userId,
    account_id: accountId,
    starting_balance: starting,
    target_balance: target,
    daily_target_pct: dailyPct,
    daily_goal_percent: dailyPct,
    max_daily_loss_percent: completed ? 1 : 1.5,
    trading_days: completed ? 100 : 522,
    max_one_percent_loss_days: 1,
    loss_days_per_week: 1,
    max_risk_per_trade_percent: 0.5,
    max_risk_per_trade_usd: Number((starting * 0.005).toFixed(2)),
    steps: planSteps({
      title: completed ? "Completed validation cycle" : "Two-year capital operating plan",
      requiredDailyPct: dailyPct,
      objectiveNote: completed
        ? "Validate repeatability before accepting the next progressive objective."
        : "Operate the process required to pursue the two-year objective while preserving capital.",
    }),
    rules: [],
    selected_plan: "suggested",
    version: 3,
    plan_mode: "auto",
    plan_phases: [],
    reset_count: 0,
    plan_start_date: start,
    target_date: end,
    target_multiple: target / starting,
    planned_withdrawals: [],
    planned_withdrawal_settings: { enabled: false, frequency: "monthly", amount: 0, startPeriodIndex: 1 },
    created_at: `${start}T12:00:00.000Z`,
    updated_at: new Date().toISOString(),
  };
}

async function resetDemoWorkspace(userId) {
  const ordered = [
    "ai_coach_messages", "ai_coach_threads", "business_milestones", "ntj_alert_events", "ntj_alert_rules",
    "legal_acceptance_events",
    "analytics_edges", "analytics_snapshots", "journal_trades", "journal_entries", "daily_snapshots",
    "cashflows", "growth_plan_history", "growth_plans", "ntj_notebook_free_notes", "ntj_notebook_pages",
    "ntj_notebook_sections", "ntj_notebook_books", "user_preferences", "trading_accounts",
  ];
  for (const table of ordered) await deleteByUser(table, userId);
}

async function seedReviewer() {
  const user = await ensureAuthUser(reviewEmail, "App", "Reviewer");
  const mainAccountId = randomUUID();
  const mainPlanId = randomUUID();
  const mainSessions = buildSessions({
    userId: user.id, accountId: mainAccountId, startIso: "2024-09-11", count: 522,
    startingBalance: 10_000, pattern: [0.92403, 1.02403, 0.82403, 0.97403, -0.65],
  });
  validateDemoSessions(mainSessions, 522);

  await resetDemoWorkspace(user.id);
  const legalAcceptedAt = new Date().toISOString();

  await upsertRow("profiles", {
    id: user.id, email: reviewEmail, first_name: "App", last_name: "Reviewer", phone: null,
    plan: "advanced", subscription_status: "active", onboarding_completed: true,
    legal_terms_version: currentTermsVersion, legal_privacy_version: currentPrivacyVersion,
    legal_accepted_at: legalAcceptedAt,
  }, "id");
  await insertRows("legal_acceptance_events", [{
    id: randomUUID(), user_id: user.id, terms_version: currentTermsVersion,
    privacy_version: currentPrivacyVersion, source: "in_app_update", accepted_at: legalAcceptedAt,
    metadata: { purpose: "app_review", seeded: true },
  }]);
  await upsertRow("user_entitlements", {
    user_id: user.id, entitlement_key: "platform_access", status: "active", source: "demo",
    started_at: new Date().toISOString(), ends_at: null,
    metadata: { plan: "advanced", purpose: "app_review", simulated_data: true },
  }, "user_id,entitlement_key");

  await insertRows("trading_accounts", [
    { id: mainAccountId, user_id: user.id, name: "Two-Year Growth Demo", broker: "Demo data", account_type: "personal", is_default: true },
  ]);
  await upsertRow("user_preferences", {
    user_id: user.id, active_account_id: mainAccountId, language: "en", timezone: "America/Puerto_Rico",
    updated_at: new Date().toISOString(),
  }, "user_id");

  await insertRows("growth_plans", [
    buildPlan({ id: mainPlanId, userId: user.id, accountId: mainAccountId, starting: 10_000, target: 250_000, start: "2024-09-11", end: "2026-09-10", dailyPct: 0.62, completed: true }),
  ]);

  const allSessions = mainSessions;
  await insertRows("journal_entries", allSessions);
  await insertRows("journal_trades", allSessions.flatMap(journalTradeRows));
  await insertRows("daily_snapshots", allSessions.map((session) => ({
    id: randomUUID(), user_id: user.id, account_id: session.account_id, date: session.date,
    start_of_day_balance: session.openingBalance,
    expected_usd: Number((session.openingBalance * 0.0065).toFixed(2)),
    realized_usd: session.pnl,
    delta_usd: Number((session.pnl - session.openingBalance * 0.0065).toFixed(2)),
    goal_met: session.pnl > 0,
  })));

  const notebookId = randomUUID();
  await insertRows("ntj_notebook_books", [{
    id: notebookId, user_id: user.id, account_id: mainAccountId,
    name: "Two-Year Operating Book", description: "Decision log and operating evidence for the simulated $10,000 to $250,000 plan.",
    icon: "briefcase", color: "#2dd4bf", sort_order: 0, is_archived: false, scope: "account",
  }]);
  await insertRows("ntj_notebook_pages", [
    { id: randomUUID(), user_id: user.id, notebook_id: notebookId, title: "Capital objective and constraints", content: "Objective: pursue $250,000 from a $10,000 starting balance over 24 months. This is an aspirational operating target, not a promised outcome. Risk per trade is capped at 0.50%; daily loss is capped at 1.00%." },
    { id: randomUUID(), user_id: user.id, notebook_id: notebookId, title: "Opening range playbook", content: "Trade only with aligned context, a defined invalidation point, and planned reward-to-risk of at least 2:1. Do not increase size after losses. Stop when the daily loss guardrail is reached." },
    { id: randomUUID(), user_id: user.id, notebook_id: notebookId, title: "Weekly review", content: "Review plan adherence, expectancy, profit factor, drawdown, and recurring decision errors. Increase the objective only after enough evidence; never raise risk automatically because a target was reached." },
  ]);

  const threadId = randomUUID();
  await insertRows("ai_coach_threads", [{
    id: threadId, user_id: user.id, title: "Two-year plan review",
    summary: "Review of simulated execution against the active business plan.",
    metadata: { demo: true, account_id: mainAccountId },
  }]);
  await insertRows("ai_coach_messages", [
    { id: randomUUID(), thread_id: threadId, user_id: user.id, role: "user", content: "Analyze my progress objectively. Am I following the plan?", meta: { demo: true } },
    { id: randomUUID(), thread_id: threadId, user_id: user.id, role: "coach", content: "Your simulated record completed the two-year objective and most sessions respected the plan. The next cycle should increase the capital objective without increasing risk. Review the documented deviation days and continue judging progress by adherence, expectancy, and drawdown.", meta: { demo: true } },
  ]);

  await insertRows("business_milestones", [
    { id: randomUUID(), user_id: user.id, account_id: mainAccountId, milestone_key: "trading_business_plan_created", title: "Trading Business Plan created", description: "A written operating plan now governs the demo account.", metadata: { demo: true } },
    { id: randomUUID(), user_id: user.id, account_id: mainAccountId, milestone_key: "business_rules_defined", title: "Business rules defined", description: "Risk and execution rules are documented for review.", metadata: { demo: true } },
    { id: randomUUID(), user_id: user.id, account_id: mainAccountId, milestone_key: "business_analysis_completed", title: "Business analysis completed", description: "Capital objective, runway, and operating assumptions were evaluated.", metadata: { demo: true } },
  ]);

  return {
    userId: user.id,
    email: reviewEmail,
    mainAccountId,
    mainCurrentBalance: mainSessions.at(-1)?.endingBalance,
  };
}

async function seedDeletionReviewer() {
  const user = await ensureAuthUser(deletionEmail, "Delete", "Reviewer");
  await deleteByUser("legal_acceptance_events", user.id);
  const legalAcceptedAt = new Date().toISOString();
  await upsertRow("profiles", {
    id: user.id, email: deletionEmail, first_name: "Delete", last_name: "Reviewer",
    plan: "advanced", subscription_status: "active", onboarding_completed: true,
    legal_terms_version: currentTermsVersion, legal_privacy_version: currentPrivacyVersion,
    legal_accepted_at: legalAcceptedAt,
  }, "id");
  await insertRows("legal_acceptance_events", [{
    id: randomUUID(), user_id: user.id, terms_version: currentTermsVersion,
    privacy_version: currentPrivacyVersion, source: "in_app_update", accepted_at: legalAcceptedAt,
    metadata: { purpose: "account_deletion_review", seeded: true },
  }]);
  await upsertRow("user_entitlements", {
    user_id: user.id, entitlement_key: "platform_access", status: "active", source: "demo",
    started_at: new Date().toISOString(), metadata: { plan: "advanced", purpose: "account_deletion_review" },
  }, "user_id,entitlement_key");
  return { userId: user.id, email: deletionEmail };
}

const reviewer = await seedReviewer();
const deletionReviewer = await seedDeletionReviewer();
console.log(JSON.stringify({ ok: true, reviewer, deletionReviewer }, null, 2));
