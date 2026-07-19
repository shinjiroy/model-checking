// @vitest-environment jsdom
/**
 * useDirectoryWatch のポーリング配線を、フェイクWatchTargetと擬似タイマーで検証する。
 * 変更検知そのもの(スナップショット比較)は watch.test.ts が担うので、ここでは
 * 「初期スナップショットではonChangeを呼ばない」「ポーリングで変更を拾う」
 * 「stop()後に遅延解決したポーリング結果を破棄する(SessionGuard)」というフック固有の配線を見る。
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useDirectoryWatch } from "../src/ui/useDirectoryWatch.js";
import type { WatchFile, WatchTarget } from "../src/core/watch.js";

type Deferred = { promise: Promise<void>; resolve: () => void };
function defer(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/** 内容とmtimeを差し替えられるフェイクWatchTarget。任意でlistFilesをゲートで待たせられる */
function makeFakeTarget() {
  const files = new Map<string, { content: string; mtime: number }>();
  let gate: Deferred | null = null;

  const target: WatchTarget = {
    async listFiles(): Promise<WatchFile[]> {
      if (gate) await gate.promise;
      return [...files.entries()].map(([path, f]) => ({
        path,
        lastModified: f.mtime,
        size: f.content.length,
        read: async () => files.get(path)!.content,
      }));
    },
  };

  return {
    target,
    set(path: string, content: string, mtime: number) {
      files.set(path, { content, mtime });
    },
    /** 次回以降のlistFilesを待たせるゲートを設置し、解放関数を返す */
    openGate(): () => void {
      const d = defer();
      gate = d;
      return () => {
        gate = null;
        d.resolve();
      };
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useDirectoryWatch: ポーリングによる変更検知", () => {
  test("start()は初期スナップショットを取るがonChangeは呼ばず、dirNameを設定する", async () => {
    const onChange = vi.fn();
    const fake = makeFakeTarget();
    fake.set("main.ts", "v1", 1000);

    const { result } = renderHook(() => useDirectoryWatch(onChange));
    await act(async () => {
      await result.current.start("proj", fake.target);
    });

    expect(result.current.dirName).toBe("proj");
    expect(onChange).not.toHaveBeenCalled();
  });

  test("ファイルが変わると次のポーリングでonChangeが最新の内容で呼ばれる", async () => {
    const onChange = vi.fn();
    const fake = makeFakeTarget();
    fake.set("main.ts", "v1", 1000);

    const { result } = renderHook(() => useDirectoryWatch(onChange));
    await act(async () => {
      await result.current.start("proj", fake.target);
    });

    fake.set("main.ts", "v2", 2000); // 保存された(mtime更新)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ "main.ts": "v2" });
  });

  test("変更がなければポーリングしてもonChangeは呼ばれない", async () => {
    const onChange = vi.fn();
    const fake = makeFakeTarget();
    fake.set("main.ts", "v1", 1000);

    const { result } = renderHook(() => useDirectoryWatch(onChange));
    await act(async () => {
      await result.current.start("proj", fake.target);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000); // 3回ポーリングしても変化なし
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  test("追加ファイルもポーリングで検知する", async () => {
    const onChange = vi.fn();
    const fake = makeFakeTarget();
    fake.set("main.ts", "v1", 1000);

    const { result } = renderHook(() => useDirectoryWatch(onChange));
    await act(async () => {
      await result.current.start("proj", fake.target);
    });

    fake.set("helper.ts", "h1", 1500);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(onChange).toHaveBeenCalledWith({ "main.ts": "v1", "helper.ts": "h1" });
  });
});

describe("useDirectoryWatch: 停止とセッションガード", () => {
  test("stop()はdirNameをクリアし、以降のポーリングを止める", async () => {
    const onChange = vi.fn();
    const fake = makeFakeTarget();
    fake.set("main.ts", "v1", 1000);

    const { result } = renderHook(() => useDirectoryWatch(onChange));
    await act(async () => {
      await result.current.start("proj", fake.target);
    });

    act(() => result.current.stop());
    expect(result.current.dirName).toBeNull();

    fake.set("main.ts", "v2", 2000);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(onChange).not.toHaveBeenCalled(); // 停止後は変更があっても拾わない
  });

  test("ポーリング中にstop()されたら、遅延解決したポーリング結果は破棄される(SessionGuard)", async () => {
    const onChange = vi.fn();
    const fake = makeFakeTarget();
    fake.set("main.ts", "v1", 1000);

    const { result } = renderHook(() => useDirectoryWatch(onChange));
    await act(async () => {
      await result.current.start("proj", fake.target);
    });

    // 変更を仕込み、次のlistFiles(ポーリング)をゲートで止める
    fake.set("main.ts", "v2", 2000);
    const release = fake.openGate();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000); // ポーリング開始(listFilesはゲートで保留)
    });
    expect(onChange).not.toHaveBeenCalled();

    // ポーリングが解決する前に停止する
    act(() => result.current.stop());

    // ゲートを解放し、保留していたポーリングを完了させる
    await act(async () => {
      release();
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(onChange).not.toHaveBeenCalled(); // 停止済みセッションの結果なので適用されない
  });
});
