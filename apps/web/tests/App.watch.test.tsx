// @vitest-environment jsdom
/**
 * ウォッチモードの変更検知が App の配線(queueAnalyze)へ流れる経路を検証する。
 * useDirectoryWatch のポーリング自体は useDirectoryWatch.test.ts で見るので、ここでは
 * フックをモックして onChange を捕捉し、「検査中に保存が起きたら
 * cancel→(新Worker)ready→flush(再解析)→autoCheck(自動再検査)」の順序で
 * 直列化されることに集中する。
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FakeWorker, installFakeWorker, latestWorker } from "./helpers/fakeWorker.js";

// useDirectoryWatch をモックし、App が渡す onChange を捕捉して手動で発火できるようにする
let capturedOnChange: ((files: Record<string, string>) => void) | null = null;
const watchStop = vi.fn();
vi.mock("../src/ui/useDirectoryWatch.js", () => ({
  useDirectoryWatch: (onChange: (files: Record<string, string>) => void) => {
    capturedOnChange = onChange;
    return { dirName: "proj", start: vi.fn(), stop: watchStop };
  },
}));

// 動的importで、モック適用後にAppを読み込む
const { App } = await import("../src/App.js");

beforeEach(() => {
  installFakeWorker();
  capturedOnChange = null;
  watchStop.mockClear();
});

afterEach(() => {
  cleanup();
  delete (globalThis as unknown as { Worker?: unknown }).Worker;
});

/** 保存を模擬する: ウォッチのonChangeに新ファイルを流す */
function fireWatchChange(files: Record<string, string>): void {
  act(() => {
    if (!capturedOnChange) throw new Error("onChangeが捕捉されていません");
    capturedOnChange(files);
  });
}

/** ready→デモ読込→解析→単一export選択→検査、まで進めて「検査中」の状態にする */
function driveToChecking(): FakeWorker {
  render(<App />);
  const worker = latestWorker();
  act(() => worker.emit({ type: "ready" }));
  fireEvent.click(screen.getByRole("button", { name: /payment-retry/ }));
  fireEvent.click(screen.getByRole("button", { name: "解析する" }));
  act(() => worker.emit({ type: "analyzed", exports: [{ name: "mySpec", kind: "spec" }] }));
  fireEvent.click(screen.getByRole("button", { name: "検査する" }));
  return worker;
}

describe("App: ウォッチモードの保存→自動再検査", () => {
  test("検査中に保存されると cancel→ready→flush→autoCheck の順で再検査まで直列化される", async () => {
    const oldWorker = driveToChecking();
    expect(oldWorker.lastPosted("check")).toMatchObject({ exportName: "mySpec" });

    // 保存(ウォッチ変更)発生 → 検査中なのでqueueAnalyzeは"cancel"を選ぶ
    fireWatchChange({ "payment-retry.ts": "export const spec = 2; // edited" });

    // cancel: 旧Workerをterminateし、新Worker(次世代)を生成する
    expect(oldWorker.terminated).toBe(true);
    expect(FakeWorker.instances.length).toBe(2);
    const newWorker = latestWorker();
    expect(newWorker).not.toBe(oldWorker);
    // まだ新Workerはreadyでないので、この時点ではanalyzeは送られていない(pendingで待機)
    expect(newWorker.lastPosted("analyze")).toBeUndefined();

    // 新Workerがready → 待機していたpendingがflushされ、最新ファイルで再解析される
    act(() => newWorker.emit({ type: "ready" }));
    await waitFor(() => expect(newWorker.lastPosted("analyze")).toBeTruthy());
    expect(newWorker.lastPosted("analyze")).toMatchObject({
      files: { "payment-retry.ts": "export const spec = 2; // edited" },
    });

    // 解析完了 → 保存前に選んでいたspecが残っていれば自動的に再検査(autoCheck)する
    act(() => newWorker.emit({ type: "analyzed", exports: [{ name: "mySpec", kind: "spec" }] }));
    await waitFor(() => expect(newWorker.lastPosted("check")).toBeTruthy());
    expect(newWorker.lastPosted("check")).toMatchObject({ exportName: "mySpec" });

    // 旧Workerが遅れて結果を送っても、世代ガードで無視される
    act(() =>
      oldWorker.emit({ type: "result", kind: "spec", result: { ok: true, statesExplored: 5, complete: true } }),
    );
    expect(screen.queryByText("検査成功")).toBeNull();
  });

  test("アイドル中に保存された場合はcancelせず即座に再解析する(flush-now)", async () => {
    render(<App />);
    const worker = latestWorker();
    act(() => worker.emit({ type: "ready" }));
    fireEvent.click(screen.getByRole("button", { name: /payment-retry/ }));
    fireEvent.click(screen.getByRole("button", { name: "解析する" }));
    act(() => worker.emit({ type: "analyzed", exports: [{ name: "mySpec", kind: "spec" }] }));
    // 検査は実行していない(アイドル)

    fireWatchChange({ "payment-retry.ts": "export const spec = 3;" });

    // アイドル & workerReadyなのでWorkerは作り直さず、同じWorkerへ即analyzeを送る
    expect(worker.terminated).toBe(false);
    expect(FakeWorker.instances.length).toBe(1);
    await waitFor(() => expect(worker.lastPosted("analyze")).toMatchObject({ files: { "payment-retry.ts": "export const spec = 3;" } }));
  });
});
