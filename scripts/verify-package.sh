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

echo "==> OK: 配布物と雛形は利用者側で動く"
