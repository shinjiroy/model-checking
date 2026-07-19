import { describe, expect, test } from "vitest";
import { check, defineSpec } from "../src/index.js";
import { conduitFavoriteCountSpec } from "../../../examples/conduit-favorite-count.js";

describe("Conduit favorite数の二重管理によるロストアップデート(トラックA: インターリーブ探索)", () => {
  test("2ユーザーの同時お気に入りでカウンタと集合が食い違う反例を最短経路で見つける", () => {
    const result = check(conduitFavoriteCountSpec);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.violation).toEqual({ kind: "invariant", name: "countMatchesFavorites" });

    // 最短反例は4ステップ(両者read→両者commit。初期状態を含めて5要素)
    expect(result.trace).toHaveLength(5);

    const last = result.trace.at(-1)!.state;
    // お気に入り集合は2件なのにカウンタは1件で食い違っている(ロストアップデート)
    expect(last.favoritedBy).toHaveLength(2);
    expect(last.count).toBe(1);

    // 各ステップにactor(ユーザー名)が写されている(タイムラインのレーン分けの入力になる)
    for (const step of result.trace.slice(1)) {
      expect(["alice", "bob"]).toContain(step.actor);
    }
  });

  test("commitで現在のカウンタ値を使う(原子的にインクリメントする)と反例が消える", () => {
    const fixed = defineSpec<typeof conduitFavoriteCountSpec.init>({
      ...conduitFavoriteCountSpec,
      actions: {
        ...conduitFavoriteCountSpec.actions,
        commit_alice: {
          actor: "alice",
          when: s => s.phase.alice === "reading",
          then: s => ({
            ...s,
            phase: { ...s.phase, alice: "done" },
            count: s.count + 1, // 修正: 古いreadValueではなく現在値をインクリメントする
            favoritedBy: [...s.favoritedBy, "alice"],
          }),
        },
        commit_bob: {
          actor: "bob",
          when: s => s.phase.bob === "reading",
          then: s => ({
            ...s,
            phase: { ...s.phase, bob: "done" },
            count: s.count + 1,
            favoritedBy: [...s.favoritedBy, "bob"],
          }),
        },
      },
    });

    const result = check(fixed);
    expect(result).toEqual({ ok: true, statesExplored: expect.any(Number), complete: true });
  });
});
