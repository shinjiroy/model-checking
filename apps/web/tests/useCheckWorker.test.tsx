// @vitest-environment jsdom
/**
 * useCheckWorker のWorkerライフサイクル配線をフェイクWorkerで検証する。
 * 状態遷移そのもの(reducer)は checkWorkerReducer.test.ts が担うので、ここでは
 * 「生成・postMessage・cancelでの作り直し・epochの焼き付け」というReactフック固有の配線を見る。
 */
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useCheckWorker } from "../src/ui/useCheckWorker.js";
import { FakeWorker, installFakeWorker, latestWorker } from "./helpers/fakeWorker.js";

beforeEach(() => {
  installFakeWorker();
});

afterEach(() => {
  delete (globalThis as unknown as { Worker?: unknown }).Worker;
});

describe("useCheckWorker: Worker生成とメッセージ配線", () => {
  test("マウント時にWorkerを1つ生成し、readyメッセージでworkerReadyになる", () => {
    const { result } = renderHook(() => useCheckWorker());
    expect(FakeWorker.instances).toHaveLength(1);
    expect(result.current.state.workerReady).toBe(false);

    act(() => latestWorker().emit({ type: "ready" }));
    expect(result.current.state.workerReady).toBe(true);
  });

  test("analyze()はanalyzeリクエストを送信し、analyzingに遷移する", () => {
    const { result } = renderHook(() => useCheckWorker());
    act(() => latestWorker().emit({ type: "ready" }));

    act(() => result.current.analyze({ "main.ts": "export const x = 1;" }, "main.ts"));
    expect(result.current.state.analyzing).toBe(true);
    expect(latestWorker().lastPosted("analyze")).toEqual({
      type: "analyze",
      files: { "main.ts": "export const x = 1;" },
      entry: "main.ts",
    });
  });

  test("runCheck()はcheckリクエストを送信し、checkingに遷移する", () => {
    const { result } = renderHook(() => useCheckWorker());
    act(() => latestWorker().emit({ type: "ready" }));

    act(() => result.current.runCheck("mySpec", 500));
    expect(result.current.state.checking).toBe(true);
    expect(latestWorker().lastPosted("check")).toEqual({ type: "check", exportName: "mySpec", maxStates: 500 });
  });

  test("cancel()は旧Workerをterminateして新Workerを生成し、epochを進める", () => {
    const { result } = renderHook(() => useCheckWorker());
    const first = latestWorker();
    act(() => first.emit({ type: "ready" }));
    act(() => result.current.runCheck("mySpec", 500));
    expect(result.current.state.epoch).toBe(0);

    act(() => result.current.cancel());
    expect(first.terminated).toBe(true);
    expect(FakeWorker.instances).toHaveLength(2);
    expect(latestWorker()).not.toBe(first);
    expect(result.current.state.epoch).toBe(1);
    expect(result.current.state.workerReady).toBe(false); // 新Workerのreadyを待つ
  });

  test("cancel後、旧Workerから遅延して届いたresultは世代ガードで無視される(受け入れ基準の核)", () => {
    const { result } = renderHook(() => useCheckWorker());
    const oldWorker = latestWorker();
    act(() => oldWorker.emit({ type: "ready" }));
    act(() => result.current.runCheck("mySpec", 500));

    act(() => result.current.cancel()); // epoch 0 → 1、新Worker生成

    // terminate後に旧Worker(epoch 0)のonmessageが遅延発火しても、現世代(1)と一致しないため適用されない
    act(() => oldWorker.emit({ type: "result", kind: "spec", result: { ok: true, statesExplored: 9, complete: true } }));
    expect(result.current.state.result).toBeNull();
    expect(result.current.state.checking).toBe(false);
  });

  test("cancel後、新Workerからのメッセージは正しく反映される", () => {
    const { result } = renderHook(() => useCheckWorker());
    act(() => latestWorker().emit({ type: "ready" }));
    act(() => result.current.cancel());

    const fresh = latestWorker();
    act(() => fresh.emit({ type: "ready" }));
    expect(result.current.state.workerReady).toBe(true);
    act(() => fresh.emit({ type: "analyzed", exports: [{ name: "newSpec", kind: "spec" }] }));
    expect(result.current.state.exports).toEqual([{ name: "newSpec", kind: "spec" }]);
  });

  test("アンマウント時に現世代のWorkerをterminateする", () => {
    const { result, unmount } = renderHook(() => useCheckWorker());
    act(() => result.current.cancel()); // 差し替え後の最新Workerが後始末対象
    const current = latestWorker();
    unmount();
    expect(current.terminated).toBe(true);
  });
});
