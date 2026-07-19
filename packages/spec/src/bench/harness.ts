/**
 * ベンチマーク計測ハーネス。
 *
 * `check` の実行そのものと計測ロジックを分離している。これは、将来M3(64bit
 * フィンガープリント+TypedArray化)で `check` の内部実装(visited集合の表現)が
 * 差し替わった際に、同じハーネスで新旧の数値を比較できるようにするため。
 * `checkFn` を差し替えれば任意の探索実装を同じ指標で測定できる。
 */
import { check, type CheckOptions, type CheckResult } from "../checker.js";
import type { Spec } from "../spec.js";
import { createScaleModel, expectedStateCount, type ScaleModelParams } from "./scaleModel.js";

export type ScaleBenchmarkParams = ScaleModelParams & {
  /** 探索を打ち切る状態数上限。省略時はモデルの理論状態数+1(打ち切らない) */
  maxStates?: number;
  /** 差し替え可能な探索関数(既定はpackages/specの`check`) */
  checkFn?: <S>(spec: Spec<S>, options?: CheckOptions) => CheckResult<S>;
};

export type ScaleBenchmarkResult = {
  base: number;
  dimensions: number;
  expectedStates: number;
  /** checkが実際に探索した状態数(打ち切り時は理論値より小さい) */
  statesExplored: number;
  /** 打ち切りなしで理論状態数まで到達したか */
  complete: boolean;
  /** 探索に要した時間(ミリ秒) */
  elapsedMs: number;
  /** statesExplored / 経過秒。探索スループットの指標 */
  statesPerSec: number;
  /** 探索前後のprocess.memoryUsage().heapUsedの差分(バイト)。visited集合が保持する
   * 正規化JSON文字列の概算メモリ使用量(GCタイミングに依存するため目安値) */
  heapUsedDeltaBytes: number;
  /** onProgressが呼ばれた回数 */
  progressCallCount: number;
  /** onProgressの連続呼び出し間の経過時間(ミリ秒)の統計。UI応答性(メインスレッドを
   * どれだけの間隔で明け渡せるか)の代理指標 */
  progressIntervalMs: { min: number; max: number; avg: number } | null;
};

/**
 * スケールモデルに対して `check` を実行し、性能指標を計測する。
 * GCタイミングはランタイム任せのため、heapUsedDeltaBytesは目安値であることに注意。
 */
export function runScaleBenchmark(params: ScaleBenchmarkParams): ScaleBenchmarkResult {
  const { base, dimensions, checkFn = check } = params;
  const expectedStates = expectedStateCount({ base, dimensions });
  const maxStates = params.maxStates ?? expectedStates + 1;

  const spec = createScaleModel({ base, dimensions });

  const progressTimestamps: number[] = [];
  const onProgress = () => {
    progressTimestamps.push(performance.now());
  };

  const gc = (globalThis as { gc?: () => void }).gc;
  if (gc) gc();
  const heapBefore = process.memoryUsage().heapUsed;

  const start = performance.now();
  const result = checkFn(spec, { maxStates, onProgress });
  const elapsedMs = performance.now() - start;

  const heapAfter = process.memoryUsage().heapUsed;

  let progressIntervalMs: ScaleBenchmarkResult["progressIntervalMs"] = null;
  if (progressTimestamps.length > 1) {
    const gaps: number[] = [];
    for (let i = 1; i < progressTimestamps.length; i++) {
      gaps.push(progressTimestamps[i]! - progressTimestamps[i - 1]!);
    }
    progressIntervalMs = {
      min: Math.min(...gaps),
      max: Math.max(...gaps),
      avg: gaps.reduce((sum, g) => sum + g, 0) / gaps.length,
    };
  }

  const statesExplored = result.ok ? result.statesExplored : result.statesExplored;
  const complete = result.ok ? result.complete : false;

  return {
    base,
    dimensions,
    expectedStates,
    statesExplored,
    complete,
    elapsedMs,
    statesPerSec: statesExplored / (elapsedMs / 1000),
    heapUsedDeltaBytes: heapAfter - heapBefore,
    progressCallCount: progressTimestamps.length,
    progressIntervalMs,
  };
}
