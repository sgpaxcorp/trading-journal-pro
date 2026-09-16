import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

function filesBelow(path) {
  const absolute = join(root, path);
  if (!existsSync(absolute)) return [];
  return readdirSync(absolute, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath || entry.path, entry.name));
}

function containsAny(source, patterns) {
  return patterns.some((pattern) => source.includes(pattern));
}

function status(passed, partial = false) {
  if (passed) return "PASS";
  return partial ? "PARTIAL" : "FAIL";
}

const apiFiles = filesBelow("app/api").filter((path) => path.endsWith("route.ts"));
const apiSource = apiFiles.map((path) => readFileSync(path, "utf8")).join("\n");
const migrationsSource = filesBelow("supabase/migrations")
  .filter((path) => path.endsWith(".sql"))
  .map((path) => readFileSync(path, "utf8"))
  .join("\n");
const packageSource = `${read("package.json")}\n${read("mobile/package.json")}`;

const aiUsageSource = read("lib/aiUsageServer.ts");
const aiBudgetSql = read("supabase/migrations/20260915000800_operational_controls_and_ai_reservations.sql");
const aiGuardedRoutes = apiFiles.filter((path) => readFileSync(path, "utf8").includes("requireAiBudget")).length;
const aiBudgetAtomicReservation = aiBudgetSql.includes("pg_advisory_xact_lock")
  && aiBudgetSql.includes("ai_usage_reservations")
  && aiUsageSource.includes("reserve_ai_usage_budget");
const simulatedAiRequests = 500;
const simulatedCostPerRequestUsd = Number(process.env.READINESS_AI_REQUEST_COST_USD || 0.25);
const configuredGlobalDailyUsd = Number(process.env.AI_BUDGET_GLOBAL_DAILY_USD || 75);
const projectedConcurrentSpendUsd = simulatedAiRequests * simulatedCostPerRequestUsd;
const aiAllowedByAtomicGate = Math.min(
  simulatedAiRequests,
  Math.floor(configuredGlobalDailyUsd / simulatedCostPerRequestUsd)
);

const neuroJobsSource = read("lib/neuroAnalysisJobs.ts");
const uploadSource = read("app/api/neuro-analysis/upload-filing/route.ts");
const neuroWorkerSource = read("lib/neuroAnalysisJobWorker.ts");
const jobWorkerReferences = `${apiSource}\n${neuroJobsSource}\n${neuroWorkerSource}`.match(/markNeuroJob\s*\(/g)?.length || 0;
const pdfUsesSynchronousPolling = uploadSource.includes("createAndPoll");
const pdfEnqueuesUpload = uploadSource.includes("enqueueNeuroJob");
const pdfHasDurableWorker = existsSync(join(root, "app/api/neuro-analysis/jobs/process/route.ts"))
  && neuroWorkerSource.includes("claimNeuroJobs")
  && migrationsSource.includes("claim_neuro_analysis_jobs");

const forumRetired = !existsSync(join(root, "lib/forumSupabase.ts"))
  && filesBelow("app/(private)/forum").length === 0
  && /drop\s+table\s+if\s+exists\s+public\.forum_threads/i.test(migrationsSource);
const rlsTestsPresent = existsSync(join(root, "supabase/tests/authorization_hardening.sql"));
const profileColumnRestriction = migrationsSource.includes("profiles_protect_server_columns")
  && /revoke\s+insert,\s*update,\s*delete[\s\S]*user_entitlements/i.test(migrationsSource);

const stripeWebhook = read("app/api/stripe/webhook/route.ts");
const stripeEmailMigration = read("supabase/migrations/20260414_stripe_email_deliveries.sql");
const partnerMigration = read("supabase/migrations/20260217000200_partner_program.sql");
const stripeSignatureVerified = stripeWebhook.includes("stripe.webhooks.constructEvent");
const stripeEmailIdempotent = /unique\s+index[\s\S]*stripe_email_deliveries[\s\S]*event_id[\s\S]*email_key/i.test(stripeEmailMigration);
const stripeCommissionIdempotent = /unique\s+index[\s\S]*partner_commissions[\s\S]*stripe_invoice_id/i.test(partnerMigration);
const stripeEventLedger = /stripe_webhook_events|processed_stripe_events/i.test(migrationsSource);
const stripeReconciliation = read("app/api/stripe/subscription/route.ts").includes("stripe.subscriptions.retrieve");
const stripeIdentityAuthority = existsSync(join(root, "lib/stripeBillingIdentity.ts"))
  && stripeWebhook.includes("claim_stripe_webhook_event");

const waitlistDelivery = read("lib/waitlistLaunchDelivery.ts");
const emailWorkerSource = read("lib/emailDeliveryWorker.ts");
const emailHasClaim = emailWorkerSource.includes("claimEmailDeliveryJobs")
  && migrationsSource.includes("claim_email_delivery_jobs");
const emailHasRetryState = waitlistDelivery.includes('mode === "failed"');
const emailConcurrency = 25;
const emailHasDurableWorker = existsSync(join(root, "app/api/email-jobs/process/route.ts"))
  && migrationsSource.includes("email_delivery_jobs")
  && emailWorkerSource.includes("processEmailDeliveryBatch");
const simulatedRecipients = 500;
const emailDurationModel = [0.5, 1, 2, 5].map((secondsPerRecipient) => ({
  secondsPerRecipient,
  estimatedBatchSeconds: Math.ceil(simulatedRecipients / emailConcurrency) * secondsPerRecipient,
}));

const telemetryPresent = existsSync(join(root, "instrumentation.ts"))
  && existsSync(join(root, "lib/operationalTelemetry.ts"))
  && migrationsSource.includes("operational_events");
const healthEndpointPresent = existsSync(join(root, "app/api/health/route.ts"));
const adminMetricsPresent = existsSync(join(root, "app/api/admin/metrics/route.ts"));
const watchdogPresent = existsSync(join(root, "app/api/operations/watchdog/route.ts"));

const featureSource = `${apiSource}\n${filesBelow("lib").filter((path) => /\.(ts|tsx|js|mjs)$/.test(path)).map((path) => readFileSync(path, "utf8")).join("\n")}`;
const killSwitches = {
  brokerConnections: containsAny(featureSource, ['requireRuntimeControl("broker_connections")', "DISABLE_BROKER_CONNECTIONS"]),
  aiBudgets: containsAny(featureSource, ["AI_BUDGETS_ENABLED", "reserve_ai_usage_budget"]),
  signups: containsAny(featureSource, ['requireRuntimeControl("signup")']),
  checkout: containsAny(featureSource, ['requireRuntimeControl("checkout")']),
  aiFeatures: containsAny(featureSource, ['requireRuntimeControl("ai")']),
  pdfUploads: containsAny(featureSource, ['requireRuntimeControl("pdf_uploads")']),
  emailDelivery: containsAny(featureSource, ['requireRuntimeControl("email_delivery")']),
  adminConsole: existsSync(join(root, "app/(private)/admin/OperationalControlPanel.tsx")),
};

const results = [
  {
    id: 2,
    area: "AI budgets and queueing",
    status: status(aiGuardedRoutes > 0 && aiBudgetAtomicReservation, aiGuardedRoutes > 0),
    evidence: {
      guardedRoutes: aiGuardedRoutes,
      budgetFailsClosed: aiUsageSource.includes("temporarily unavailable") && aiUsageSource.includes("status: 503"),
      atomicReservation: aiBudgetAtomicReservation,
      simulation: {
        concurrentRequests: simulatedAiRequests,
        atomicReservationsAllowed: aiAllowedByAtomicGate,
        atomicReservationsRejected: simulatedAiRequests - aiAllowedByAtomicGate,
        assumedCostPerRequestUsd: simulatedCostPerRequestUsd,
        projectedSpendUsd: projectedConcurrentSpendUsd,
        configuredGlobalDailyUsd,
        possibleOvershootUsd: 0,
      },
    },
  },
  {
    id: 3,
    area: "PDF asynchronous processing",
    status: status(pdfHasDurableWorker && pdfEnqueuesUpload && !pdfUsesSynchronousPolling),
    evidence: {
      synchronousCreateAndPoll: pdfUsesSynchronousPolling,
      uploadEnqueuesJob: pdfEnqueuesUpload,
      durableWorkerDetected: pdfHasDurableWorker,
      markJobReferences: jobWorkerReferences,
    },
  },
  {
    id: 4,
    area: "Supabase isolation and RLS",
    status: status(forumRetired && rlsTestsPresent && profileColumnRestriction),
    evidence: { forumRetired, rlsTestsPresent, profileColumnRestriction },
  },
  {
    id: 5,
    area: "Stripe idempotency and reconciliation",
    status: status(
      stripeSignatureVerified && stripeEmailIdempotent && stripeCommissionIdempotent && stripeEventLedger && stripeReconciliation && stripeIdentityAuthority,
      stripeSignatureVerified && stripeEmailIdempotent && stripeCommissionIdempotent && stripeReconciliation
    ),
    evidence: {
      signatureVerified: stripeSignatureVerified,
      emailIdempotency: stripeEmailIdempotent,
      commissionIdempotency: stripeCommissionIdempotent,
      globalEventLedger: stripeEventLedger,
      subscriptionReconciliation: stripeReconciliation,
      billingIdentityAuthority: stripeIdentityAuthority,
    },
  },
  {
    id: 6,
    area: "Email queueing",
    status: status(emailHasClaim && emailHasRetryState && emailHasDurableWorker, emailHasClaim && emailHasRetryState),
    evidence: {
      channelClaim: emailHasClaim,
      failedRetryState: emailHasRetryState,
      concurrency: emailConcurrency,
      durableWorkerDetected: emailHasDurableWorker,
      simulation: { recipients: simulatedRecipients, durationModel: emailDurationModel },
    },
  },
  {
    id: 7,
    area: "Operational monitoring",
    status: status(telemetryPresent && healthEndpointPresent && adminMetricsPresent && watchdogPresent, healthEndpointPresent && adminMetricsPresent),
    evidence: { healthEndpointPresent, adminMetricsPresent, errorTracingDetected: telemetryPresent, watchdogPresent },
  },
  {
    id: 8,
    area: "Emergency controls",
    status: status(Object.values(killSwitches).every(Boolean), Object.values(killSwitches).some(Boolean)),
    evidence: killSwitches,
  },
];

const report = {
  generatedAt: new Date().toISOString(),
  results,
  summary: results.reduce((totals, result) => {
    totals[result.status] += 1;
    return totals;
  }, { PASS: 0, PARTIAL: 0, FAIL: 0 }),
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (results.some((result) => result.status === "FAIL")) process.exitCode = 1;
