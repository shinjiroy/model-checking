// @vitest-environment jsdom
/**
 * ディレクトリ選択(ウォッチモード)でのエラー系シナリオを検証する(Issue #13)。
 * 「フォルダを開いて監視」ボタン押下時に showDirectoryPicker や実際の読み込みで
 * 権限拒否(SecurityError)や一般エラーが起きても、App.tsx の handleOpenDirectory が
 * catchしてエラーバナー(role="alert")を表示し、openingDirectory を解除して
 * (ボタンを再度押せる状態に戻し)DropZoneでの手動読み込みへフォールバックできることを確かめる。
 *
 * window.showDirectoryPicker はここでは実物のFile System Access APIではなく、
 * テスト用のフェイク実装を注入する(WatchControlsは supportsFileSystemAccess が
 * trueのときだけ「フォルダを開いて監視」ボタンを描画するため、この注入自体も必須)。
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { installFakeWorker, latestWorker } from "./helpers/fakeWorker.js";

// fsaWatchTarget.ts の supportsFileSystemAccess はモジュール読み込み時に一度だけ
// window.showDirectoryPicker の有無を見て決まる定数のため、App.js を動的importする前に
// (テストごとの差し替えとは別に)ダミー値を設定しておく必要がある。これがないと
// WatchControlsの「フォルダを開いて監視」ボタン自体が描画されない
window.showDirectoryPicker = async () => {
  throw new Error("not configured");
};
const { App } = await import("../src/App.js");

/** entries()が1件のファイルを返し、getFile()で指定のエラーを投げるディレクトリハンドルのフェイク */
function createDirectoryHandleThrowingOnRead(error: unknown): FileSystemDirectoryHandle {
  return {
    kind: "directory",
    name: "guarded",
    async *entries() {
      yield [
        "spec.ts",
        {
          kind: "file",
          async getFile() {
            throw error;
          },
        } as unknown as FileSystemFileHandle,
      ];
    },
  } as unknown as FileSystemDirectoryHandle;
}

beforeEach(() => {
  installFakeWorker();
});

afterEach(() => {
  cleanup();
  delete (globalThis as unknown as { Worker?: unknown }).Worker;
});

/** readyまで進めてから「フォルダを開いて監視」ボタンを押す */
async function openDirectory(): Promise<void> {
  render(<App />);
  const worker = latestWorker();
  act(() => worker.emit({ type: "ready" }));
  const openButton = await screen.findByRole("button", { name: "フォルダを開いて監視" });
  fireEvent.click(openButton);
}

describe("App: ディレクトリ選択のエラー", () => {
  test("showDirectoryPickerがSecurityErrorを投げると『アクセスが拒否されました』バナーが出る", async () => {
    window.showDirectoryPicker = async () => {
      throw new DOMException("Permission denied", "SecurityError");
    };

    await openDirectory();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("フォルダへのアクセスが拒否されました");
  });

  test("フォルダ読み込み中(getFile)にSecurityErrorが起きても同様にバナーが出る", async () => {
    window.showDirectoryPicker = async () =>
      createDirectoryHandleThrowingOnRead(new DOMException("Permission denied", "SecurityError"));

    await openDirectory();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("フォルダへのアクセスが拒否されました");
  });

  test("SecurityError以外の一般エラー時は『読み込みに失敗しました』バナーが出る", async () => {
    window.showDirectoryPicker = async () => {
      throw new Error("disk read failed");
    };

    await openDirectory();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("フォルダの読み込みに失敗しました: disk read failed");
  });

  test("エラー後もopeningDirectoryが解除され、DropZoneでの手動読み込みが引き続き使える", async () => {
    window.showDirectoryPicker = async () => {
      throw new DOMException("Permission denied", "SecurityError");
    };

    await openDirectory();
    await screen.findByRole("alert");

    // ボタンが再び押せる状態(busy=falseでdisabledでない)に戻っている
    const openButton = screen.getByRole("button", { name: "フォルダを開いて監視" });
    expect(openButton).toBeEnabled();

    // DropZoneのデモ読み込みボタン等、手動読み込み手段が引き続き機能する
    const demoButton = screen.getByRole("button", { name: /payment-retry/ });
    fireEvent.click(demoButton);
    await waitFor(() => expect(screen.getByRole("button", { name: "解析する" })).toBeEnabled());
  });
});
