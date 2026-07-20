# デプロイ(静的ホスティング)

SPAは静的ファイルだけで動く。仕様のバンドル(esbuild-wasm)も検査(Web Worker)も閲覧者のブラウザ内で完結するため、配信側にアプリケーションサーバーもAPIも要らない。[設計方針](design-goals.md)の「SPA(静的ホスティングのみ)」がそのまま構成になっている。

## 配信の流れ

| ワークフロー | 契機 | すること |
| --- | --- | --- |
| [ci.yml](../.github/workflows/ci.yml) | pull request / main への push | テスト・型チェック・配信と同条件のビルド |
| [deploy.yml](../.github/workflows/deploy.yml) | main への push / 手動実行 | テスト・型チェックを通してからビルドし、GitHub Pages へ配信 |

デプロイジョブもテストと型チェックを通す。CIが通ったことに依存せず配信側で再度確認することで、壊れたものが公開されない。

同時デプロイは `concurrency: pages` で直列化し、進行中の配信はキャンセルしない(14MBのwasmを含むアップロードが途中で切れると不完全な状態が残るため)。

### リポジトリ側の設定

GitHub Pages を **Source: GitHub Actions** にする(Settings → Pages)。ブランチ配信(`gh-pages`)は使わない。

## サブパス配信

プロジェクトサイトは `https://<user>.github.io/<repo>/` のようにサブパス配下に載る。Viteの `base` を環境変数 `BASE_PATH` で差し替えられるようにしてあり、ワークフローでは `actions/configure-pages` が返す `base_path` を渡している。

wasm・Worker・CSS・JSはすべて `?url` かViteのアセット解決を経由して参照しているので、`base` を変えるだけで参照先が追随する。ハードコードした絶対パスはない。

ルート直下に配信する場合(独自ドメイン、ユーザーサイト、Netlify等)は `BASE_PATH` を渡さなければ `/` になる。

### ローカルで配信物を確認する

```bash
BASE_PATH=/model-checking/ docker compose run --rm build
BASE_PATH=/model-checking/ docker compose up preview   # http://localhost:4173/model-checking/
```

Dockerを使わない場合は `BASE_PATH=/model-checking/ npm run -w @model-checking/web build` と `npm run -w @model-checking/web preview`。

## 仕様データを外部に送らないこと

このツールの前提は「仕様は手元から出ない」ことにある。配信形態を変えてもこれが崩れないよう、設計と強制の両面で担保する。

**設計上、送信経路がない**

- 仕様のバンドルは esbuild-wasm で、検査は Web Worker で、いずれもブラウザ内で行う。仕様を送る先のAPIが存在しない
- 共有URLは仕様ソースを圧縮してURLの**フラグメント**(`#` 以降)に載せる。フラグメントはHTTPリクエストに含まれないため、URLを開いてもサーバーには届かない
- 外部CDN・フォント・アナリティクスへの参照を持たない。配信物は `index.html` と `assets/` 配下だけで自己完結する

**ブラウザ側で強制する**

[apps/web/index.html](../apps/web/index.html) の CSP で `connect-src 'self'` を指定し、fetch・XHR・WebSocket・beacon による外部送信と、`form-action 'none'` による外部への送信を塞ぐ。Workerは同一オリジンのスクリプトなのでこのポリシーを継承する。

`script-src` には `'unsafe-eval'` が要る。利用者の仕様を new Function で実行すること自体がこのツールの機能にあたるため外せない。実行されるのは利用者自身のコードだけであり、それが外部へ出られないことを `connect-src` が担保する、という切り分けになっている。

### 確認方法

実ブラウザ(Chromium)でサブパス配信の配信物を読み込み、ワンクリックデモの検査を最後まで回して次を確認する。

1. アセット(js / css / wasm / worker)が `base` 配下から解決され、404が出ない
2. CSP違反のコンソールエラーが出ず、検査が完走して反例が表示される
3. 同一オリジン以外へのネットワークリクエストが発生しない

`BASE_PATH=/model-checking/` でビルドしたものをサブパス配信して確認した結果は次のとおり。

- `tutorial-withdraw` のデモが解析・検査まで完走し、不変条件 `balanceNeverNegative` の反例(4ステップ)が表示された
- コンソールエラーなし
- 同一オリジン以外への通信なし(Workerを起動する `blob:` URLのみで、これはネットワークに出ない)
