// @vitest-environment jsdom
/**
 * App の配線層をフェイクWorkerで駆動する統合テスト。
 * DropZone→解析→検査→結果表示という主経路と、「検査中に別ファイルを読み込んでも旧結果が
 * 表示されない」世代ガード、そして共有URL(#s=...)からの復元を、実際のDOM操作で検証する。
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { App } from "../src/App.js";
import { encodeSharePayload } from "../src/core/share.js";
import { FakeWorker, installFakeWorker, latestWorker } from "./helpers/fakeWorker.js";

beforeEach(() => {
  installFakeWorker();
  window.location.hash = "";
});

afterEach(() => {
  cleanup();
  delete (globalThis as unknown as { Worker?: unknown }).Worker;
  window.location.hash = "";
});

/** 最初のデモボタンを押して1ファイルを読み込ませる(onFilesLoadedを同期で叩く簡単な経路) */
function loadFirstDemo(): void {
  const demoButton = screen.getByRole("button", { name: /payment-retry/ });
  fireEvent.click(demoButton);
}

describe("App: 解析→検査→結果表示の主経路", () => {
  test("ready→ファイル読込→解析→単一export自動選択→検査→結果表示", async () => {
    render(<App />);
    const worker = latestWorker();

    // Worker初期化中は解析ボタンが無効
    act(() => worker.emit({ type: "ready" }));
    loadFirstDemo();

    const analyzeButton = screen.getByRole("button", { name: "解析する" });
    expect(analyzeButton).toBeEnabled();
    fireEvent.click(analyzeButton);
    expect(worker.lastPosted("analyze")).toBeTruthy();

    // exportが1件なら自動選択され、検査UIが出る(SpecPickerは複数件のときだけ)
    act(() => worker.emit({ type: "analyzed", exports: [{ name: "onlySpec", kind: "spec" }] }));
    const runCheckButton = await screen.findByRole("button", { name: "検査する" });
    expect(runCheckButton).toBeEnabled();

    fireEvent.click(runCheckButton);
    expect(worker.lastPosted("check")).toEqual({ type: "check", exportName: "onlySpec", maxStates: 1_000_000 });

    // 進捗→結果
    act(() => worker.emit({ type: "progress", statesExplored: 1234 }));
    expect(screen.getByRole("status").textContent).toContain("1,234");

    act(() =>
      worker.emit({ type: "result", kind: "spec", result: { ok: true, statesExplored: 4242, complete: true } }),
    );
    expect(await screen.findByText("検査成功")).toBeTruthy();
    expect(screen.getByText(/4,242/)).toBeTruthy();
  });

  test("複数exportのときはSpecPickerで選ぶまで検査ボタンが無効", async () => {
    render(<App />);
    const worker = latestWorker();
    act(() => worker.emit({ type: "ready" }));
    loadFirstDemo();
    fireEvent.click(screen.getByRole("button", { name: "解析する" }));

    act(() =>
      worker.emit({
        type: "analyzed",
        exports: [
          { name: "specA", kind: "spec" },
          { name: "specB", kind: "spec" },
        ],
      }),
    );

    // 複数件なので自動選択されず、検査ボタンは無効
    expect(await screen.findByText("検査対象の選択")).toBeTruthy();
    expect(screen.getByRole("button", { name: "検査する" })).toBeDisabled();

    fireEvent.click(screen.getByRole("radio", { name: /specB/ }));
    expect(screen.getByRole("button", { name: "検査する" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "検査する" }));
    expect(worker.lastPosted("check")).toMatchObject({ exportName: "specB" });
  });
});

describe("App: 検査中に別ファイルを読み込むと旧結果は表示されない(世代ガード)", () => {
  test("検査実行中の手動読込でcancel→新Worker生成、旧Workerの遅延resultは無視される", async () => {
    render(<App />);
    const oldWorker = latestWorker();
    act(() => oldWorker.emit({ type: "ready" }));
    loadFirstDemo();
    fireEvent.click(screen.getByRole("button", { name: "解析する" }));
    act(() => oldWorker.emit({ type: "analyzed", exports: [{ name: "specA", kind: "spec" }] }));

    fireEvent.click(await screen.findByRole("button", { name: "検査する" }));
    expect(oldWorker.lastPosted("check")).toBeTruthy();

    // 検査中に別のファイルを読み込む → cancel()で新Worker生成(epochが進む)
    fireEvent.click(screen.getByRole("button", { name: /order-payment/ }));
    expect(oldWorker.terminated).toBe(true);
    expect(FakeWorker.instances.length).toBe(2);
    expect(latestWorker()).not.toBe(oldWorker);

    // 旧Worker(旧epoch)がterminate後に遅延してresultを送っても、画面には出ない
    act(() =>
      oldWorker.emit({ type: "result", kind: "spec", result: { ok: true, statesExplored: 777, complete: true } }),
    );
    expect(screen.queryByText("検査成功")).toBeNull();
    expect(screen.queryByText(/777/)).toBeNull();
  });
});

describe("App: 共有URL(#s=...)からの復元", () => {
  test("マウント時にファイルを復元し自動解析するが、自動検査はしない(specは選択状態にするだけ)", async () => {
    const encoded = await encodeSharePayload({
      version: 1,
      files: { "shared.ts": "export const spec = 1;" },
      entry: "shared.ts",
      specName: "sharedSpec",
    });
    window.location.hash = `#s=${encoded}`;

    render(<App />);
    const worker = latestWorker();

    // マウント時の非同期デコード完了を待ってからWorkerをreadyにする(ready前はpendingで待機)
    await act(async () => {
      await Promise.resolve();
    });
    act(() => worker.emit({ type: "ready" }));

    // 復元ファイルで自動的にanalyzeが送られる
    await waitFor(() => expect(worker.lastPosted("analyze")).toBeTruthy());
    expect(worker.lastPosted("analyze")).toMatchObject({ entry: "shared.ts" });

    act(() => worker.emit({ type: "analyzed", exports: [{ name: "sharedSpec", kind: "spec" }] }));

    // エントリファイルが復元され、specは選択されるが、checkは送られない
    const fileList = screen.getByText("読み込んだファイル").closest("section")!;
    expect(within(fileList).getByText("shared.ts")).toBeTruthy();
    expect(await screen.findByRole("button", { name: "検査する" })).toBeEnabled();
    expect(worker.lastPosted("check")).toBeUndefined();
  });

  test("壊れた共有URLはエラーを表示し、解析は始めない", async () => {
    window.location.hash = "#s=!!!not-valid-base64!!!";
    render(<App />);
    await waitFor(() => expect(screen.getByText("共有URLの読み込みエラー")).toBeTruthy());
    expect(latestWorker().lastPosted("analyze")).toBeUndefined();
  });
});
