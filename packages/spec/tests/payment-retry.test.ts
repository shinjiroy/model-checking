import { describe, expect, test } from "vitest";
import { check, defineSpec } from "../src/index.js";
import { paymentRetrySpec } from "../../../examples/payment-retry.js";

describe("決済リトライによる二重課金(フェーズ2題材: 複数プロセス)", () => {
  test("タイムアウト・リトライで二重課金される反例を最短経路で見つける", () => {
    const result = check(paymentRetrySpec);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.violation).toEqual({ kind: "invariant", name: "chargedAtMostOnce" });

    // 最短の反例は5ステップ(初期状態を含めて6要素)
    expect(result.trace).toHaveLength(6);
    expect(result.trace.at(-1)!.state.charged).toBe(2);

    // 各ステップにactorメタデータが写されている(可視化の入力になる)
    for (const step of result.trace.slice(1)) {
      expect(["client", "server"]).toContain(step.actor);
    }

    // 仕様のchannelsメタデータがCheckResultへ写されている(メッセージ矢印描画の入力になる)
    expect(result.channels).toEqual({
      inFlight: { from: "client", to: "server" },
      responses: { from: "server", to: "client" },
    });
  });

  test("サーバーを冪等にすると反例が消え、全経路が正常終了する", () => {
    const fixed = defineSpec<typeof paymentRetrySpec.init>({
      ...paymentRetrySpec,
      actions: {
        ...paymentRetrySpec.actions,
        processRequest: {
          actor: "server",
          when: s => s.inFlight.length > 0,
          then: s => ({
            ...s,
            charged: Math.min(s.charged + 1, 1), // 課金済みなら課金しない(冪等)
            inFlight: s.inFlight.slice(1),
            responses: [...s.responses, s.inFlight[0]!],
          }),
        },
      },
    });

    const result = check(fixed);
    expect(result).toEqual({ ok: true, statesExplored: expect.any(Number), complete: true });
  });
});
