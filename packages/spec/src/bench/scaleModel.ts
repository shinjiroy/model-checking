/**
 * 性能検証用の大規模状態モデル。
 *
 * 状態は `dimensions` 個のカウンタからなるベクトルで、各カウンタは `0` から `base - 1` まで
 * 単調増加する。到達可能な状態数は各カウンタの取りうる値の組み合わせ全てであり、
 * 厳密に `base ** dimensions` になる(BFSが全状態に到達することは
 * tests/scaleModel.test.ts で小さいパラメータについて検証している)。
 *
 * 実際の業務仕様と異なり「状態空間のサイズを事前に厳密に指定できる」ことが目的で、
 * BFS探索器(visited集合・states/sec・メモリ使用量・onProgress発火)の性能特性を
 * 測定するための負荷生成専用モデルである。
 */
import { defineSpec, type Spec } from "../spec.js";

export type ScaleState = {
  /** 各次元のカウンタ値(0 <= counters[i] < base) */
  counters: number[];
};

export type ScaleModelParams = {
  /** 各カウンタが取りうる値の段数(到達状態数は base ** dimensions) */
  base: number;
  /** カウンタの本数(次元数) */
  dimensions: number;
};

/**
 * 到達状態数が正確に `base ** dimensions` になるカウンタベクトルモデルを組み立てる。
 * 単一のアクション `inc` が非決定的パラメータとして「まだ上限に達していない次元」を選び、
 * その次元を1つ進める。可換な操作なので到達順によらず同じ状態は1つに正規化・重複排除される。
 */
export function createScaleModel({ base, dimensions }: ScaleModelParams): Spec<ScaleState> {
  if (!Number.isInteger(base) || base < 1) {
    throw new RangeError(`baseは1以上の整数である必要があります: ${base}`);
  }
  if (!Number.isInteger(dimensions) || dimensions < 1) {
    throw new RangeError(`dimensionsは1以上の整数である必要があります: ${dimensions}`);
  }

  return defineSpec<ScaleState>({
    init: { counters: new Array(dimensions).fill(0) },
    actions: {
      inc: {
        params: state =>
          state.counters
            .map((value, index) => ({ value, index }))
            .filter(({ value }) => value < base - 1)
            .map(({ index }) => index),
        then: (state, index: number) => ({
          counters: state.counters.map((value, i) => (i === index ? value + 1 : value)),
        }),
      },
    },
    // 全カウンタが上限に達した状態が唯一のデッドロック(=正常終了)状態。
    // このモデルの目的は探索性能の測定であり、デッドロック判定そのものは対象外なので、
    // 常にdoneとして探索を最後まで完走させる。
    done: () => true,
  });
}

/** 理論上の到達状態数(base ** dimensions)を計算する */
export function expectedStateCount({ base, dimensions }: ScaleModelParams): number {
  return base ** dimensions;
}
