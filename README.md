# モデル検査アプリ

Webサービス開発チームの一般的な開発者が、形式手法の事前知識なしに、設計上の欠陥を実装前に発見できるブラウザ完結型の検証ツール。仕様はTypeScriptで書き、検査(BFSによる状態空間探索)はブラウザ内のWeb Workerで完結する。ゴール定義・技術方針は [GOAL.md](GOAL.md) を参照。

## 構成

npmワークスペースのモノレポ。

| パス | 内容 |
| --- | --- |
| [packages/spec/](packages/spec/) | 仕様記述DSL(`defineSpec`)+BFS検査器(`check`)、データモデル検証DSL(`defineModel`)+小スコープ列挙(`checkModel`)。ブラウザ非依存 |
| [apps/web/](apps/web/) | SPA。仕様ファイルをesbuild-wasmでブラウザ内バンドルし、Worker上で検査、反例をactorレーンのタイムライン+状態diff(状態機械)またはインスタンスの表(データモデル)で可視化 |
| [examples/](examples/) | デモ仕様兼回帰テスト(order-payment、payment-retry、doc-permission、conduit-favorite-count、conduit-comment-delete) |
| [docs/](docs/) | DSL・トレース形式・可視化の設計判断 |

## 使い方(SPA)

```bash
docker compose up -d web    # http://localhost:5173
# または
npm install && npm run -w @model-checking/web dev
```

1. 仕様ファイル(.ts)をドラッグ&ドロップするか、ワンクリックデモ(payment-retry / order-payment / doc-permission / conduit-favorite-count / conduit-comment-delete)を読み込む
2. 「解析する」→「検査する」。検査中は探索済み状態数が表示され、キャンセルできる
3. 状態機械(`defineSpec`)で不変条件違反・デッドロックが見つかると、反例トレースをactorレーンのタイムラインで表示。ステップを選ぶと直前状態との差分が見える。データモデル(`defineModel`)でassertionの破れが見つかると、反例インスタンス(ソートの原子と関係のタプル)を表で表示
4. 「共有URLを作成」で仕様ソース全体を圧縮してURLフラグメントに埋め込み、レビューで共有できる(サーバーへは送信されない)
5. Chrome/Edge系では「フォルダを開いて監視」で保存→自動再検査のウォッチモードが使える(他ブラウザはドラッグ&ドロップ)。ウォッチモードの手動動作確認手順は [docs/watch-mode-verification.md](docs/watch-mode-verification.md) を参照

仕様の書き方は [docs/dsl-sketch.md](docs/dsl-sketch.md)(状態機械)、[docs/datamodel-sketch.md](docs/datamodel-sketch.md)(データモデル・権限)と [examples/](examples/) を参照。

## 開発

```bash
npm install
npm test            # 全ワークスペースのテスト(vitest)
npm run typecheck   # 全ワークスペースの型チェック
```

Dockerでも同じことができる:

```bash
docker compose run --rm test
docker compose run --rm typecheck
```

検査器のトレース形式(`CheckResult`/`TraceStep`)は可視化との契約であり、変更時は [docs/dsl-sketch.md](docs/dsl-sketch.md) と [docs/trace-visualization.md](docs/trace-visualization.md) を同時に更新すること。
