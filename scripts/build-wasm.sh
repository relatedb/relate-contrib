#!/usr/bin/env bash
# Build the engine's browser package from the pinned submodule into vendor/cypherlite-wasm/pkg.
# Wraps the engine's own scripts/build-wasm.sh; output and the cargo target stay outside the submodule.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENGINE="$ROOT/vendor/cypherlite"
OUT="$ROOT/vendor/cypherlite-wasm/pkg"
TARGET="$ROOT/vendor/.build/target"
MODE="${1:-release}"

fail() { echo "build-wasm: $*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || fail "missing tool '$1'. $2"; }

[ -f "$ENGINE/scripts/build-wasm.sh" ] || fail "the engine submodule is not checked out. Run: git submodule update --init vendor/cypherlite"

need cargo "Install Rust with rustup."
need rustup "Install Rust with rustup."
need wasm-opt "Install binaryen (for example: brew install binaryen)."
need wasm-bindgen "Install wasm-bindgen-cli at the version the engine pins (see below)."

WANT="$(bash "$ENGINE/scripts/build-wasm.sh" --print-bindgen-version)"
HAVE="$(wasm-bindgen --version | awk '{print $2}')"
[ "$WANT" = "$HAVE" ] || fail "wasm-bindgen-cli is $HAVE but the engine's Cargo.lock pins $WANT. Install it with: cargo install wasm-bindgen-cli --version $WANT"

(cd "$ENGINE" && rustup target list --installed | grep -q '^wasm32-unknown-unknown$') \
  || fail "the wasm32-unknown-unknown target is missing for the engine's toolchain. Run in vendor/cypherlite: rustup target add wasm32-unknown-unknown"

rm -rf "$OUT"
mkdir -p "$OUT" "$TARGET"
CARGO_TARGET_DIR="$TARGET" BUILD_WASM_OUT_DIR="$OUT" bash "$ENGINE/scripts/build-wasm.sh" --mode "$MODE"

for f in cypherlite.js cypherlite_bg.wasm trap.js opfs.js package.json; do
  [ -f "$OUT/$f" ] || fail "expected $OUT/$f after the build, but it is missing"
done
echo "build-wasm: engine package ready in $OUT"
