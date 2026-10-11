#!/bin/sh
set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
source_dir="$repo_root/target/wllama-playground-src"
output_dir="$repo_root/playground/generated/wllama"
patch_file="$repo_root/patches/wllama-score-known-text.patch"
llama_patch_file="$repo_root/patches/llama-webgpu-subgroup-matrix.patch"
wllama_commit=dbc42c093dfd911360be12064ac8575fc629faa7

if [ ! -d "$source_dir/.git" ]; then
  git clone https://github.com/ngxson/wllama.git "$source_dir"
fi

git -C "$source_dir" fetch origin "$wllama_commit"
git -C "$source_dir" reset --hard "$wllama_commit"
git -C "$source_dir" clean -fdx
git -C "$source_dir" submodule update --init --recursive --force
git -C "$source_dir/llama.cpp" reset --hard
git -C "$source_dir/llama.cpp" clean -fdx
git -C "$source_dir" apply --check "$patch_file"
git -C "$source_dir" apply "$patch_file"
git -C "$source_dir/llama.cpp" apply --check "$llama_patch_file"
git -C "$source_dir/llama.cpp" apply "$llama_patch_file"

cd "$source_dir"
npm ci
SKIP_COMPAT=1 npm run build:wasm
node "$repo_root/scripts/patch-wllama-webgpu.mjs" "$source_dir/src/wasm/wllama.js"
npm run build

rm -rf "$output_dir"
mkdir -p "$(dirname -- "$output_dir")"
cp -R "$source_dir/esm" "$output_dir"
