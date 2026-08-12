import { spawnSync } from "node:child_process";

const severityRank = {
  info: 0,
  low: 1,
  moderate: 2,
  high: 3,
  critical: 4,
};

// Metro uses image-size while bundling assets. No patched npm release exists yet,
// so only these build-time advisories are accepted until upstream publishes one.
const allowedAdvisories = new Map([
  [
    "1138808",
    "image-size ICNS parser denial of service in the Metro build toolchain",
  ],
  [
    "1138809",
    "image-size JXL/HEIF parser denial of service in the Metro build toolchain",
  ],
]);

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const result = spawnSync(
  npmCommand,
  ["audit", "--omit=dev", "--audit-level=high", "--json"],
  { encoding: "utf8" },
);

let report;

try {
  report = JSON.parse(result.stdout);
} catch {
  console.error("Unable to parse npm audit output.");
  if (result.stdout) console.error(result.stdout);
  if (result.stderr) console.error(result.stderr);
  process.exit(1);
}

if (report.error) {
  console.error(`npm audit failed: ${report.error.summary ?? "unknown error"}`);
  process.exit(1);
}

const directAdvisories = new Map();

for (const vulnerability of Object.values(report.vulnerabilities ?? {})) {
  for (const advisory of vulnerability.via ?? []) {
    if (typeof advisory !== "object" || advisory === null) continue;
    if ((severityRank[advisory.severity] ?? 0) < severityRank.high) continue;

    directAdvisories.set(String(advisory.source), {
      id: String(advisory.source),
      name: advisory.name ?? vulnerability.name,
      severity: advisory.severity,
      title: advisory.title ?? "Untitled npm advisory",
      url: advisory.url,
    });
  }
}

const blocked = [...directAdvisories.values()].filter(
  ({ id }) => !allowedAdvisories.has(id),
);
const accepted = [...directAdvisories.values()].filter(({ id }) =>
  allowedAdvisories.has(id),
);
const counts = report.metadata?.vulnerabilities ?? {};
const reportedHighRisk = (counts.high ?? 0) + (counts.critical ?? 0);

if (blocked.length > 0) {
  console.error("Unapproved high or critical production vulnerabilities found:");
  for (const advisory of blocked) {
    console.error(
      `- ${advisory.id} [${advisory.severity}] ${advisory.name}: ${advisory.title}`,
    );
    if (advisory.url) console.error(`  ${advisory.url}`);
  }
  process.exit(1);
}

if (reportedHighRisk > 0 && directAdvisories.size === 0) {
  console.error(
    "npm reported high-risk vulnerabilities without advisory details; failing closed.",
  );
  process.exit(1);
}

if (accepted.length > 0) {
  console.warn("Accepted temporary build-time advisories:");
  for (const advisory of accepted) {
    console.warn(`- ${advisory.id}: ${allowedAdvisories.get(advisory.id)}`);
  }
}

console.log(
  `Mobile production audit passed (${blocked.length} unapproved high/critical advisories).`,
);
