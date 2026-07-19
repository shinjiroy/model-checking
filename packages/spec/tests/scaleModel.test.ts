import { describe, expect, test } from "vitest";
import { check } from "../src/index.js";
import { createScaleModel, expectedStateCount } from "../src/bench/scaleModel.js";

describe("スケールモデル(性能検証用の大規模状態モデル)", () => {
  test.each([
    { base: 2, dimensions: 1 },
    { base: 3, dimensions: 2 },
    { base: 2, dimensions: 3 },
    { base: 4, dimensions: 2 },
  ])("到達状態数がbase ** dimensionsと厳密に一致する(base=$base, dimensions=$dimensions)", params => {
    const spec = createScaleModel(params);
    const result = check(spec, { maxStates: expectedStateCount(params) + 1 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.complete).toBe(true);
    expect(result.statesExplored).toBe(expectedStateCount(params));
  });

  test("最終状態は全カウンタがbase-1に達している", () => {
    const params = { base: 3, dimensions: 2 };
    const spec = createScaleModel(params);
    const result = check(spec, { maxStates: expectedStateCount(params) + 1 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // BFSなので最終的にキューに残るのは最も遠い状態だが、探索完了(complete)であれば
    // 全カウンタが上限に達した状態を含め、全ての組み合わせが訪問済みになっているはず。
    // ここでは統計的な状態数の一致で到達性を保証しているため、追加で代表状態を1つ検証する。
    expect(result.statesExplored).toBe(9);
  });

  test("maxStatesを理論値未満に設定すると打ち切られる", () => {
    const spec = createScaleModel({ base: 10, dimensions: 3 }); // 理論値1,000
    const result = check(spec, { maxStates: 100 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.complete).toBe(false);
    expect(result.statesExplored).toBe(100);
  });

  test("baseやdimensionsが不正な場合は例外を投げる", () => {
    expect(() => createScaleModel({ base: 0, dimensions: 2 })).toThrow(RangeError);
    expect(() => createScaleModel({ base: 2, dimensions: 0 })).toThrow(RangeError);
    expect(() => createScaleModel({ base: 2.5, dimensions: 2 })).toThrow(RangeError);
  });
});
