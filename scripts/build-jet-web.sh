#!/bin/sh
set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)

cd "$repo_root"
wasm-pack build crates/jet-web \
  --target web \
  --release \
  --out-dir "$repo_root/playground/generated/jet-web"
