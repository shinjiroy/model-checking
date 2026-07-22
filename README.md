# モデル検査アプリ

設計上の欠陥を、実装する前に見つけるためのブラウザ完結型の検証ツール。仕様はTypeScriptで書き、検査(状態空間の探索)はブラウザ内のWeb Workerで完結する。形式手法の事前知識は要らない。

人間のレビューが苦手なのは「ありうる順序の総当たり」にあたる。テストは書いた順序しか試さないが、検査器は書かなかった順序を試す。

## 何が見つかるか

たとえば、残高100の口座に60を引き出す処理が2つ同時に走る設計を書くと、次の反例が返る。

```text
checkA      処理Aが残高を確認する         balance: 100  → 引き落として良い
checkB      処理Bも残高を確認する         balance: 100  → 引き落として良い
withdrawA   処理Aが引き落とす             balance: 40
withdrawB   処理Bが引き落とす             balance: -20  ← 不変条件 balanceNeverNegative 違反
```

「確認した時点の残高が、引き落とす時点でも同じだと思い込んでいる」というバグになる。検査器は各状態で発火できるアクションを全部試すので、この順序を人が思いつく必要はない。返る反例は常に最短の手順になる(幅優先探索のため)。

同梱のデモには、リトライによる二重課金、キャンセルとWebhookの競合、権限モデルの抜け漏れなどが入っている。

## 使ってみる

```bash
docker compose up -d web    # http://localhost:5173
# または
npm install && npm run -w @model-checking/web dev
```

1. 仕様ファイル(.ts)をドラッグ&ドロップするか、ワンクリックデモを読み込む
2. 「解析する」→「検査する」。検査中は探索済み状態数が表示され、キャンセルできる
3. 状態機械(`defineSpec`)で不変条件違反・デッドロックが見つかると、反例トレースをactorレーンのタイムラインで表示する。ステップを選ぶと直前状態との差分が見える。データモデル(`defineModel`)でassertionの破れが見つかると、反例インスタンスを表で表示する
4. 「共有URLを作成」で仕様ソース全体を圧縮してURLフラグメントに埋め込み、レビューで共有できる(サーバーへは送信されない)
5. Chrome/Edge系では「フォルダを開いて監視」で保存→自動再検査のウォッチモードが使える(他ブラウザはドラッグ&ドロップ)

はじめてなら [チュートリアル](docs/tutorial.md) から読む(最初の1仕様を書いて検査するまで、およそ40分)。

## 自分のリポジトリで検査する

DSLは `@model-checking/spec` として配布する(GitHub Releaseに添付したtarball)。ブラウザ側はトランスパイルのみで型を見ないため、型チェックは手元のエディタとCIが担当する。クローンは要らない。

```bash
cp -r templates/spec-starter my-design && cd my-design
npm install && npm run typecheck && npm run check
```

検査をvitestのテストとして書くので、設計の退行がCIで止まる。

テストを書かずに手元で素早く回したいときは、同梱の CLI を使う。違反を検出すると非ゼロ終了するので、これもCIで落とせる。クローンは要らず、Releaseのtarballを指すだけでよい(`<version>` は [Releases](https://github.com/shinjiroy/model-checking/releases) の最新版に読み替える)。

```bash
# 常用・CI: ローカルインストール(バージョン固定)
npm i -D "https://github.com/shinjiroy/model-checking/releases/download/spec-v<version>/model-checking-spec-<version>.tgz"
npx model-checking check specs/                    # ディレクトリ配下の仕様をすべて検査
npx model-checking check specs/order.ts --max-states 500000

# 試用: インストールせず都度ダウンロード(-c は必須。省くと npx がコマンド名を推測できず失敗する)
npx --package="https://github.com/shinjiroy/model-checking/releases/download/spec-v<version>/model-checking-spec-<version>.tgz" \
  -c "model-checking check specs/"
```

3つ目の「クローンして使う」はツール自体を開発するときだけ。3方式の違いは [spec-package.md](docs/spec-package.md#3つの利用方式) を参照。

## ドキュメント

### 使う

| | |
| --- | --- |
| [tutorial.md](docs/tutorial.md) | 最初の1仕様を書いて検査するまで |
| [dsl-sketch.md](docs/dsl-sketch.md) | 状態機械DSLのAPIとトレース形式 |
| [datamodel-sketch.md](docs/datamodel-sketch.md) | データモデル・権限のDSLと小スコープ列挙 |
| [spec-package.md](docs/spec-package.md) | 配布物の構成、リリース手順、型チェックフロー |

### 設計を知る

| | |
| --- | --- |
| [design-goals.md](docs/design-goals.md) | ゴール・非ゴール・技術方針・採らなかった選択肢 |
| [trace-visualization.md](docs/trace-visualization.md) | 反例の可視化の設計 |
| [deployment.md](docs/deployment.md) | 静的配信の構成と、仕様を外部に送らないことの担保 |
| [z3-engine-evaluation.md](docs/z3-engine-evaluation.md) | Z3エンジンを現時点で実装しない判断とその根拠 |
| [scale-benchmark.md](docs/scale-benchmark.md) | 状態数と探索性能の測定 |

### 検証記録

| | |
| --- | --- |
| [realworld-conduit-verification.md](docs/realworld-conduit-verification.md) | 実在の設計(RealWorld/Conduit)をモデル化した記録 |
| [onboarding-verification.md](docs/onboarding-verification.md) | 未経験者が検査を回せるかのユーザーテスト手順 |
| [watch-mode-verification.md](docs/watch-mode-verification.md) | ウォッチモードの手動動作確認手順 |
| [directory-permission-verification.md](docs/directory-permission-verification.md) | ディレクトリ選択のエラー実機確認 |

## 構成

npmワークスペースのモノレポ。

| パス | 内容 |
| --- | --- |
| [packages/spec/](packages/spec/) | 仕様記述DSL(`defineSpec`)+BFS検査器(`check`)、データモデル検証DSL(`defineModel`)+小スコープ列挙(`checkModel`)。ブラウザ非依存 |
| [apps/web/](apps/web/) | SPA。仕様ファイルをesbuild-wasmでブラウザ内バンドルし、Worker上で検査、反例を可視化 |
| [examples/](examples/) | デモ仕様兼回帰テスト |
| [templates/spec-starter/](templates/spec-starter/) | 利用者向けの雛形。型チェックと検査をCIで回す |
| [docs/](docs/) | 設計判断と検証記録 |

## 開発

```bash
npm install
npm test            # 全ワークスペースのテスト(vitest)
npm run typecheck   # 全ワークスペースの型チェック
```

Dockerでも同じことができる。

```bash
docker compose run --rm test
docker compose run --rm typecheck
```

mainへのpushで、テスト・型チェックを通してからGitHub Pagesへ自動配信される。

検査器のトレース形式(`CheckResult` / `TraceStep`)は可視化との契約であり、変更時は [dsl-sketch.md](docs/dsl-sketch.md) と [trace-visualization.md](docs/trace-visualization.md) を同時に更新すること。

## ライセンス

[MIT](LICENSE)
