# 状態探索の性能ベンチマーク

`packages/spec/src/checker.ts`の`check`(BFS明示的状態探索)は、訪問済み状態の重複排除に
`new Set<string>()`と正規化JSON文字列(`canonicalKey`)を使っている。GOAL.mdの方針では、この
表現をより省メモリ・高速な64bitフィンガープリント+TypedArrayに置き換えるM3は「性能が問題になってから
着手する」保留事項になっている。本書は、M3に着手するかどうかの判断材料および着手後の効果測定の基準となる、
現状(JSON文字列Set)のベースライン数値を記録する。

## ベンチマーク用モデル: スケールモデル

[packages/spec/src/bench/scaleModel.ts](../packages/spec/src/bench/scaleModel.ts)の`createScaleModel`は、
到達状態数を厳密に制御できる負荷生成専用モデルを組み立てる。状態は`dimensions`本のカウンタからなるベクトルで、
各カウンタは`0`から`base - 1`まで単調増加する。唯一のアクション`inc`が「まだ上限に達していない次元」を
非決定的パラメータとして選び、その次元を1つ進める。カウンタの増分は可換なので、到達順によらず同じ状態は
1つに正規化・重複排除され、到達状態数は正確に`base ** dimensions`になる。

このモデルは実際の業務仕様(注文・決済・権限など)を模したものではなく、探索器(BFS・visited集合・
onProgress)の性能特性のみを測定するためのものである。到達状態数が理論値と厳密に一致することは
[packages/spec/tests/scaleModel.test.ts](../packages/spec/tests/scaleModel.test.ts)で小さいパラメータ
(base=2〜4, dimensions=1〜3)について検証している。

## 測定項目

[packages/spec/src/bench/harness.ts](../packages/spec/src/bench/harness.ts)の`runScaleBenchmark`が
以下を計測する。`checkFn`引数で探索関数を差し替え可能にしてあるため、将来M3の実装が入った際も同じハーネスで
新旧の数値を比較できる。

| 項目 | 内容 |
| --- | --- |
| `statesExplored` / `complete` | 探索済み状態数と、maxStatesで打ち切られずに完走したか |
| `elapsedMs` | 探索に要した時間 |
| `statesPerSec` | `statesExplored / (elapsedMs / 1000)`。探索スループット |
| `heapUsedDeltaBytes` | 探索前後の`process.memoryUsage().heapUsed`の差分。visited集合が保持する正規化JSON文字列の概算メモリ使用量(GCタイミング依存の目安値) |
| `progressCallCount` / `progressIntervalMs` | `onProgress`(1024状態ごとに同期呼び出し)の発火回数と、連続呼び出し間の経過時間(min/avg/max)。長時間探索中にメインスレッドがどれだけの間隔でしか制御を返せないかの代理指標 |

## 実行方法

```bash
# ワークスペース経由(推奨)
npm run bench -w @model-checking/spec

# ルートスクリプト経由
npm run bench

# 10^6規模も追加で実行する(数十秒程度かかる。既定では実行されない)
npm run bench -w @model-checking/spec -- --large
```

内部では[packages/spec/bench/scaleBenchmark.ts](../packages/spec/bench/scaleBenchmark.ts)を
`vite-node`(このリポジトリがvitestで既に使っているTypeScript実行系)で実行している。Docker環境では
`docker compose run --rm spec npm run bench -w @model-checking/spec`のように、既存のnpm/Dockerの
実行慣行に沿って呼び出せる。

既定では以下の3つを1回の実行でまとめて計測する。

1. 10^5規模(base=10, dimensions=5)を打ち切りなしで完走
2. 同じモデルを`maxStates=1,000`で打ち切るデモ(`complete: false`になることを確認)
3. (`--large`指定時のみ)10^6規模(base=10, dimensions=6)を打ち切りなしで完走

## ベースライン数値(現状: JSON文字列Set)

以下は、Node.js v24.12.0、開発機(WSL2上のLinux)で`npm run bench -w @model-checking/spec -- --large`を
実行して得た実測値。マシン・負荷状況により変動するため、絶対値そのものよりも「M3実装後にどれだけ改善したか」
という相対比較の基準として扱う。

| 規模 | base / dimensions | 理論状態数 | 探索済み状態数 | complete | 経過時間 | states/sec | heapUsed増分(目安) | onProgress発火回数 | onProgress間隔(ms) min/avg/max |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 10^5 | 10 / 5 | 100,000 | 100,000 | true | 818 ms | 約122,000 | 約63 MB | 97 | 4.9 / 8.4 / 18.1 |
| maxStates打ち切り | 10 / 5 (maxStates=1,000) | 100,000 | 1,000 | false | 7 ms | 約140,000 | 約8 MB | 0 | 計測なし(発火1回以下) |
| 10^6(任意実行) | 10 / 6 | 1,000,000 | 1,000,000 | true | 9,894 ms | 約101,000 | 約410 MB | 976 | 5.3 / 10.1 / 71.9 |

観測できる傾向:

- states/secは10^5→10^6でおおよそ横ばい(12万→10万程度)。定常的なスループットが得られている規模であり、
  崖(コスト曲線が急変する領域)を踏んでいない。
- heapUsed増分は状態数にほぼ比例して増加する(10^5で約63MB→10^6で約410MB)。1状態あたり数百バイトが
  正規化JSON文字列とSetのオーバーヘッドに費やされている計算になり、TypedArray化による削減余地の目安になる。
- `maxStates`による打ち切りは、指定した状態数(1,000)ちょうどで`complete: false`として即座に返る。
  長時間探索を安全に止められることを確認できる。
- `onProgress`の発火間隔は10^5で平均8.4ms、10^6で平均10.1msとおおむね安定しているが、maxが最大72ms程度まで
  伸びるタイミングがある(GCなど他の処理と重なった箇所と推測される)。UIスレッドをブロックする時間の目安として、
  M3実装後にこの間隔が縮まるか・ばらつきが減るかを比較できる。

## M3実装後の比較方法

M3(64bitフィンガープリント+TypedArray化・Worker分割)を実装する際は、`runScaleBenchmark`の`checkFn`引数に
新しい探索実装を渡し、同じ`scaleModel`・同じパラメータ(base=10, dimensions=5および6)で計測すれば、上表と
直接比較できる。比較対象は主に`statesPerSec`(スループットの改善)と`heapUsedDeltaBytes`(1状態あたりの
メモリ削減)の2点。
