# Internal Investment Management Architecture

This database architecture implements the private operating model described in the internal investment-management update. It does not create a partner portal, partner authentication, automatic money movement, or automatic report delivery.

## Operating Boundary

- Application access is limited to internal staff roles.
- Partners are records in `investment_partners`; they are not linked to `auth.users`.
- `investment_operating_configuration` permanently disables partner portal access, automatic report delivery, and real-money processing in this phase.
- Existing application administrators retain full internal permissions. Additional staff can receive granular investment roles through controlled server RPCs.

## Migration Map

| Migration | Responsibility |
| --- | --- |
| `20260916000700_internal_investment_rbac.sql` | Private operating configuration, internal roles, permissions, and role audit history |
| `20260916000800_investment_portfolio_accounting.sql` | Decimal double-entry ledger, accounting periods, reversals, portfolio snapshots, NAV, and reconciliation |
| `20260916000900_investment_partner_accounting.sql` | Internal partners, capital-account links, classes, capital-flow workflows, distributions, and configurable fees |
| `20260916001000_investment_performance_engine.sql` | Reproducible portfolio/partner performance, TWR/XIRR methodology, attribution, and benchmarks |
| `20260916001100_investment_reporting_data_classification.sql` | Field-level lineage, licensing, distribution classification, and human promotion to reporting |
| `20260916001200_investment_reporting_engine.sql` | Frozen snapshots, report versions, section review, validation, approval, issuance, and immutable exports |
| `20260916001300_investment_partner_workflow_controls.sql` | Human state transitions for classes, fee rules, assessments, distribution declarations, and payment reconciliation |

These migrations build on the existing investment data engine, capital-account ledger, investment governance, emergency controls, Daily Investment Office, and research modules.

## Accounting Invariants

- Monetary authority uses PostgreSQL `numeric`, never binary floating point.
- Journal entries require equal positive debits and credits.
- Posted journal history is append-only; corrections use reversal entries.
- Accounting periods cannot overlap and support open, soft-close, close, lock, and controlled reopen states.
- Contributions and withdrawals are external capital flows, not investment performance.
- Portfolio performance and individual partner performance are stored separately.
- NAV and partner capital must reconcile within an explicit tolerance before reporting.

## Reporting Gate

1. Create reportable data points with complete lineage.
2. An authorized human may promote eligible public, fund-accounting, or distributable derived data to `APPROVED_FOR_REPORTING`.
3. Approve deterministic performance and complete capital-to-NAV reconciliation.
4. Freeze a reporting snapshot.
5. Generate a versioned report draft from that snapshot.
6. Review every current section revision, including every AI-assisted draft.
7. Run report validation.
8. An authorized human moves the report from `REVIEW` to `APPROVED`.
9. Export and hash an immutable artifact.
10. An authorized human marks the report `ISSUED`.

The system blocks restricted or unknown-license data, revoked approvals, stale validation, failed reconciliation, missing benchmark data where applicable, unsnapshotted data, internal research leakage indicators, and guaranteed-return language.

## Deployment

Run the Supabase migration workflow in chronological order. Use `supabase db push --linked --include-all --dry-run` first, review the migration list, back up the target database, and then apply through the normal controlled deployment process. Do not paste individual migrations out of order.

The pgTAP coverage for this architecture is in `supabase/tests/internal_investment_architecture.sql`. The exact required unit-accounting scenario is also covered in `tests/unit/neuroCapitalAccounts.test.ts`.
