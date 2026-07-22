#!/usr/bin/env bash
# @model-checking/spec の配布物が利用者側で使えることを、実際に固めて入れて確かめる。
#
# ワークスペースのシンボリックリンク越しでは exports の解決も files の過不足も検証できないため、
# npm pack で作った tarball を雛形(templates/spec-starter)にインストールし、
# 利用者と同じ経路で型チェックと検査を通す。
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

echo "==> 配布物をビルドして固める"
npm run --workspace=@model-checking/spec build
tarball="$(cd "$repo_root/packages/spec" && npm pack --silent --pack-destination "$work")"
tarball="$work/$tarball"

echo "==> 雛形に配布物をインストールする"
cp -r "$repo_root/templates/spec-starter" "$work/consumer"
cd "$work/consumer"
# ワークスペース解決に落ちないよう、モノレポの外で完結させる
npm install --no-package-lock --install-links "$tarball" typescript vitest

echo "==> 利用者と同じ型チェックを通す"
npm run typecheck

echo "==> 利用者と同じ検査を通す"
npm run check

echo "==> CLI(bin)が node_modules/.bin に置かれ、検査が通る(反例なし → 終了コード0)"
npx model-checking check specs/

echo "==> CLI が反例を検出したら非ゼロ終了する"
mkdir -p specs-broken
cat > specs-broken/broken.ts <<'SPEC'
import { defineSpec } from "@model-checking/spec";
export const brokenSpec = defineSpec<{ n: number }>({
  init: { n: 0 },
  actions: { inc: { then: s => ({ n: s.n + 1 }) } },
  invariants: { small: s => s.n < 3 },
  done: s => s.n >= 5,
});
SPEC
if npx model-checking check specs-broken/; then
  echo "!! 反例があるのに終了コード0だった" >&2
  exit 1
fi
echo "==> OK(反例で非ゼロ終了を確認)"
rm -rf specs-broken

echo "==> OK: 配布物と雛形は利用者側で動く"
