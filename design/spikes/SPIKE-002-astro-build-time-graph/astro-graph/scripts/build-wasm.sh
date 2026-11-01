#!/usr/bin/env bash
# Build the CypherLite WASM package from a local checkout into .wasm-build/pkg,
# keeping the checkout read-only (build output and the cargo target directory
# both live outside it).
#
# Usage: CYPHERLITE_DIR=/path/to/cypherlite [MODE=release|dev] npm run build:wasm
# Prerequisites: rustup with the wasm32-unknown-unknown target for the
# checkout's pinned toolchain, wasm-bindgen-cli at the version its Cargo.lock
# pins, and binaryen >= 110 (see the checkout's scripts/build-wasm.sh).
set -euo pipefail
: "${CYPHERLITE_DIR:?set CYPHERLITE_DIR to a CypherLite checkout}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export BUILD_WASM_OUT_DIR="$HERE/.wasm-build/pkg"
export CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-$HERE/.wasm-build/target}"
bash "$CYPHERLITE_DIR/scripts/build-wasm.sh" --mode "${MODE:-release}"
