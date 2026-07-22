#!/usr/bin/env bash
# @model-checking/spec を新しいバージョンでリリースする準備をする。
# 人間が手で回してもよいし、引数を渡せばエージェントに丸ごと任せられる。
#
# やること: リリース用ブランチを用意し、packages/spec の version を上げ、
# それに追随してバージョンが埋め込まれている箇所(雛形の依存URLなど)を
# 全部書き換え、リリース用のコミットを1つ作る。--pr を付ければ push して
# PR まで出す。「version は上げたが URL を書き換え忘れる」齟齬(issue #39 の
# 裏返し)を post-check で潰す。
#
# タグ作成と GitHub Release は release/* ブランチの PR が main にマージされたあと
# 自動化されている(.github/workflows/release-on-merge.yml)。このスクリプトは
# タグを切らないし、マージもしない(リリースの発火は人間のマージ操作に残す)。
# ブランチ名が release/ で始まらないとこの自動化は発火しないので、--branch を
# 指定するなら release/ を頭に付けること。
#
#   ./scripts/deploy.sh patch                 # 0.1.0 -> 0.1.1。ブランチを切ってコミットまで
#   ./scripts/deploy.sh minor --pr            # push して PR まで出す(エージェント向け)
#   ./scripts/deploy.sh 1.2.3 --branch relX   # ブランチ名を指定
set -euo pipefail

usage() {
  echo "使い方: ./scripts/deploy.sh <patch|minor|major|X.Y.Z> [--branch <name>] [--pr]" >&2
}

bump=""
branch_override=""
open_pr=false
while [ $# -gt 0 ]; do
  case "$1" in
    --branch) branch_override="${2:-}"; shift 2 ;;
    --pr) open_pr=true; shift ;;
    -h | --help) usage; exit 0 ;;
    -*) echo "不明なオプション: $1" >&2; usage; exit 1 ;;
    *)
      if [ -z "$bump" ]; then bump="$1"; shift; else
        echo "引数が多い: $1" >&2; usage; exit 1
      fi
      ;;
  esac
done
[ -n "$bump" ] || { usage; exit 1; }

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

if $open_pr && ! command -v gh >/dev/null 2>&1; then
  echo "--pr には gh(GitHub CLI)が要る。入れるか、--pr なしで回して手で PR を出す" >&2
  exit 1
fi

# 未コミットの変更があると、version 書き換えと混ざって切り分けられなくなる
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "作業ツリーに未コミットの変更がある。先に片付ける" >&2
  exit 1
fi

old="$(node -p "require('./packages/spec/package.json').version")"

# version を先に確定させる(ブランチ名 release/spec-v<new> に使うため)。
# package.json と lockfile だけ上げる。ここで失敗したら main を汚さないよう戻す。
restore_version_files() {
  git checkout -- packages/spec/package.json package-lock.json 2>/dev/null || true
}
trap 'restore_version_files' ERR
npm version "$bump" --workspace @model-checking/spec --no-git-tag-version >/dev/null
new="$(node -p "require('./packages/spec/package.json').version")"

if [ "$old" = "$new" ]; then
  echo "version が変わらなかった($old)。指定を確認する" >&2
  restore_version_files
  exit 1
fi
echo "==> $old -> $new"

# ブランチを用意する。リリースも PR 経由なので main では直接コミットしない。
#   --branch 指定あり     -> その名前で切る
#   指定なしで main にいる -> release/spec-v<new> を切る(ブランチ作成も自動化)
#   既に作業ブランチにいる -> そこをそのまま使う
# git switch -c は working tree の変更ごと新ブランチへ移すので、上の version
# 変更は main に残らない。
current="$(git rev-parse --abbrev-ref HEAD)"
branch="$current"
if [ -n "$branch_override" ]; then
  branch="$branch_override"
  git switch -c "$branch"
elif [ "$current" = "main" ]; then
  branch="release/spec-v$new"
  git switch -c "$branch"
fi
trap - ERR # ここまで来れば main の working tree はもう汚れていない

# バージョンが埋め込まれている箇所を追随させる。
# 雛形の依存URL(実害あり)と、ドキュメント中の例(表示の一貫性)。
# ここを増減させたら post-check の期待値も見直すこと。
files=(
  templates/spec-starter/package.json
  templates/spec-starter/README.md
  docs/spec-package.md
)
old_re="${old//./\\.}" # sed 正規表現で version のドットが任意文字にならないよう固定する
for f in "${files[@]}"; do
  sed -i \
    -e "s#spec-v${old_re}#spec-v${new}#g" \
    -e "s#model-checking-spec-${old_re}\.tgz#model-checking-spec-${new}.tgz#g" \
    "$f"
done

# post-check: 書き換え漏れ(古い version が残っている)を必ず捕まえる。
# これがこのスクリプトの存在意義なので、静かに素通りさせない。
if leftovers="$(grep -rn "spec-v${old_re}\|model-checking-spec-${old_re}\.tgz" "${files[@]}" 2>/dev/null)"; then
  echo "古いバージョン($old)が残っている。書き換えに失敗した:" >&2
  echo "$leftovers" >&2
  exit 1
fi
# 依存URL(実害のある箇所)が新 version を指しているかを念のため確かめる
if ! grep -q "spec-v${new}/model-checking-spec-${new}\.tgz" templates/spec-starter/package.json; then
  echo "雛形の依存URLが spec-v${new} を指していない。中身を確認する" >&2
  exit 1
fi

git add packages/spec/package.json package-lock.json "${files[@]}"
git commit -q -m "@model-checking/spec を $new にリリース"
echo "==> コミットを作った(ブランチ: $branch)"

if $open_pr; then
  git push -u origin "$branch"
  gh pr create --fill
  echo
  echo "==> PR を出した。マージすると release-on-merge.yml が spec-v$new を切り、"
  echo "    release.yml が Release と tarball を作る。マージ後の手作業は要らない。"
else
  cat <<EOF

==> この先の手順:
    git push -u origin $branch
    gh pr create --fill
  マージすると release-on-merge.yml が spec-v$new を切り、release.yml が
  Release と tarball を作る。マージ後の手作業は要らない。
  (このスクリプトに --pr を付ければ push と PR 作成もやる)
EOF
fi
