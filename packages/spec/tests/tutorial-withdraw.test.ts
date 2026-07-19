import { describe, expect, test } from "vitest";
import { check, defineSpec } from "../src/index.js";
import { tutorialWithdrawSpec } from "../../../examples/tutorial-withdraw.js";

const AMOUNT = 60;

describe("チュートリアル題材: 残高確認と引き落としの間に割り込まれる出金", () => {
  test("残高がマイナスになる反例を最短4ステップで見つける", () => {
    const result = check(tutorialWithdrawSpec);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.violation).toEqual({ kind: "invariant", name: "balanceNeverNegative" });

    // 初期状態を含めて5要素 = 4ステップ(両者check→両者withdraw)
    expect(result.trace).toHaveLength(5);
    expect(result.trace.at(-1)!.state.balance).toBe(-20);

    // 2つの処理がactorとして分かれている(タイムラインのレーン分けの入力になる)
    const actors = new Set(result.trace.slice(1).map(step => step.actor));
    expect(actors).toEqual(new Set(["処理A", "処理B"]));
  });

  test("引き落とし時に残高を再確認すると反例が消える", () => {
    const fixed = defineSpec<typeof tutorialWithdrawSpec.init>({
      ...tutorialWithdrawSpec,
      actions: {
        ...tutorialWithdrawSpec.actions,
        withdrawA: {
          actor: "処理A",
          when: s => s.checkedA && !s.doneA,
          // 修正: 引き落とす直前に残高を再確認する(足りなければ引き落とさずに終了)
          then: s =>
            s.balance >= AMOUNT
              ? { ...s, balance: s.balance - AMOUNT, doneA: true }
              : { ...s, doneA: true },
        },
        withdrawB: {
          actor: "処理B",
          when: s => s.checkedB && !s.doneB,
          then: s =>
            s.balance >= AMOUNT
              ? { ...s, balance: s.balance - AMOUNT, doneB: true }
              : { ...s, doneB: true },
        },
      },
    });

    const result = check(fixed);
    expect(result).toEqual({ ok: true, statesExplored: expect.any(Number), complete: true });
  });
});
