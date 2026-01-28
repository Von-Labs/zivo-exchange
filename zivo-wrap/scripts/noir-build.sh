#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CIRCUIT_DIR="${ZK_CIRCUIT_DIR:-$ROOT_DIR/noir_circuit}"
CIRCUIT_NAME="${ZK_CIRCUIT_NAME:-zivo_wrap_shielded}"

cd "$CIRCUIT_DIR"

nargo compile

sunspot compile "target/${CIRCUIT_NAME}.json"
sunspot setup "target/${CIRCUIT_NAME}.ccs"
sunspot deploy "target/${CIRCUIT_NAME}.vk"

if [[ "${NOIR_RUN_PROVE:-}" == "1" ]]; then
  nargo execute
  sunspot prove "target/${CIRCUIT_NAME}.json" "target/${CIRCUIT_NAME}.gz" "target/${CIRCUIT_NAME}.ccs" "target/${CIRCUIT_NAME}.pk"
fi
