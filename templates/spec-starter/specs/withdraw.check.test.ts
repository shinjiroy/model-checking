import { check } from "@model-checking/spec";
import { expect, test } from "vitest";
import { withdrawSpec } from "./withdraw.js";

/**
 * 検査をCIのゲートにする。反例が出たらここで落ち、トレースがそのままログに出る。
 * 仕様を1つ足したらこのファイルに1ケース足す。
 */
test("withdrawSpec: 不変条件を破る状態に到達しない", () => {
  const result = check(withdrawSpec);

  if (!result.ok) {
    // 反例をログに残す(どのアクションがどの順で起きたか)
    const steps = result.trace
      .map((step, i) => `  ${i}: ${step.action ?? "(初期状態)"} ${JSON.stringify(step.state)}`)
      .join("\n");
    throw new Error(`反例が見つかった (${JSON.stringify(result.violation)}):\n${steps}`);
  }

  expect(result.ok).toBe(true);
  // 打ち切られていない = 到達可能な状態を全部見たうえでの「反例なし」
  expect(result.complete).toBe(true);
});
