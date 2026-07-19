import { defineSpec } from "@model-checking/spec";

/**
 * 雛形に付属する仕様。ここを自分の設計に置き換えて使う。
 *
 * 1つの口座に対して2つの出金処理が同時に走る。それぞれ「残高が足りるか確認する」→
 * 「引き落とす」の2段階で動くため、確認と引き落としの間に相手が割り込むと
 * 残高がマイナスになる。
 *
 * ここでは引き落とし直前に残高を再確認することで反例を消してある
 * (`npm run check` が通る)。その再確認を外すと、最短4ステップ
 * (checkA → checkB → withdrawA → withdrawB)で残高が -20 になる反例が出て
 * `npm run check` が落ちる。壊してみると検査が効いていることを確かめられる。
 */

const INITIAL_BALANCE = 100;
const AMOUNT = 60;

type State = {
  balance: number;
  checkedA: boolean;
  checkedB: boolean;
  doneA: boolean;
  doneB: boolean;
};

export const withdrawSpec = defineSpec<State>({
  init: {
    balance: INITIAL_BALANCE,
    checkedA: false,
    checkedB: false,
    doneA: false,
    doneB: false,
  },

  actions: {
    checkA: {
      actor: "処理A",
      when: s => !s.checkedA,
      then: s =>
        s.balance >= AMOUNT ? { ...s, checkedA: true } : { ...s, checkedA: true, doneA: true },
    },
    withdrawA: {
      actor: "処理A",
      when: s => s.checkedA && !s.doneA,
      // 引き落とす直前に残高を再確認する(確認時点の残高が引き落とし時点でも
      // 同じだとは限らない)。この再確認を外すと反例が出る
      then: s =>
        s.balance >= AMOUNT
          ? { ...s, balance: s.balance - AMOUNT, doneA: true }
          : { ...s, doneA: true },
    },
    checkB: {
      actor: "処理B",
      when: s => !s.checkedB,
      then: s =>
        s.balance >= AMOUNT ? { ...s, checkedB: true } : { ...s, checkedB: true, doneB: true },
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

  invariants: {
    balanceNeverNegative: s => s.balance >= 0,
  },

  done: s => s.doneA && s.doneB,
});
