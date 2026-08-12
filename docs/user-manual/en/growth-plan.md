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

## Plan Mode (Automatic)
The plan is always automatic and runway-based. The system calculates the target date from the start date and selected runway, then applies the selected instrument calendar to calculate available market sessions, committed trading days, pacing, and checkpoints.

Stocks/ETFs and U.S. listed options use the U.S. exchange holiday calendar. Crypto can use seven sessions per week. Futures and `Other` use planning estimates because exact sessions depend on the selected contract and venue; verify the contract schedule before relying on the date.

## Model-Recommended Operating Path
Complete the five Business Analysis inputs: risk profile, experience, income dependency, drawdown comfort, and trading style. The plan then presents an explicit operating recommendation based on your starting capital and business target.

The recommendation shows:
1. The operating scenario that best fits your profile.
2. Goal-day %, risk per trade, maximum daily loss, and planned loss days per week.
3. Estimated trading days, operating weeks, months, and completion date.
4. Phase-by-phase capital targets, percentages, dates, and execution periods.

Select **Apply operating recommendation** to place the model-selected scenario, percentages, and calculated target date into the plan. The percentage remains constant through the phases so projected growth comes from compounding rather than automatically increasing risk.

This is a planning projection, not a promise of returns. Actual timing changes with execution, losses, withdrawals, and market conditions.

## Evidence-based plan review
The review separates metrics that must not be confused:
1. **Perfect-path return per session**: the mathematical compound rate if every committed session were positive and there were no withdrawals.
2. **Required goal-day return**: the average required only on modeled goal days after applying planned loss days, maximum loss, and withdrawals.
3. **Operating-model coverage**: how much of the required goal-day pace is covered by the selected scenario.
4. **Execution evidence**: the number of recorded sessions/trades plus available win rate, profit factor, expectancy, and drawdown evidence.

A plan can be mathematically defined without being supported by the selected operating model or the trader's execution history. The platform labels those conditions separately instead of presenting a return formula as a promise of feasibility.

Select **Run deep review** to ask Research AI to explain the verified calculation with the private research methodology. The deterministic engine remains authoritative; AI cannot change the numbers, promise returns, or recommend buying or selling a security.

## Platform synchronization
After **Approve & Save**, the saved weekly phases become the official checkpoint source for both web and mobile. `Plan Progress` reads those same phases to calculate Week, Month, and Quarter checkpoints, while the Business Protection System receives the plan's daily-goal and maximum-loss limits. Editing the plan from mobile preserves the Business Analysis profile, runway, instrument calendar, and operating scenario, then regenerates the same official checkpoint schedule.

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

## 6) Loss Days per Week
What it is: the number of losing days you expect per 5 trading days.  
Why it matters: the system uses this to compute the **required goal‑day %**.  
How to fill it: be honest. If you usually lose 2 days per week, enter 2.

## 7) Risk per Trade (%)
What it is: the maximum risk per position, as a percentage of equity.  
Why it matters: it keeps sizing consistent and protects the plan.  
How to fill it: set a number you will actually respect.

## 8) Perfect-Path % and Required Goal‑Day %
What they are: the perfect-path % applies to every committed session with no modeled losses; the required goal-day % applies only to **goal days** after loss days and withdrawals are accounted for.
Why it matters: it translates your plan into a required operating pace.
How to use it: always read both values and their assumptions. Treat the goal-day result as an operating benchmark, not a daily guarantee or return forecast.

## 9) Cadence & Milestones
What it is: weekly checkpoints aligned to monthly goals, based on trading days.  
Why it matters: it prevents you from thinking “I’m far from the goal” and instead gives you the next objective.  
How to use it:
1. Focus on the **first checkpoint**.
2. Treat each week as a small step to the monthly goal.
3. Review the quarterly summary to confirm your pace at a higher level.

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
