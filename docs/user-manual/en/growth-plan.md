# Growth Plan (Step by Step)

## Access
- Left navigation → Growth Plan.

The Growth Plan is the control center of the platform. It defines your pace, risk limits, and target timeline. Every progress widget and goal calculation references this plan.

## Before you start
Have these inputs ready:
1. Your real account balance today.
2. Your target balance (total equity, not just profit).
3. The runway you want to evaluate (days, weeks, months, or years).
4. The primary instrument you operate: stocks/ETFs, listed options, futures, forex, crypto, or another market.
5. The return model you want to evaluate: conservative, moderate, aggressive, or manual.
6. Expected trading days and losing days per week, including the typical losing-day percentage.
7. Any recurring capital contributions or withdrawals, including amount, frequency, and starting period.
8. The source of the starting capital, emergency-fund coverage, essential monthly expenses, and liquid reserves kept outside trading.
9. Account structure and maximum leverage: cash, margin, or leveraged derivatives.
10. Estimated cost per trading session and a tax-reserve percentage for positive trading growth.

## Plan Mode (Automatic)
The plan is always automatic and runway-based. The system calculates the target date from the start date and selected runway, then applies the selected instrument calendar to calculate available market sessions, committed trading days, pacing, and checkpoints.

Stocks/ETFs and U.S. listed options use the U.S. exchange holiday calendar. Crypto can use seven sessions per week. Futures and `Other` use planning estimates because exact sessions depend on the selected contract and venue; verify the contract schedule before relying on the date.

## Requested Goal vs. Disciplined Operating Horizon
You may enter any starting capital, target capital, and requested runway. The platform does not assume that the requested deadline is feasible and does not turn an aggressive input into an approved return assumption.

The adaptive engine evaluates:
1. The exact market sessions available for the selected instrument.
2. Your operating days and expected losing days per week.
3. Goal-day return, expected losing-day result, hard daily-loss limit, and risk per trade.
4. Planned contributions and withdrawals. These are modeled as capital flows, never as trading return.
5. Recorded execution evidence: sessions, trades, average net result per session, profit factor, expectancy, and drawdown.
6. Financial capacity: capital source, emergency reserves, essential expenses, account structure, and leverage.
7. Trading friction and planning reserves: estimated per-session costs and a user-declared tax reserve.

It then reports the capital projected by the requested date, deadline coverage, any shortfall, and a disciplined estimated completion date. If the requested deadline is unsupported, select **Use recommended runway** before activating the plan. Official web and mobile checkpoints will use the accepted disciplined horizon, not the unsupported deadline.

If documented performance does not show a positive edge, the engine withholds a completion date supported by trading gains. The correct next phase is evidence qualification and process improvement, not a larger return assumption. If scheduled contributions alone can fund the target, the platform may show that funding horizon, but trading growth remains at 0% and the plan remains in qualification.

The deterministic roadmap searches up to a 50-year planning horizon. A target outside that boundary cannot be activated as an official checkpoint schedule.

## Scenario laboratory
The plan compares five views without mixing their purpose:
1. **Your declared inputs** show exactly what the percentages you entered would produce, even when that combination has negative expectancy.
2. **Conservative, Moderate, and Aggressive** show policy-controlled operating cases using the same schedule, costs, capital flows, and target.
3. **Exact target math** solves the goal-day return required to touch the requested target while preserving the declared losing-day frequency and loss assumption.

Each view shows deterministic projected balance, annualized math, P10/median/P90 sensitivity balances, target-hit sensitivity, median maximum drawdown, and sensitivity to losing at least 50% of starting capital. The seeded paths are planning stress tests, not forecasts, guarantees, or individualized investment advice. A target can be mathematically possible while remaining speculative, outside the selected policy, or unsupported by execution evidence.

## Financial capacity guardrails
The plan can be evaluated with any declared capital source, but it cannot be activated with borrowed money, retirement funds, emergency funds, or money required for living expenses. Reserves below three months and leverage above 2x are surfaced as warnings. These rules protect the operating plan from confusing essential capital with risk capital.

Trading costs reduce every modeled session. The tax reserve is applied only to positive modeled trading growth and is shown separately; it is a planning estimate that must be confirmed with a qualified tax professional.

## Model-Recommended Operating Path
Complete the five Business Analysis inputs: risk profile, experience, income dependency, drawdown comfort, and trading style. The plan then presents an explicit operating recommendation based on your starting capital and business target.

The recommendation shows:
1. The operating scenario that best fits your profile.
2. Goal-day %, risk per trade, maximum daily loss, and planned loss days per week.
3. Estimated trading days, operating weeks, months, and completion date.
4. Monthly, quarterly, and annual capital targets with dates and execution periods.
5. Modeled weekly, monthly, and annual return assumptions before the plan is evaluated.

Select **Apply operating recommendation** to use the model-selected scenario. If the requested deadline is unsupported, use **Use recommended runway** to recalculate the official checkpoints. The percentage remains constant through the phases so projected growth comes from compounding rather than automatically increasing risk.

This is a planning projection, not a promise of returns. Actual timing changes with execution, losses, withdrawals, and market conditions.

## Required operating assumptions
The evaluation remains hidden until the operating assumptions are complete. Choose **Conservative**, **Moderate**, **Aggressive**, or **Manual**, then confirm:
1. Goal-day return percentage.
2. Expected losing-day percentage.
3. Trading days and expected losing days per week.
4. Hard daily-loss stop and risk per trade.
5. Whether contributions will be added, with cadence and amount.
6. Whether withdrawals will be taken, with cadence and amount.
7. Financial capacity, capital source, account structure, and leverage.
8. Per-session costs and tax-reserve percentage.

Policy modes populate their operating assumptions automatically. Manual mode accepts the user's percentages, but the adaptive engine still evaluates them against profile guardrails and documented execution. It will not approve a faster pace merely because a larger percentage was typed.

Every roadmap separates **trading growth**, **contributions**, **withdrawals**, and **net balance change**. A deposit can help reach the capital target, but it is never presented as trading profit.

## Evidence-based plan review
The review separates metrics that must not be confused:
1. **Perfect-path return per session**: the mathematical compound rate if every committed session were positive, with declared contributions and withdrawals still applied separately.
2. **Requested required return**: the mathematical pace needed to reach the requested target on the requested date. This is a diagnostic, not an approved operating target.
3. **Disciplined operating pace**: the profile-based goal-day return and expected losing-day result used by the adaptive projection.
4. **Execution evidence**: the number of recorded sessions/trades plus available win rate, profit factor, expectancy, and drawdown evidence.
5. **Capital flows**: planned contributions and withdrawals that change equity without changing trading performance.

A declared goal-day percentage cannot raise the recommendation above the selected policy, and an optimistic loss-day input cannot improve the modeled result without supporting evidence. Established evidence may reduce the recommended pace; it never automatically increases risk.

Select **Run deep review** to ask Research AI to explain the verified calculation with the private CFA-informed research methodology. The deterministic engine remains authoritative. AI adds context, limitations, and disciplined actions; it cannot change the numbers, promise returns, provide individualized investment advice, or recommend buying or selling a security.

## Platform synchronization
On mobile, use **Evaluate plan before saving** to review the same five scenarios, capacity guardrails, costs, tax reserve, horizon, trading growth, contributions, and withdrawals without changing the active plan. After **Approve & Save**, the saved phases become the official checkpoint source for web, mobile, dashboard, Business Protection System, and AI Coach. `Plan Progress` reads the active weekly checkpoint while the adaptive roadmap preserves monthly, quarterly, and annual targets. Mobile automatically activates the disciplined horizon when its first save finds that the requested deadline is unsupported.

## 1) Starting Balance
What it is: your current broker account equity.  
Why it matters: all risk and pacing are calculated from this number.  
How to fill it: edit **Starting Capital** directly inside `Goal & Numbers → Business Analysis → Capital Policy Profile`. Use the actual number you can trade today (not your goal).

## 2) Target Balance
What it is: the total equity you want to reach by the target date.  
Why it matters: defines the growth requirement for the plan.  
How to fill it: edit **Business Target** beside Starting Capital. Set a meaningful destination, then review the AI-recommended period before saving.

## 3) Trading Runway and Target Date
What it is: the period you want to evaluate in days, weeks, months, or years.
Why it matters: the target date, market sessions, committed days, and checkpoint pace are calculated from it.
How to fill it: choose the period first; the target date is read-only and recalculates from the plan start date.

## 4) Instrument Calendar and Trading Days
What it is: the number of trading days you commit to between today and your target date.  
How it’s set: auto‑calculated from the selected instrument calendar and your average operating days per week.
When to edit: adjust the average operating days if you will deliberately trade fewer sessions than the market offers. Futures and `Other` calendars remain estimates until you verify the venue/contract schedule.

## 5) Max Daily Loss (%)
What it is: your daily safety brake. If you hit it, you stop trading for the day.  
Why it matters: it prevents compounding losses and protects capital.  
How to fill it: choose a percentage you can follow under stress.

This is a hard guardrail, not the loss assumed on every modeled losing day.

## 6) Goal-Day Model and Expected Loss-Day
**Goal-day model** is the disciplined return assumption for modeled positive sessions. **Expected loss-day** is the planning result for a typical modeled losing session. The platform evaluates your declared values against the profile-based policy; it does not let a more aggressive input accelerate the recommendation.

## 7) Loss Days per Week
What it is: the number of losing days you expect per 5 trading days.  
Why it matters: the system uses this to compute the **required goal‑day %**.  
How to fill it: be honest. If you usually lose 2 days per week, enter 2.

## 8) Risk per Trade (%)
What it is: the maximum risk per position, as a percentage of equity.  
Why it matters: it keeps sizing consistent and protects the plan.  
How to fill it: set a number you will actually respect.

## 9) Perfect-Path % and Requested Required Pace
These values describe what the requested target and deadline mathematically demand. They do not become the saved daily goal. Compare them with the adaptive recommendation, projected balance, deadline coverage, and recommended horizon.

## 10) Cadence & Milestones
What it is: weekly execution checkpoints inside monthly, quarterly, and annual capital targets.
Why it matters: it moves attention away from the distant final number and toward the next measurable process period.
How to use it:
1. Execute against the **next monthly checkpoint**.
2. Use the weekly checkpoint to detect variance early.
3. Review quarterly and annual targets without increasing risk to catch up.

Important note:
- In the Dashboard, `Account Progress` and `Plan Progress` do not mean the same thing.
- `Account Progress` shows the real account equity state.
- `Plan Progress` measures Week / Month / Quarter against the **checkpoint base balance** and the **checkpoint target balance** from the plan.
- That is why a week can appear “ahead” or “completed” even if today is red, as long as your current balance is still above that checkpoint target.
- To see what you actually did this week, use `Weekly Summary`.

## PDF Plan
Use the “Download PDF” action to keep a reference version of your plan and pacing.

## Best practice
Update the plan only when your trading reality changes (capital, schedule, risk tolerance). Do not edit the plan daily just because of a red day.
