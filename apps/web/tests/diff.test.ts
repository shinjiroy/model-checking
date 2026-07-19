import { describe, expect, test } from "vitest";
import { diff } from "../src/core/diff.js";

describe("diff: プリミティブの変更", () => {
  test("トップレベルの値が変わればchanged", () => {
    expect(diff(1, 2)).toEqual([{ path: "(root)", kind: "changed", before: 1, after: 2 }]);
  });

  test("同値なら差分なし", () => {
    expect(diff({ a: 1 }, { a: 1 })).toEqual([]);
  });
});

describe("diff: オブジェクトのフィールド", () => {
  test("フィールドの追加・削除・変更を検出する", () => {
    const prev = { a: 1, b: 2 };
    const next = { a: 1, c: 3 };
    const entries = diff(prev, next);
    expect(entries).toEqual(
      expect.arrayContaining([
        { path: "b", kind: "removed", before: 2 },
        { path: "c", kind: "added", after: 3 },
      ]),
    );
    expect(entries).toHaveLength(2);
  });
});

describe("diff: 配列", () => {
  test("末尾追加(push)を検出する", () => {
    expect(diff([1, 2], [1, 2, 3])).toEqual([{ path: "[2]", kind: "added", after: 3 }]);
  });

  test("末尾削除(pop)を検出する", () => {
    expect(diff([1, 2, 3], [1, 2])).toEqual([{ path: "[2]", kind: "removed", before: 3 }]);
  });

  test("要素の変更を検出する", () => {
    expect(diff([1, 2], [1, 9])).toEqual([{ path: "[1]", kind: "changed", before: 2, after: 9 }]);
  });

  test("中間の要素変更は前後の共通部分に引きずられず1件のchangedになる", () => {
    expect(diff([0, 1, 2, 3, 4], [0, 1, 9, 3, 4])).toEqual([
      { path: "[2]", kind: "changed", before: 2, after: 9 },
    ]);
  });

  test("FIFOの先頭取り出し([1,2] → [2])は全要素がズレるのではなく先頭1件のremovedになる", () => {
    // インデックス対応の素朴な比較だと [0]changed(1→2) + [1]removed(2) のようにノイズが出るが、
    // 共通サフィックス([2]が両方の末尾で一致)を検出できれば実際に減った要素だけを報告できる
    expect(diff([1, 2], [2])).toEqual([{ path: "[0]", kind: "removed", before: 1 }]);
  });

  test("中間区間の要素数が変わる場合は変更と削除が両方報告される", () => {
    // prev=[1,2,3,4], next=[1,9,4]: 共通prefix=[1], 共通suffix=[4]、中間は prev[2,3] vs next[9]
    expect(diff([1, 2, 3, 4], [1, 9, 4])).toEqual([
      { path: "[1]", kind: "changed", before: 2, after: 9 },
      { path: "[2]", kind: "removed", before: 3 },
    ]);
  });
});

describe("diff: ネスト", () => {
  test("ネストしたフィールドはドット区切りのpathになる", () => {
    const prev = { user: { name: "a", age: 1 } };
    const next = { user: { name: "a", age: 2 } };
    expect(diff(prev, next)).toEqual([{ path: "user.age", kind: "changed", before: 1, after: 2 }]);
  });

  test("オブジェクト内配列は `field[index]` 表記になる", () => {
    const prev = { inFlight: [1] };
    const next = { inFlight: [1, 2] };
    expect(diff(prev, next)).toEqual([{ path: "inFlight[1]", kind: "added", after: 2 }]);
  });

  test("配列内オブジェクトのフィールド変更もpathに反映される", () => {
    const prev = { items: [{ id: 1, done: false }] };
    const next = { items: [{ id: 1, done: true }] };
    expect(diff(prev, next)).toEqual([{ path: "items[0].done", kind: "changed", before: false, after: true }]);
  });

  test("payment-retryのinFlightのようなFIFO先頭取り出しは removed inFlight[0] のみになる", () => {
    const prev = { inFlight: [1, 2] };
    const next = { inFlight: [2] };
    expect(diff(prev, next)).toEqual([{ path: "inFlight[0]", kind: "removed", before: 1 }]);
  });
});
