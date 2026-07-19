import { defineSpec } from "@model-checking/spec";

/**
 * チュートリアル([docs/tutorial.md](../docs/tutorial.md))で読者が最初に書き上げる仕様。
 *
 * 1つの口座に対して、2つの出金処理が同時に走る。それぞれ「残高が足りるか確認する」→
 * 「引き落とす」の2段階で動く。確認と引き落としの間に相手の引き落としが挟まると、
 * 確認時点では足りていた残高が引き落とし時点では足りなくなり、残高がマイナスになる
 * (time-of-check to time-of-use)。
 *
 * 検出できるバグ: **残高がマイナスになる**。最短反例は4ステップ
 * (checkA → checkB → withdrawA → withdrawB)。
 *
 * 入門用の題材なので、パラメータ付き非決定性(`params`)を使わず2つの処理を
 * そのまま別アクションとして書き下している。actorを分けてあるので、
 * 反例はタイムライン上で2レーンに分かれて表示される。
 */

/** 初期残高 */
const INITIAL_BALANCE = 100;

/** 1回の出金額(2回引き落とすと残高が足りない) */
const AMOUNT = 60;

type State = {
  /** 口座残高 */
  balance: number;
  /** 各処理が残高確認を済ませたか */
  checkedA: boolean;
  checkedB: boolean;
  /** 各処理が終了したか(引き落とし済み、または残高不足で諦めた) */
  doneA: boolean;
  doneB: boolean;
};

export const tutorialWithdrawSpec = defineSpec<State>({
  init: {
    balance: INITIAL_BALANCE,
    checkedA: false,
    checkedB: false,
    doneA: false,
    doneB: false,
  },

  actions: {
    // 処理A: 残高が足りるか確認する。足りなければそこで終了する
    checkA: {
      actor: "処理A",
      when: s => !s.checkedA,
      then: s =>
        s.balance >= AMOUNT
          ? { ...s, checkedA: true }
          : { ...s, checkedA: true, doneA: true },
    },

    // 処理A: 引き落とす。バグ: 確認から時間が空いているのに残高を再確認していない
    withdrawA: {
      actor: "処理A",
      when: s => s.checkedA && !s.doneA,
      then: s => ({ ...s, balance: s.balance - AMOUNT, doneA: true }),
    },

    // 処理B: 処理Aと同じ振る舞い
    checkB: {
      actor: "処理B",
      when: s => !s.checkedB,
      then: s =>
        s.balance >= AMOUNT
          ? { ...s, checkedB: true }
          : { ...s, checkedB: true, doneB: true },
    },

    withdrawB: {
      actor: "処理B",
      when: s => s.checkedB && !s.doneB,
      then: s => ({ ...s, balance: s.balance - AMOUNT, doneB: true }),
    },
  },

  invariants: {
    // 残高はマイナスにならない
    balanceNeverNegative: s => s.balance >= 0,
  },

  // 両方の処理が終わっていれば正常終了
  done: s => s.doneA && s.doneB,
});
