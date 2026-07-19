/**
 * File System Access API(FileSystemDirectoryHandle)を core/watch.ts の WatchTarget
 * インターフェースへ橋渡しするアダプタ。ブラウザAPI依存はここに閉じ込め、
 * 実際の走査・変更検知ロジックはcore/watch.tsの純関数(pollWatchTarget等)に任せる。
 */
import type { WatchFile, WatchTarget } from "../core/watch.js";

/** Chrome/Edge系などFile System Access APIに対応しているブラウザかどうか */
export const supportsFileSystemAccess: boolean =
  typeof window !== "undefined" && "showDirectoryPicker" in window && Boolean(window.showDirectoryPicker);

function isTsFile(name: string): boolean {
  return name.endsWith(".ts") || name.endsWith(".tsx");
}

/** node_modulesや`.`始まりのディレクトリ(.git等)は除外する */
function shouldSkipDirectory(name: string): boolean {
  return name === "node_modules" || name.startsWith(".");
}

async function collect(dir: FileSystemDirectoryHandle, prefix: string, out: WatchFile[]): Promise<void> {
  for await (const [name, handle] of dir.entries()) {
    const path = prefix ? `${prefix}/${name}` : name;
    if (handle.kind === "directory") {
      if (shouldSkipDirectory(name)) continue;
      // eslint-disable-next-line no-await-in-loop -- ディレクトリツリーを順に辿る必要がある
      await collect(handle, path, out);
      continue;
    }
    if (!isTsFile(name)) continue;
    // eslint-disable-next-line no-await-in-loop -- lastModifiedを得るためにgetFile()が要る
    const file = await handle.getFile();
    out.push({
      path,
      lastModified: file.lastModified,
      read: async () => {
        // 変更検知後の実読み込み時点で改めて最新のFileを取得する(getFile()呼び出し後に
        // ディスク上のファイルが変わっても、そのFileオブジェクト自体は当時のスナップショットのため)
        const fresh = await handle.getFile();
        return fresh.text();
      },
    });
  }
}

export function createFsaWatchTarget(root: FileSystemDirectoryHandle): WatchTarget {
  return {
    async listFiles() {
      const out: WatchFile[] = [];
      await collect(root, "", out);
      return out;
    },
  };
}

/** WatchTargetの全ファイルを一度読み込み、通常のファイル読み込みと同じ Record<path, source> 形にする */
export async function readAllFromWatchTarget(target: WatchTarget): Promise<Record<string, string>> {
  const files = await target.listFiles();
  const entries = await Promise.all(files.map(async (file) => [file.path, await file.read()] as const));
  return Object.fromEntries(entries);
}

/** ユーザーにフォルダを選ばせ、WatchTargetとフォルダ名を返す。選択キャンセル時はnull */
export async function pickDirectoryWatchTarget(): Promise<{ name: string; target: WatchTarget } | null> {
  if (!window.showDirectoryPicker) return null;
  try {
    const handle = await window.showDirectoryPicker({ mode: "read" });
    return { name: handle.name, target: createFsaWatchTarget(handle) };
  } catch (error) {
    // ユーザーがピッカーをキャンセルした場合(AbortError)は何もしない
    if (error instanceof DOMException && error.name === "AbortError") return null;
    throw error;
  }
}
