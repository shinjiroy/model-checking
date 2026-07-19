import { describe, expect, test } from "vitest";
import { diffWatchSnapshot, pollWatchTarget, toSnapshot, type WatchFile, type WatchTarget } from "../src/core/watch.js";

function file(path: string, lastModified: number, content: string): WatchFile {
  return { path, lastModified, read: async () => content };
}

function fakeTarget(files: WatchFile[]): WatchTarget {
  return { listFiles: async () => files };
}

describe("toSnapshot / diffWatchSnapshot", () => {
  test("同じ内容なら差分なし", () => {
    const snapshot = toSnapshot([file("a.ts", 1, "a"), file("b.ts", 2, "b")]);
    expect(diffWatchSnapshot(snapshot, { ...snapshot })).toEqual([]);
  });

  test("追加・変更・削除を検出する", () => {
    const prev = toSnapshot([file("a.ts", 1, "a"), file("b.ts", 1, "b")]);
    const next = toSnapshot([file("a.ts", 2, "a2"), file("c.ts", 1, "c")]);
    const changes = diffWatchSnapshot(prev, next);
    expect(changes).toEqual(
      expect.arrayContaining([
        { kind: "changed", path: "a.ts" },
        { kind: "removed", path: "b.ts" },
        { kind: "added", path: "c.ts" },
      ]),
    );
    expect(changes).toHaveLength(3);
  });

  test("lastModifiedが同じなら内容が違っていてもchangedにしない(判定基準はlastModifiedのみ)", () => {
    const prev = toSnapshot([file("a.ts", 100, "old")]);
    const next = toSnapshot([file("a.ts", 100, "old")]);
    expect(diffWatchSnapshot(prev, next)).toEqual([]);
  });
});

describe("pollWatchTarget", () => {
  test("変化がなければchanged: falseを返し、読み込みは発生しない", async () => {
    let readCount = 0;
    const target: WatchTarget = {
      listFiles: async () => [
        { path: "a.ts", lastModified: 1, read: async () => { readCount++; return "a"; } },
      ],
    };
    const snapshot = toSnapshot(await target.listFiles());
    readCount = 0; // 初回リスト取得分のカウントをリセット

    const result = await pollWatchTarget(target, snapshot);
    expect(result).toEqual({ changed: false });
    expect(readCount).toBe(0);
  });

  test("変化があれば全ファイルを読み込んで返す", async () => {
    const target = fakeTarget([file("a.ts", 2, "a-new"), file("b.ts", 1, "b")]);
    const prevSnapshot = { "a.ts": 1, "b.ts": 1 };

    const result = await pollWatchTarget(target, prevSnapshot);
    expect(result.changed).toBe(true);
    if (!result.changed) return;
    expect(result.files).toEqual({ "a.ts": "a-new", "b.ts": "b" });
    expect(result.snapshot).toEqual({ "a.ts": 2, "b.ts": 1 });
    expect(result.changes).toEqual([{ kind: "changed", path: "a.ts" }]);
  });

  test("ファイルが削除されたことも変化として検出し、残りのファイルだけを返す", async () => {
    const target = fakeTarget([file("a.ts", 1, "a")]);
    const prevSnapshot = { "a.ts": 1, "b.ts": 1 };

    const result = await pollWatchTarget(target, prevSnapshot);
    expect(result.changed).toBe(true);
    if (!result.changed) return;
    expect(result.files).toEqual({ "a.ts": "a" });
    expect(result.changes).toEqual([{ kind: "removed", path: "b.ts" }]);
  });

  test("新規ファイルが追加された場合も検出する", async () => {
    const target = fakeTarget([file("a.ts", 1, "a"), file("new.ts", 5, "new-content")]);
    const prevSnapshot = { "a.ts": 1 };

    const result = await pollWatchTarget(target, prevSnapshot);
    expect(result.changed).toBe(true);
    if (!result.changed) return;
    expect(result.files).toEqual({ "a.ts": "a", "new.ts": "new-content" });
    expect(result.changes).toEqual([{ kind: "added", path: "new.ts" }]);
  });

  test("初回(prevSnapshotが空)は全ファイルがaddedとして変化ありになる", async () => {
    const target = fakeTarget([file("a.ts", 1, "a")]);
    const result = await pollWatchTarget(target, {});
    expect(result.changed).toBe(true);
    if (!result.changed) return;
    expect(result.changes).toEqual([{ kind: "added", path: "a.ts" }]);
  });
});
