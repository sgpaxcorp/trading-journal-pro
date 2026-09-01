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
8. Account structure and maximum leverage: cash, margin, or leveraged derivatives.
9. Estimated cost per trading session and a tax-reserve percentage for positive trading growth.
10. The final operating plan you will follow, including **My manual plan** when applicable.

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
6. Business-capital setup: account structure, leverage, contributions, withdrawals, and operating costs.
7. Trading friction and planning reserves: estimated per-session costs and a user-declared tax reserve.

It then separates four values that must not be mixed: the **target compound projection** required to reach the requested capital and date, the **gross selected-percentage projection** after compounding goal days and losing days, the **net operating projection** after fixed session costs, and the **actual account balance** from the same account series used by the Dashboard. If gross growth is positive but the net projection falls to zero, the platform identifies fixed-cost drag as the cause; it never describes that result as a failure of compound-return math or rewrites the projected target checkpoints.

If documented performance does not show a positive edge, the engine withholds a completion date supported by trading gains. The correct next phase is evidence qualification and process improvement, not a larger return assumption. If scheduled contributions alone can fund the target, the platform may show that funding horizon, but trading growth remains at 0% and the plan remains in qualification.

The operating model searches up to a 50-year horizon for a defensible completion date. Independently, the target compound projection always builds the requested weekly, monthly, quarterly, six-month, and annual goals when the required return can be solved mathematically.

## Scenario laboratory
The plan compares five views without mixing their purpose:
1. **Your declared inputs** show exactly what the percentages you entered would produce, even when that combination has negative expectancy.
2. **Conservative, Moderate, and Aggressive** show policy-controlled operating cases using the same schedule, costs, capital flows, and target.
3. **Exact target math** solves the goal-day return required to touch the requested target while preserving the declared losing-day frequency and loss assumption.

Each view shows deterministic projected balance, annualized math, P10/median/P90 sensitivity balances, a **conditional hit rate**, median maximum drawdown, and sensitivity to losing at least 50% of starting capital. The conditional hit rate assumes the entered win/loss percentages and frequency continue; it is not an empirical probability of real-world success. The seeded paths are planning stress tests, not forecasts, guarantees, or individualized investment advice. A target can be mathematically possible while remaining speculative, outside the selected policy, or unsupported by execution evidence.

## Business-capital guardrails
The Growth Plan always classifies the account as **trading business operating capital** and its source as **business income**. It does not ask for emergency funds, living expenses, retirement funds, or other personal-finance information. Account structure and leverage remain required because they change the operating risk; leverage above 2x is surfaced as a warning.

Trading costs reduce every modeled session. The interface shows the gross percentage-compound balance, the balance net of fixed session costs, and the accumulated difference between them. The tax reserve is applied only to positive modeled net trading growth and is shown separately; it is a planning estimate that must be confirmed with a qualified tax professional.

## Model-Recommended Operating Path
Complete the five Business Analysis inputs: risk profile, experience, income dependency, drawdown comfort, and trading style. The plan then presents an explicit operating recommendation based on your starting capital and business target.

The recommendation shows:
1. The operating scenario that best fits your profile.
2. Goal-day %, risk per trade, maximum daily loss, and planned loss days per week.
3. Estimated trading days, operating weeks, months, and completion date.
4. Weekly, monthly, quarterly, six-month, and annual target-compound goals with dates, plus actual balance and variance once each checkpoint is due.
5. Modeled weekly, monthly, and annual return assumptions before the plan is evaluated.

Select **Apply operating recommendation** to use the model-selected scenario. If it produces a later defensible completion date, **Use operating runway** can change the requested runway explicitly. The target projection is never silently replaced by a weak operating baseline.

This is a planning projection, not a promise of returns. Actual timing changes with execution, losses, withdrawals, and market conditions.

## Required operating assumptions
The evaluation remains hidden until the operating assumptions are complete. Choose **Conservative**, **Moderate**, **Aggressive**, or **Manual**, then confirm:
1. Goal-day return percentage.
2. Expected losing-day percentage.
3. Trading days and expected losing days per week.
4. Hard daily-loss stop and risk per trade.
5. Whether contributions will be added, with cadence and amount.
6. Whether withdrawals will be taken, with cadence and amount.
7. Business account structure and maximum leverage.
8. Per-session costs and tax-reserve percentage.
9. The final operating plan selected for execution.

Policy modes populate their operating assumptions automatically. Manual mode accepts the user's percentages and requires **My manual plan** to be selected explicitly before evaluation or saving. The deterministic compound path and seeded P10/P50/P90 sensitivity run with the same schedule, losing-day assumptions, contributions, withdrawals, and costs. The evidence-aware roadmap can still classify the plan as provisional or unsupported; a typed percentage is never a return guarantee.

Every roadmap separates **trading growth**, **contributions**, **withdrawals**, and **net balance change**. A deposit can help reach the capital target, but it is never presented as trading profit.

## Evidence-based plan review
The review separates metrics that must not be confused:
1. **Perfect-path return per session**: the mathematical compound rate if every committed session were positive, with declared contributions and withdrawals still applied separately.
2. **Requested required return**: the mathematical pace needed to reach the requested target on the requested date. This is a diagnostic, not an approved operating target.
3. **Disciplined operating pace**: the profile-based goal-day return and expected losing-day result used by the adaptive projection.
4. **Execution evidence**: the number of recorded sessions/trades plus available win rate, profit factor, expectancy, and drawdown evidence.
5. **Capital flows**: planned contributions and withdrawals that change equity without changing trading performance.
6. **Gross versus net operating projection**: goal-day and loss-day percentages are compounded multiplicatively first; fixed dollar costs are then deducted and reported as cost drag. For example, four `+2.5%` days and one `-2%` day produce approximately `+8.17%` for the modeled week before fixed costs. Annualized math uses the number of committed cycles available in the selected instrument's one-year calendar, so NYSE holidays are not treated as extra trading sessions.

Preset policies do not let a declared goal-day percentage raise their operating recommendation or let an optimistic loss-day input improve their modeled result. A manually selected plan compounds the entered percentages exactly, but extreme annualized math is labeled as a conditional scenario and remains provisional until execution evidence supports it. Established evidence may reduce the modeled pace; it never automatically increases risk.

Select **Run deep review** to ask Research AI to explain the verified calculation with the private CFA-informed research methodology. The deterministic engine remains authoritative. AI adds context, limitations, and disciplined actions; it cannot change the numbers, promise returns, provide individualized investment advice, or recommend buying or selling a security.

## Required disclosure before activation
The Trading Business Plan is an educational business-planning and discipline tool. Its projections, target-compound paths, conditional hit rates, checkpoints, simulations, and AI explanations depend on the data and assumptions entered by the user. They are not forecasts, guarantees of profit, or individualized investment, trading, legal, tax, or accounting advice.

Before a plan can be activated or updated, the user must:
1. Evaluate the current draft.
2. Review the projected-versus-actual framework, operating assumptions, costs, capital flows, and risk limits.
3. Accept the current Trading Business Plan disclosure.

Changing any draft input on mobile invalidates the previous evaluation and disclosure acceptance. The platform stores the disclosure version, acceptance time, purpose, and source with the Business Analysis record. Acceptance means committing to disciplined process, risk controls, accurate records, and regular review; it never means committing to a promised return.

## Platform synchronization
On mobile, use **Evaluate plan before saving** to review the same five scenarios, compound statistical validation, business-capital setup, costs, tax reserve, horizon, trading growth, contributions, and withdrawals without changing the active plan. After **Approve & Save**, the saved phases become the official checkpoint source for web, mobile, dashboard, Business Protection System, and AI Coach. `Plan Progress` reads the active weekly checkpoint while the adaptive roadmap preserves weekly, monthly, quarterly, six-month, and annual targets. Mobile never changes an unsupported date silently; the user must explicitly apply the operating runway or revise the assumptions before saving.

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
These values describe what the requested target and deadline mathematically demand. They define the target checkpoint projection but do not silently become the selected operating return assumption. Compare them with the operating baseline, actual balance, variance, and evidence before approving the plan.

## 10) Cadence & Milestones
What it is: weekly target-compound checkpoints inside monthly, quarterly, six-month, and annual capital targets. Each expired checkpoint compares projected target, actual account balance on that date, and dollar variance.
Why it matters: it moves attention away from the distant final number and toward the next measurable process period.
How to use it:
1. Execute against the **next monthly checkpoint**.
2. Use the weekly checkpoint to detect variance early.
3. Review quarterly, six-month, and annual targets without increasing risk to catch up.

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
