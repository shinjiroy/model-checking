import { describe, expect, test } from "vitest";
import { createSessionGuard } from "../src/core/session.js";

describe("createSessionGuard", () => {
  test("start()した直後のトークンはisCurrent", () => {
    const guard = createSessionGuard();
    const token = guard.start();
    expect(guard.isCurrent(token)).toBe(true);
  });

  test("start()を再度呼ぶと前のトークンは古くなる", () => {
    const guard = createSessionGuard();
    const first = guard.start();
    const second = guard.start();
    expect(guard.isCurrent(first)).toBe(false);
    expect(guard.isCurrent(second)).toBe(true);
  });

  test("invalidate()すると、現在のトークンも古くなる(停止直後に完了した非同期処理を破棄する用途)", () => {
    const guard = createSessionGuard();
    const token = guard.start();
    guard.invalidate();
    expect(guard.isCurrent(token)).toBe(false);
  });

  test("invalidate()後に新しくstart()すれば、その新トークンは最新になる", () => {
    const guard = createSessionGuard();
    const oldToken = guard.start();
    guard.invalidate();
    const newToken = guard.start();
    expect(guard.isCurrent(oldToken)).toBe(false);
    expect(guard.isCurrent(newToken)).toBe(true);
  });

  test("start()は常に1以上のトークンを返す(0は有効なトークンとして返らない)", () => {
    const guard = createSessionGuard();
    expect(guard.start()).toBeGreaterThanOrEqual(1);
  });

  test("start()していない初期状態では、まだ発行していない未来のトークンはisCurrentではない", () => {
    const guard = createSessionGuard();
    expect(guard.isCurrent(1)).toBe(false);
  });
});
