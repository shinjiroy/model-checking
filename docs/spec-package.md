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

PR が main にマージされ、`packages/spec/package.json` の version 変更が入ると [tag-on-version.yml](../.github/workflows/tag-on-version.yml) が動き、`spec-v<version>` タグが未作成なら自動で切る。続けて [release.yml](../.github/workflows/release.yml) を `workflow_call` で呼び、タグとversionの一致確認・テスト・型チェック・配布物の検証を通してから、tarballをGitHub Releaseに添付する。追加のSecretは要らない(`github.token` で足りる)。**マージ後の手作業は要らない。**

タグを手で切って push する(`spec-v*` タグの push)経路も残してあり、その場合も同じ release.yml が走る。

### なぜタグ作成を自動化するのか

配布URLにはバージョンが入る([→後述](#なぜnpmレジストリに公開しないのか))。version を上げても対応する Release を作り忘れると、雛形が宣言するURLが 404 を返して利用者の `npm install` が丸ごと落ちる(issue #39)。「version を上げる」と「Release を作る」を別々の人手に分けている限りこの齟齬は起きうるので、version の変更を唯一のトリガーにして両者を1本のフローに束ねる。

> `GITHUB_TOKEN` で push したタグは release.yml の `push: tags` トリガーを発火しない(ワークフローの無限ループを防ぐGitHubの仕様)。そのため tag-on-version.yml は release.yml を `workflow_call` で明示的に呼ぶ。PAT を持ち込まずに済む。

### なぜnpmレジストリに公開しないのか

このツールは限られた範囲で使う前提で、npmレジストリに載せる必要がない。一方でレジストリ公開には、スコープの取得・`NPM_TOKEN` の管理・一度publishしたバージョンを実質取り消せないという運用が付いてくる。

代わりにGitHub Releaseへtarballを添付し、利用者はそのURLを依存に書く。

```json
"dependencies": {
  "@model-checking/spec": "https://github.com/shinjiroy/model-checking/releases/download/spec-v0.1.0/model-checking-spec-0.1.0.tgz"
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
