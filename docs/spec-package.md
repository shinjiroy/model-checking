# DSLのnpm配布と型チェック

GOAL.md の技術方針「型チェックはDSLをnpm配布して手元のエディタ・CIに寄せる」の実装。

## なぜエディタ・CIに寄せるのか

SPAは仕様をesbuild-wasmで**トランスパイル**するだけで、型チェックはしない。型情報を捨てて速く回すのがブラウザ側の役割で、型の誤りは検査結果にも反例にも現れない。

そのため型チェックは、利用者が既に持っている場所 — エディタとCI — が担う。仕様がTypeScriptである利点(既存のエディタ・型チェック・レビューフローがそのまま使える)は、DSLがnpmパッケージとして普通に `import` できて初めて成立する。

## 配布物

[packages/spec/](../packages/spec/) を `@model-checking/spec` として配布する。`tsc` で `dist/` にJSと `.d.ts`(宣言マップ・ソースマップ付き)を出す。宣言マップがあるので、利用者のエディタで「定義へ移動」するとDSLのソースに飛べる。

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

この形にした理由は、`publishConfig` による `exports` の差し替えが `npm pack` の生成物に反映されず、公開物が `src` を指したまま壊れるため。条件付きexportsなら公開する `package.json` そのものが正しい。

条件を足す場所は次の3つで、いずれかが漏れると `Failed to resolve entry for package "@model-checking/spec"` になる。

| 場所 | 設定 |
| --- | --- |
| [apps/web/vite.config.ts](../apps/web/vite.config.ts) | `resolve.conditions` と `ssr.resolve.conditions`(node環境で走るテストのため両方) |
| [packages/spec/vitest.config.ts](../packages/spec/vitest.config.ts) | 同上。テストが `examples/*.ts` 経由でパッケージ名を解決するため |
| 各 `tsconfig.json` | `customConditions`(`moduleResolution: bundler` が前提) |

### 配布物の検証

ワークスペースのシンボリックリンク越しでは、`exports` の解決も `files` の過不足も検証できない(`src` が手元にあるので壊れていても動いてしまう)。[scripts/verify-package.sh](../scripts/verify-package.sh) が `npm pack` で固めた tarball を雛形にインストールし、利用者と同じ経路で型チェックと検査を通す。

```bash
npm run verify:package
```

CI([ci.yml](../.github/workflows/ci.yml))とリリース([release.yml](../.github/workflows/release.yml))の両方で走る。

## 公開手順

```bash
npm version --workspace @model-checking/spec patch
git push && git push --tags   # spec-v<version> タグ
```

`spec-v*` タグのpushで [release.yml](../.github/workflows/release.yml) が動き、テスト・型チェック・配布物の検証を通してから `npm publish --provenance` する。provenanceにより、公開物がどのコミットのどのワークフローから作られたかがnpm上で辿れる。

リポジトリのSecretに `NPM_TOKEN`(publish権限のあるAutomationトークン)が要る。

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
