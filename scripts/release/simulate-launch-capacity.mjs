const baseUrl = String(process.env.CAPACITY_BASE_URL || "http://127.0.0.1:3100").replace(/\/$/, "");
const virtualUsers = positiveInteger(process.env.CAPACITY_VIRTUAL_USERS, 1_000);
const requestTimeoutMs = positiveInteger(process.env.CAPACITY_REQUEST_TIMEOUT_MS, 10_000);
const p95LimitMs = positiveInteger(process.env.CAPACITY_P95_LIMIT_MS, 2_000);
const maxErrorRate = positiveNumber(process.env.CAPACITY_MAX_ERROR_RATE, 0.01);
const stageConcurrency = String(process.env.CAPACITY_STAGES || "50,150,300,500")
  .split(",")
  .map((value) => Number.parseInt(value.trim(), 10))
  .filter((value) => Number.isInteger(value) && value > 0);

const paths = String(process.env.CAPACITY_PATHS || "/,/signin,/pricing,/privacy,/terms")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

if (!stageConcurrency.length) throw new Error("CAPACITY_STAGES must contain at least one positive integer.");
if (!paths.length) throw new Error("CAPACITY_PATHS must contain at least one path.");

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function percentile(sorted, ratio) {
  if (!sorted.length) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index];
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

async function fetchOne(requestNumber) {
  const userNumber = requestNumber % virtualUsers;
  const path = paths[requestNumber % paths.length];
  const startedAt = performance.now();
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      cache: "no-store",
      redirect: "follow",
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "NeuroTrader-Launch-Capacity-Simulation/1.0",
        "X-Readiness-User": `synthetic-${userNumber}`,
      },
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
    await response.arrayBuffer();
    return {
      ok: response.ok,
      status: response.status,
      path,
      latencyMs: performance.now() - startedAt,
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      path,
      latencyMs: performance.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runStage(concurrency) {
  const totalRequests = Math.max(virtualUsers, concurrency * 4);
  const startedAt = performance.now();
  const results = new Array(totalRequests);
  let nextRequest = 0;

  async function worker() {
    while (true) {
      const current = nextRequest;
      nextRequest += 1;
      if (current >= totalRequests) return;
      results[current] = await fetchOne(current);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, totalRequests) }, () => worker()));

  const durationMs = performance.now() - startedAt;
  const latencies = results.map((result) => result.latencyMs).sort((a, b) => a - b);
  const failures = results.filter((result) => !result.ok);
  const statusCounts = {};
  for (const result of results) {
    const key = String(result.status || "network_error");
    statusCounts[key] = (statusCounts[key] || 0) + 1;
  }

  const errorRate = failures.length / totalRequests;
  const summary = {
    concurrency,
    virtualUsers,
    totalRequests,
    durationMs: round(durationMs),
    requestsPerSecond: round(totalRequests / (durationMs / 1_000)),
    latencyMs: {
      p50: round(percentile(latencies, 0.5)),
      p95: round(percentile(latencies, 0.95)),
      p99: round(percentile(latencies, 0.99)),
      max: round(latencies.at(-1) || 0),
    },
    errors: failures.length,
    errorRate: round(errorRate, 4),
    statusCounts,
    passed: errorRate <= maxErrorRate && percentile(latencies, 0.95) <= p95LimitMs,
  };

  if (failures.length) {
    summary.sampleErrors = failures.slice(0, 5).map(({ path, status, error }) => ({ path, status, error }));
  }
  return summary;
}

async function ensureTargetReady() {
  const response = await fetch(`${baseUrl}/`, { signal: AbortSignal.timeout(requestTimeoutMs) });
  await response.arrayBuffer();
  if (!response.ok) throw new Error(`Capacity target is not ready (${response.status}).`);
}

await ensureTargetReady();

const report = {
  generatedAt: new Date().toISOString(),
  target: baseUrl,
  thresholds: { p95LimitMs, maxErrorRate, requestTimeoutMs },
  paths,
  stages: [],
};

for (const concurrency of stageConcurrency) {
  const stage = await runStage(concurrency);
  report.stages.push(stage);
  process.stdout.write(`${JSON.stringify(stage)}\n`);
  await new Promise((resolve) => setTimeout(resolve, 500));
}

report.passed = report.stages.every((stage) => stage.passed);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

if (!report.passed) process.exitCode = 1;
