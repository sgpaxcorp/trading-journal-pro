#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const appJsonPath = path.join(__dirname, "..", "app.json");
const packageJsonPath = path.join(__dirname, "..", "package.json");
const withMarketing = process.argv.includes("--marketing");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

function parseSemver(version) {
  const match = String(version || "").match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    throw new Error(`Invalid semantic version "${version}". Expected x.y.z`);
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function bumpPatch(version) {
  const v = parseSemver(version);
  return `${v.major}.${v.minor}.${v.patch + 1}`;
}

function bumpInt(value, fallback) {
  const n = Number.parseInt(String(value ?? fallback), 10);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n + 1;
}

const appJson = readJson(appJsonPath);
if (!appJson.expo) {
  throw new Error("app.json must contain an expo object");
}

const currentVersion = appJson.expo.version || "1.0.0";
const nextVersion = withMarketing ? bumpPatch(currentVersion) : currentVersion;

const currentIosBuild = appJson.expo.ios?.buildNumber ?? "1";
const nextIosBuild = String(bumpInt(currentIosBuild, 1));
const currentAndroidCode = appJson.expo.android?.versionCode ?? 1;
const nextAndroidCode = bumpInt(currentAndroidCode, 1);

appJson.expo.version = nextVersion;
appJson.expo.ios = { ...(appJson.expo.ios || {}), buildNumber: nextIosBuild };
appJson.expo.android = { ...(appJson.expo.android || {}), versionCode: nextAndroidCode };
writeJson(appJsonPath, appJson);

const packageJson = readJson(packageJsonPath);
if (withMarketing && packageJson.version && packageJson.version !== nextVersion) {
  packageJson.version = nextVersion;
  writeJson(packageJsonPath, packageJson);
}

console.log(
  [
    `App version: ${currentVersion} -> ${nextVersion}`,
    `iOS buildNumber: ${currentIosBuild} -> ${nextIosBuild}`,
    `Android versionCode: ${currentAndroidCode} -> ${nextAndroidCode}`,
  ].join("\n")
);
