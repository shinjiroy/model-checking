# DSLの配布と型チェック

[設計方針](design-goals.md)の「型チェックはDSLをパッケージ配布して手元のエディタ・CIに寄せる」の実装。

## なぜエディタ・CIに寄せるのか

SPAは仕様をesbuild-wasmで**トランスパイル**するだけで、型チェックはしない。型情報を捨てて速く回すのがブラウザ側の役割で、型の誤りは検査結果にも反例にも現れない。

そのため型チェックは、利用者が既に持っている場所 — エディタとCI — が担う。仕様がTypeScriptである利点(既存のエディタ・型チェック・レビューフローがそのまま使える)は、DSLが普通のパッケージとして `import` できて初めて成立する。

## 配布物

[packages/spec/](../packages/spec/) を `@model-checking/spec` として配布する。npmレジストリには公開せず、tarballをGitHub Releaseに添付する形を取る(→[リリース手順](#リリース手順))。`tsc` で `dist/` にJSと `.d.ts`(宣言マップ・ソースマップ付き)を出す。宣言マップの飛び先になる `src/`(ベンチ用モデルを除く)も同梱するので、利用者のエディタで「定義へ移動」するとDSLのソースに飛べる。

```bash
npm run build -w @model-checking/spec
```

### 開発時はソース、配布時はdist

`packages/spec/package.json` の `exports` にカスタム条件 `@model-checking/source` を置いている。

```json
"exports": {
  ".": {
    "@model-checking/source": "./src/index.ts",
    "types": "./dist/index.d.ts",
    "default": "./dist/index.js"
  }
}
```

モノレポ内(vite / vitest の `resolve.conditions`、tscの `customConditions`)だけがこの条件を有効にする。**モノレポの開発ではビルドせずソースを直接参照でき、配布物を使う利用者には `dist` が解決される。**

`publishConfig` で `exports` を差し替える案は採らなかった。`npm pack` の生成物に反映されず、配布物が存在しない `src` を指したまま壊れることを実際に固めて確認したため。条件付きexportsなら配布する `package.json` そのものが正しい形になる。

条件を足す場所は次の3つで、いずれかが漏れると `Failed to resolve entry for package "@model-checking/spec"` になる。

| 場所 | 設定 |
| --- | --- |
| [apps/web/vite.config.ts](../apps/web/vite.config.ts) | `resolve.conditions` と `ssr.resolve.conditions`(node環境で走るテストのため両方) |
| [packages/spec/vitest.config.ts](../packages/spec/vitest.config.ts) | 同上。テストが `examples/*.ts` 経由でパッケージ名を解決するため |
| 各 `tsconfig.json` | `customConditions`(`moduleResolution: bundler` が前提) |

### 配布物の検証

ワークスペースのシンボリックリンク越しでは、`exports` の解決も `files` の過不足も検証できない(`src` が手元にあるので壊れていても動いてしまう)。[scripts/verify-package.sh](../scripts/verify-package.sh) が `npm pack` で固めた tarball を雛形にインストールし、利用者と同じ経路で型チェックと検査を通す。

このスクリプトは**手元で固めたtarballを直接インストールする**ので、雛形が宣言しているReleaseのURLそのものは経路に入らない。検証できるのは配布物の中身(exportsの解決・filesの過不足・型)であって、URLが生きているかではない。

```bash
npm run verify:package
```

CI([ci.yml](../.github/workflows/ci.yml))とリリース([release.yml](../.github/workflows/release.yml))の両方で走る。

## 3つの利用方式

仕様を検査する経路は3つある。用途で使い分ける。

| 方式 | クローン | 毎回ダウンロード | バージョン固定 | 用途 |
| --- | --- | --- | --- | --- |
| `npx --package=<tarball URL> -c "model-checking check specs/"` | 不要 | する | × | 試用 |
| ローカルインストール(`npm i -D <tarball URL>`、[spec-starter](../templates/spec-starter/) のコピーが最短) | 不要 | しない | ○ | 常用・CI |
| リポジトリのクローン | 必要 | — | — | ツール自体の開発時のみ |

**常用でもクローンは要らない。** 雛形をコピーして tarball を依存に入れれば、`node_modules/.bin/model-checking` が置かれる。ツール本体のソースが手元に要るのはこのツール自体を直す時だけである。

> 企業内ネットワークでは、GitHub Releases のダウンロードが `objects.githubusercontent.com` へリダイレクトされる。`github.com` だけをプロキシで許可している環境ではこのホストが遮断され、tarball の取得に失敗することがある。その場合はプロキシ設定で `objects.githubusercontent.com` を許可する。

## コマンドで検査する(CLI)

`@model-checking/spec` は `model-checking` という CLI(`bin`)を持つ。ブラウザを開かず、テストも書かずに、手元で仕様をそのまま検査する用途に使う。

```bash
npx model-checking check specs/                        # ディレクトリ配下の仕様をすべて検査
npx model-checking check specs/order.ts --max-states 500000
```

- ディレクトリを渡すと配下の `.ts` を再帰的に検査する(`*.test.ts` / `*.spec.ts` / `*.d.ts` は除外)。
- `defineSpec`(状態機械)と `defineModel`(データモデル・権限)の両方を対象にする。ファイルが `export` した仕様・モデルを自動で拾う。
- 違反(不変条件・デッドロック・assertionの破れ)を検出すると**非ゼロ終了**する。CI でそのまま落とせる。
- 反例はターミナルに整形出力する(Web UI のタイムラインをテキストで再現)。

```text
$ npx model-checking check specs/
specs/withdraw.ts
  ✗ withdrawSpec  不変条件 balanceNeverNegative を破った(9 状態を探索)
  反例トレース(最短 4 ステップ):
     0  (初期状態)
        {"balance":100,...}
     1  checkA [処理A]
        ...
     4  withdrawB [処理B]
        {"balance":-20,...}
```

### クローンせずに呼ぶ

上の例はインストール済みを前提にしている。クローンしない基本の2方式は次のとおり(URLのバージョンは `deploy.sh` がリリースごとに書き換える)。

```bash
# 常用・CI: ローカルインストール(バージョン固定、都度ダウンロードしない)
npm i -D "https://github.com/shinjiroy/model-checking/releases/download/spec-v0.1.1/model-checking-spec-0.1.1.tgz"
npx model-checking check specs/

# 試用: インストールせず都度ダウンロード
npx --package="https://github.com/shinjiroy/model-checking/releases/download/spec-v0.1.1/model-checking-spec-0.1.1.tgz" \
  -c "model-checking check specs/"
```

試用形の `-c "..."` は省略できない。`npx --package=<URL> model-checking ...` と直接続けると、npx はパッケージ名からコマンド名(`bin`)を推測しようとし、パッケージ名(`@model-checking/spec`)と bin 名(`model-checking`)が一致しないため「could not determine executable to run」で失敗する。`-c` で「このパッケージを入れた文脈でこのコマンドを実行する」と明示する。

**vitest 経由の `npm run check` は置き換えず併存させる。** CLI は「テストを書かずに手元で素早く回す」用途、vitest(`check()` を呼ぶテスト)は「CIで設計の退行を止める」用途と位置づける。

### `@model-checking/spec` の import 自己解決

利用者の仕様ファイルは `import { defineSpec } from "@model-checking/spec"` を含む。`npx --package=<tarball URL>` で一時ディレクトリに展開された状態だと、仕様ファイルの隣に `node_modules` がなく、このimportをNodeが解決できない。

そこで CLI は仕様ファイルをロードする際、esbuild で `@model-checking/spec` を **CLI 自身のモジュール**(`dist/index.js`)へ alias し、バンドルにインライン展開してから読み込む([packages/spec/src/cli/loadSpecs.ts](../packages/spec/src/cli/loadSpecs.ts))。Webアプリが [apps/web/src/core/bundle.ts](../apps/web/src/core/bundle.ts) で esbuild-wasm を使って行っているのと同じ発想を Node 側で行う。TypeScript のトランスパイルも同じ esbuild が担うため、追加のトランスパイル手段は要らない。

## リリース手順

[scripts/deploy.sh](../scripts/deploy.sh) を回して出てきた PR をマージするだけでよい。main で回せばリリース用ブランチも自動で切る。

```bash
# main で回すと release/spec-v0.1.1 を切り、コミットして PR まで出す
./scripts/deploy.sh patch --pr
```

`--pr` を外せばコミットまでで止まり、push と PR は手でやる。引数だけで完結するので、この手順はエージェントに丸ごと任せられる。マージだけは人間の操作に残してある(マージがリリースの発火点になる)。

```bash
./scripts/deploy.sh patch    # コミットまで。この先の push / PR コマンドは実行後に表示される
```

`deploy.sh` は `packages/spec` の version を上げ、それに追随して**バージョンが埋め込まれている箇所を全部書き換える**。配布URLにはバージョンが入る([→後述](#なぜnpmレジストリに公開しないのか))ので、version だけ上げてURLを書き換え忘れると、新しい Release はできても雛形が古い版を指したままになる。この書き換え漏れをスクリプトの post-check で潰す。

| 追随させる箇所 | 理由 |
| --- | --- |
| [templates/spec-starter/package.json](../templates/spec-starter/package.json) | 利用者が入れる依存URL(実害あり) |
| [templates/spec-starter/README.md](../templates/spec-starter/README.md) / この文書 | 例として載せているURL(表示の一貫性) |

`release/*` ブランチの PR が main にマージされると [release-on-merge.yml](../.github/workflows/release-on-merge.yml) が動き、`packages/spec/package.json` の version から `spec-v<version>` タグを未作成なら自動で切る。続けて [release.yml](../.github/workflows/release.yml) を `workflow_call` で呼び、タグとversionの一致確認・テスト・型チェック・配布物の検証を通してから、tarballをGitHub Releaseに添付する。追加のSecretは要らない(`github.token` で足りる)。**マージ後の手作業は要らない。**

タグを手で切って push する(`spec-v*` タグの push)経路も残してあり、その場合も同じ release.yml が走る。

### なぜリリースを自動化するのか

配布URLにはバージョンが入る([→後述](#なぜnpmレジストリに公開しないのか))。version を上げても対応する Release を作り忘れると、雛形が宣言するURLが 404 を返して利用者の `npm install` が丸ごと落ちる(issue #39)。「version を上げる」と「Release を作る」を別々の人手に分けている限りこの齟齬は起きうるので、リリースを1本のフローに束ねる。

発火は **`release/*` ブランチのマージ** に絞っている。「version が変わった」を条件にすると、依存追加やスクリプト変更など**リリースと無関係な `package.json` の変更でも走りうる**。リリース用ブランチ(`deploy.sh` が切る `release/spec-v<version>`)のマージだけを条件にすることで、リリース意図をブランチ名で明示できる。

> `GITHUB_TOKEN` で push したタグは release.yml の `push: tags` トリガーを発火しない(ワークフローの無限ループを防ぐGitHubの仕様)。そのため release-on-merge.yml は release.yml を `workflow_call` で明示的に呼ぶ。PAT を持ち込まずに済む。

### なぜnpmレジストリに公開しないのか

このツールは限られた範囲で使う前提で、npmレジストリに載せる必要がない。一方でレジストリ公開には、スコープの取得・`NPM_TOKEN` の管理・一度publishしたバージョンを実質取り消せないという運用が付いてくる。

代わりにGitHub Releaseへtarballを添付し、利用者はそのURLを依存に書く。

```json
"dependencies": {
  "@model-checking/spec": "https://github.com/shinjiroy/model-checking/releases/download/spec-v0.1.1/model-checking-spec-0.1.1.tgz"
}
```

URLにバージョンが入るので、参照先は自動では動かない。上げるときは依存のURLを書き換える。

`packages/spec/package.json` には `private: true` を付けてあり、誤って `npm publish` しても弾かれる(`npm pack` は通るのでリリースには影響しない)。

**git依存では代替できない。** npmはgit依存のサブディレクトリ指定に対応しないため、`github:shinjiroy/model-checking` 形式でモノレポの `packages/spec` だけを入れることはできない。

## 利用者側の型チェックフロー

[templates/spec-starter/](../templates/spec-starter/) をコピーして使う。

```bash
cp -r templates/spec-starter my-design && cd my-design
npm install
npm run typecheck   # 型チェック
npm run check       # 検査(反例が出たら落ちる)
```

雛形の `tsconfig.json` は2点を効かせている。

- `moduleResolution: "bundler"` — 拡張子なしの相対importが書ける。ブラウザ側の検査(esbuild-wasm)も同じ解決規則なので、エディタで通った仕様はSPAでもそのまま読める
- `noUncheckedIndexedAccess: true` — 仕様では `s.queue[0]` のような添字アクセスが頻出し、空配列のときの取りこぼしがそのままモデルの誤りになる

検査自体は vitest から `check()` を呼ぶテストとして書く([specs/withdraw.check.test.ts](../templates/spec-starter/specs/withdraw.check.test.ts))。反例が出たらテストが落ち、トレースがログに出る。設計の退行がCIで止まる形になる。

エディタは追加設定を要らない。`node_modules` の型定義をそのまま読むので、`defineSpec<State>` に渡した状態型が `when` / `then` の引数に伝播し、存在しないフィールドの参照はその場で赤くなる。
