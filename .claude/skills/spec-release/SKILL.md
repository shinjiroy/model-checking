---
name: spec-release
description: >-
  @model-checking/spec をリリースする。前回リリース(spec-v* タグ)からの変更を見て
  semver の bump(patch/minor/major)を自分で判断し、scripts/deploy.sh を回して
  リリース用の PR を作るところまでをエージェントに任せる。ユーザーが「リリースして」
  「バージョンを上げて」「新しい版を出して」「publish して」と言ったら使う。
---

# @model-checking/spec のリリース

前回リリースからの変更内容から **bump を自分で決めて** [scripts/deploy.sh](../../../scripts/deploy.sh) を回す。
`deploy.sh` はブランチ作成・version 上げ・URL 書き換え・コミット・(--pr で)PR 作成まで受け持つので、
このスキルの仕事は **「patch / minor / major のどれか」を根拠つきで決めること** に尽きる。

## 手順

1. **前回リリースを特定する**

   ```bash
   git tag -l 'spec-v*' | sort -V | tail -1   # 例: spec-v0.1.0
   ```

   タグが1つも無ければ、これが初回リリース。`0.1.0` のままで良いか(既に package.json が 0.1.0)、
   ユーザーに確認する。

2. **その版からの変更を集める**

   公開 API は [packages/spec/src/index.ts](../../../packages/spec/src/index.ts) の再エクスポート群。
   bump 判断の主材料はここの差分と、エクスポートされた型・関数のシグネチャの差分。

   ```bash
   base="$(git tag -l 'spec-v*' | sort -V | tail -1)"
   git diff "$base"..HEAD -- packages/spec/src/index.ts   # 公開面の増減・改名
   git diff "$base"..HEAD -- packages/spec/src            # 挙動の変化まで見る
   git log  "$base"..HEAD --oneline -- packages/spec      # コミットの意図
   ```

3. **bump を決める**(下の方針に従う)。判断に迷ったら、安全側=大きい方の bump を選ぶ。

4. **回す**

   ```bash
   ./scripts/deploy.sh <patch|minor|major> --pr
   ```

   `gh` が無い/PR をまだ出したくないなら `--pr` を外す(コミットまでで止まり、続きのコマンドが表示される)。

5. **選んだ bump とその根拠を報告する**。PR 本文にも「なぜこの bump か(どの公開 API がどう変わったか)」を書く。
   マージは人間が行う(マージがリリースの発火点)。**このスキルはマージまではしない。**

## bump の方針(pre-1.0)

現在は `0.y.z`。1.0 未満では公開 API が安定していないので、通常の semver とは扱いを変える。

| bump | 選ぶ条件 |
| --- | --- |
| **major** | `0.x` の間は選ばない。`1.0.0` にするのは「安定版を出す」という宣言なので、ユーザーが明示したときだけ。 |
| **minor** | 公開 API を **壊す** 変更。エクスポートの削除・改名、エクスポートされた型/関数のシグネチャ変更、DSL やチェッカの観測可能な挙動が既存の仕様を壊す形で変わった、など。(0.1.0 → 0.2.0) |
| **patch** | 後方互換な追加(新しいエクスポート)と、修正・内部変更・ドキュメントのみ。既存の利用者の仕様がそのまま通るなら patch。(0.1.0 → 0.1.1) |

「壊す変更」の見分けは公開面で判断する: `src/index.ts` が export している名前が消えた/変わった、
またはその型シグネチャが変わったら minor。名前が増えただけ・中身の修正だけなら patch。

## 注意

- `deploy.sh` が version に追随して書き換える URL(雛形の依存 URL 等)は自動なので、手で書き換えない。
- リリースの発火(タグ作成・GitHub Release)はマージ後に自動化されている。仕組みは
  [docs/spec-package.md](../../../docs/spec-package.md) を参照。
