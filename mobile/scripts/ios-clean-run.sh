#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_NAME="${IOS_APP_NAME:-NeuroTrader}"
DERIVED_DATA_ROOT="${HOME}/Library/Developer/Xcode/DerivedData"

echo "==> Mobile root: ${ROOT_DIR}"
cd "${ROOT_DIR}"

echo "==> Regenerating iOS project"
npx expo prebuild --platform ios --no-install

echo "==> Installing pods"
npx pod-install ios

echo "==> Cleaning iOS build artifacts"
rm -rf ios/build
if [[ -d "${DERIVED_DATA_ROOT}" ]]; then
  find "${DERIVED_DATA_ROOT}" -maxdepth 1 -type d -name "${APP_NAME}-*" -print -exec rm -rf {} +
fi

echo "==> Building and installing Release on physical iPhone"
npx expo run:ios --device --configuration Release
