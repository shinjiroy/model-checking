import { describe, expect, test } from "vitest";
import { check, defineSpec } from "../src/index.js";
import { orderPaymentSpec } from "../../../examples/order-payment.js";

describe("注文キャンセルと決済Webhookの競合(題材の仕様)", () => {
  test("キャンセル済み注文が課金確定される反例を最短経路で見つける", () => {
    const result = check(orderPaymentSpec);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.violation).toEqual({ kind: "invariant", name: "cancelledOrderIsNeverCaptured" });

    // 最短の反例は4ステップ(初期状態を含めて5要素)
    expect(result.trace).toHaveLength(5);
    expect(result.trace[0]!.action).toBeNull();

    const last = result.trace.at(-1)!.state;
    expect(last.order).toBe("captured");
    expect(last.wasCancelled).toBe(true);
  });

  test("Webhook処理が注文状態を確認するよう直すと反例が消える", () => {
    const fixed = defineSpec<typeof orderPaymentSpec.init>({
      ...orderPaymentSpec,
      actions: {
        ...orderPaymentSpec.actions,
        handleWebhook: {
          when: s => s.webhooks.length > 0,
          then: s => {
            const [head, ...rest] = s.webhooks;
            if (s.order === "cancelled") {
              return { ...s, webhooks: rest }; // キャンセル済みならWebhookを破棄する
            }
            return {
              ...s,
              order: head!,
              webhooks: head === "authorized" ? [...rest, "captured"] : rest,
            };
          },
        },
      },
    });

    const result = check(fixed);
    expect(result).toEqual({ ok: true, statesExplored: expect.any(Number), complete: true });
  });
});

describe("デッドロック検出", () => {
  const counter = (done?: (s: { n: number }) => boolean) =>
    defineSpec<{ n: number }>({
      init: { n: 0 },
      actions: {
        inc: { when: s => s.n < 2, then: s => ({ n: s.n + 1 }) },
      },
      done,
    });

  test("発火可能なアクションがない状態をデッドロックとして報告する", () => {
    const result = check(counter());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.violation).toEqual({ kind: "deadlock" });
    expect(result.trace.map(s => s.action)).toEqual([null, "inc", "inc"]);
    expect(result.trace.at(-1)!.state).toEqual({ n: 2 });
  });

  test("doneが真の状態はデッドロックとみなさない", () => {
    const result = check(counter(s => s.n === 2));
    expect(result.ok).toBe(true);
  });
});

describe("パラメータ付き非決定性", () => {
  test("paramsの全値を試し、反例のトレースに選ばれた値が残る", () => {
    const spec = defineSpec<{ approver: string | null }>({
      init: { approver: null },
      actions: {
        approve: {
          when: s => s.approver === null,
          params: () => ["alice", "bob"],
          then: (s, user) => ({ approver: user }),
        },
      },
      invariants: {
        bobNeverApproves: s => s.approver !== "bob",
      },
      done: s => s.approver !== null,
    });

    const result = check(spec);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.violation).toEqual({ kind: "invariant", name: "bobNeverApproves" });
    expect(result.trace.at(-1)).toEqual({
      action: "approve",
      param: "bob",
      state: { approver: "bob" },
    });
  });
});

describe("状態の重複排除", () => {
  test("到達順が違っても同じ状態は一度しか探索しない", () => {
    // aとbは可換なので状態は {}, {a}, {b}, {a,b} の4つ
    const spec = defineSpec<{ a: boolean; b: boolean }>({
      init: { a: false, b: false },
      actions: {
        setA: { when: s => !s.a, then: s => ({ ...s, a: true }) },
        setB: { when: s => !s.b, then: s => ({ ...s, b: true }) },
      },
      done: () => true,
    });

    const result = check(spec);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.statesExplored).toBe(4);
  });
});

describe("検査結果の付帯情報", () => {
  test("初期状態が不変条件を破っていればトレースは初期状態のみ", () => {
    const spec = defineSpec<{ n: number }>({
      init: { n: -1 },
      actions: {},
      invariants: { nonNegative: s => s.n >= 0 },
    });

    const result = check(spec);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.trace).toEqual([{ action: null, state: { n: -1 } }]);
  });

  test("maxStatesを超えたらcomplete: falseで打ち切る", () => {
    const spec = defineSpec<{ n: number }>({
      init: { n: 0 },
      actions: {
        inc: { when: s => s.n < 100, then: s => ({ n: s.n + 1 }) },
      },
      done: () => true,
    });

    const result = check(spec, { maxStates: 10 });
    expect(result).toEqual({ ok: true, statesExplored: 10, complete: false });
  });

  test("onProgressが1024状態ごとに呼ばれ、探索済み状態数が単調に増加する", () => {
    const spec = defineSpec<{ n: number }>({
      init: { n: 0 },
      actions: {
        inc: { when: s => s.n < 3000, then: s => ({ n: s.n + 1 }) },
      },
      done: () => true,
    });

    const progress: number[] = [];
    const result = check(spec, { onProgress: n => progress.push(n) });

    expect(result.ok).toBe(true);
    expect(progress.length).toBeGreaterThan(1);
    for (const n of progress) {
      expect(n % 1024).toBe(0);
    }
    for (let i = 1; i < progress.length; i++) {
      expect(progress[i]!).toBeGreaterThan(progress[i - 1]!);
    }
  });
});

describe("channelsメタデータ(可視化用、検査結果には影響しない)", () => {
  test("channels未指定ならCheckResultのchannelsはundefinedのまま", () => {
    const spec = defineSpec<{ n: number }>({
      init: { n: 0 },
      actions: {
        inc: { when: s => s.n < 1, then: s => ({ n: s.n + 1 }) },
      },
      invariants: { neverIncremented: s => s.n === 0 },
    });

    const result = check(spec);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.channels).toBeUndefined();
  });

  test("channelsを指定するとCheckResultへそのまま写される", () => {
    const spec = defineSpec<{ queue: number[] }>({
      init: { queue: [] },
      actions: {
        push: { when: s => s.queue.length < 1, then: s => ({ queue: [...s.queue, 1] }) },
      },
      invariants: { queueStaysEmpty: s => s.queue.length === 0 },
      channels: { queue: { from: "producer", to: "consumer" } },
    });

    const result = check(spec);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.channels).toEqual({ queue: { from: "producer", to: "consumer" } });
  });
});

describe("仕様側の誤りの検出", () => {
  test("アクションが状態を破壊的に変更すると例外になる", () => {
    const spec = defineSpec<{ items: number[] }>({
      init: { items: [] },
      actions: {
        push: {
          when: s => s.items.length < 1,
          then: s => {
            s.items.push(1); // 破壊的変更(禁止)
            return s;
          },
        },
      },
      done: () => true,
    });

    expect(() => check(spec)).toThrow(TypeError);
  });

  test("状態にクラスインスタンスが混ざるとエラーメッセージで知らせる", () => {
    const spec = defineSpec<{ at: unknown }>({
      init: { at: new Date(0) },
      actions: {},
      done: () => true,
    });

    expect(() => check(spec)).toThrow(/プレーンオブジェクト以外/);
  });
});
