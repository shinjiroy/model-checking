#!/usr/bin/env node
/**
 * スケールモデルに対するBFS探索の性能ベンチマークCLI。
 *
 * 既定では10^5状態(base=10, dimensions=5)を探索する。数秒〜十数秒で完了する規模。
 * 10^6状態(base=10, dimensions=6)は`--large`オプションで任意実行する(数十秒〜数分かかりうる)。
 * 加えて、maxStatesによる打ち切り挙動を確認するデモを毎回実行する。
 *
 * 実行方法:
 *   npm run bench -w @model-checking/spec
 *   npm run bench -w @model-checking/spec -- --large
 *
 * 計測結果はdocs/scale-benchmark.mdのベースライン数値の取得元でもある。
 * `runScaleBenchmark`はcheck関数を差し替え可能なので、将来M3(TypedArray化)の
 * 実装が入った際は同じCLIに `checkFn` を切り替える分岐を足すだけで新旧比較ができる。
 */
import { runScaleBenchmark, type ScaleBenchmarkResult } from "../src/bench/harness.js";

function formatBytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function printResult(label: string, result: ScaleBenchmarkResult): void {
  console.log(`\n--- ${label} ---`);
  console.log(`base=${result.base}, dimensions=${result.dimensions}`);
  console.log(`理論状態数: ${result.expectedStates.toLocaleString()}`);
  console.log(
    `探索済み状態数: ${result.statesExplored.toLocaleString()} (complete=${result.complete})`,
  );
  console.log(`経過時間: ${result.elapsedMs.toFixed(1)} ms`);
  console.log(`states/sec: ${Math.round(result.statesPerSec).toLocaleString()}`);
  console.log(`heapUsed増分(目安): ${formatBytes(result.heapUsedDeltaBytes)}`);
  console.log(`onProgress呼び出し回数: ${result.progressCallCount}`);
  if (result.progressIntervalMs) {
    const { min, max, avg } = result.progressIntervalMs;
    console.log(
      `onProgress間隔(ms): min=${min.toFixed(2)} avg=${avg.toFixed(2)} max=${max.toFixed(2)}`,
    );
  } else {
    console.log("onProgress間隔(ms): 発火回数が1回以下のため計測なし");
  }
}

function main(): void {
  const args = process.argv.slice(2);
  const runLarge = args.includes("--large");

  // 1. 基準規模: 10^5状態(base=10, dimensions=5)。maxStatesは理論値を上回るので打ち切らない。
  const baseline = runScaleBenchmark({ base: 10, dimensions: 5 });
  printResult("10^5規模(打ち切りなし)", baseline);

  // 2. maxStates打ち切りのデモ: 同じモデルを小さいmaxStatesで止める。
  const truncated = runScaleBenchmark({ base: 10, dimensions: 5, maxStates: 1_000 });
  printResult("maxStates=1,000での打ち切りデモ", truncated);
  console.log(
    truncated.complete === false && truncated.statesExplored === 1_000
      ? "=> 期待通りcomplete=falseかつ1,000状態で打ち切られた"
      : "=> 想定外の結果(打ち切り挙動を確認してください)",
  );

  // 3. 任意実行: 10^6状態(base=10, dimensions=6)。既定では実行しない(--largeで有効化)。
  if (runLarge) {
    const large = runScaleBenchmark({ base: 10, dimensions: 6 });
    printResult("10^6規模(--large)", large);
  } else {
    console.log("\n(10^6規模は--largeオプションを付けると実行されます。数十秒〜数分かかります)");
  }
}

main();
