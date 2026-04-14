# Rules & Alarms
## Access
- Left navigation → `Rules & Alarms` → `Alarms`.

Rules & Alarms is your automated discipline console. It watches your configured alarm rules, checks your trading day, and creates active alarms when something needs your attention.

## What this page is for
Use this page to:
- see active alarms that need action now
- create custom alarms for your process
- review alarm history
- audit open positions and expiring options
- test a rule before relying on it live

This page is for **discipline and risk control**. It is not just a reminder list.

## How it works
The platform checks your enabled rules and compares them against your current trading data.

It can evaluate things such as:
- open positions still active
- options expiring today
- daily max loss reached
- missing screenshots
- missing emotions
- missing checklist
- impulse tags detected

If a rule is triggered, the platform creates an alarm event and shows it inside this page and in the in-app alert flow.

## Core rules vs custom rules
There are two kinds of rules:

### Core rules
These are system rules that help protect process automatically.

Examples:
- `Open positions detected`
- `Options expiring today`

Core rules are managed by the system so the platform can always watch the most important risk situations.

### Custom alarms
These are rules you create yourself.

Your custom alarm limit depends on your plan:
- `Core`: up to 2 custom alarms
- `Advanced`: up to 10 custom alarms

## Page sections
The page has four main tabs:

### Active
Shows alarms that are firing now.

Use this tab when you want to:
- see what needs attention immediately
- snooze an alarm
- dismiss an alarm
- inspect the details of a live event

### Rules
Shows your enabled and disabled rules.

Use this tab when you want to:
- review which rules are active
- create a new custom alarm
- edit an existing rule
- test a rule

### Audit Trail
Shows position-related audit details, especially:
- open positions found by the engine
- options expiring today
- quick actions to close or classify them correctly

Use this tab when an alarm is related to:
- open positions
- expiring contracts
- swing vs day-trade classification

### History
Shows dismissed and past alarm events so you can review what happened before.

## Top summary cards
At the top of the page you will see summary cards such as:
- `Active alarms`
- `Snoozed`
- `Rules enabled`
- `Open positions`

These help you understand your current risk and process state quickly.

## Run Checks Now
Use `Run checks now` when:
- you just saved the journal
- you just synced/imported trades
- you want the latest alarms immediately instead of waiting

This forces a fresh evaluation of your enabled rules.

## How to create a custom alarm
Go to the `Rules` tab and click `Add alarm`.

Then fill in:

### 1. Title
This is the short name of the alarm.

Good examples:
- `Daily loss stop`
- `Missing screenshots`
- `Open positions after close`

Keep it short and clear.

### 2. Message
This is the action message you want to see when the rule fires.

Good examples:
- `Stop trading and review the day.`
- `Upload screenshots before closing the journal.`
- `Close the remaining position or mark it as swing.`

Write what you want the platform to tell you when discipline matters.

### 3. Trigger
Choose what condition should fire the alarm.

Available trigger types include:
- `Max daily loss`
- `Open positions detected`
- `Options expiring today`
- `Missing screenshots`
- `Missing emotions`
- `Checklist missing`
- `Impulse tags detected`

### 4. Threshold or minimum open positions
Some triggers need a number.

Examples:
- `Max daily loss`: enter the dollar limit
- `Open positions detected`: enter the minimum number of positions before the alarm should fire

If the trigger does not use a number, leave that field empty.

### 5. Severity
Choose how serious the event should appear:
- `Info`
- `Success`
- `Warning`
- `Critical`

Recommended:
- use `Warning` or `Critical` for true risk alarms
- use `Info` for softer discipline reminders

### 6. Channels
Choose where the event should surface.

Typical choices:
- `Popup`
- `In-app`
- `Voice`

Recommended:
- keep `In-app` enabled
- use `Popup` for urgent alarms

### 7. Save
Click `Create alarm`.

The rule will be added to your rules list and will start evaluating automatically if it is enabled.

## How to test a rule
In the `Rules` tab, click `Test` on a rule.

This creates a separate test event so you can verify:
- the alarm appears correctly
- the message reads well
- the severity feels right

Use testing before depending on a new alarm live.

## How to manage an active alarm
Inside the `Active` tab or alarm detail panel, you can:

### Snooze
Use this when:
- the condition still exists
- but you do not need to see it for a short period

Common snooze options:
- `10m`
- `1h`
- `24h`

### Dismiss
Use this when:
- you handled the issue
- or the alarm no longer needs attention

Dismissed alarms move to history.

## How to use the Audit Trail
Use `Audit Trail` when the engine finds:
- open positions
- expiring options

This section helps you review:
- which symbol is still open
- quantity
- contract type
- expiration
- whether it came from trades, journal, or notes

Use it to:
- close a remaining position
- decide whether it should be marked as swing
- handle premium strategies that expire at zero

## Best practices
- Keep only the rules that matter. Too many alarms creates noise.
- Use strong wording in messages so the action is obvious.
- Test a rule after creating it.
- Re-run checks after imports, sync, or major journal edits.
- Review history weekly to see which alarms repeat.

## Recommended starter setup
If you are just starting, enable or create these first:
- `Open positions detected`
- `Options expiring today`
- `Max daily loss`
- `Missing screenshots`
- `Missing emotions`

This gives you a strong first layer of discipline coverage.

## Important note
Rules & Alarms is designed to protect:
- risk
- process
- journal hygiene

It is not a replacement for your judgment. It is your automated discipline assistant.
