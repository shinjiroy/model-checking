/**
 * ウォッチモード(保存→自動再検査)の純ロジック。
 *
 * ディレクトリ走査・変更検知そのもの(FileSystemDirectoryHandle依存)はUI層の薄いアダプタ
 * (ui/fsaWatchTarget.ts)に隔離し、ここでは「ファイル一覧を返せるもの」という最小のインターフェース
 * (WatchTarget)の背後でスナップショット比較・差分判定・再読み込みだけを扱う。
 * ポーリングのタイマー(setInterval)自体はUI層(ui/useDirectoryWatch.ts)の責務とする。
 */

/** 監視対象の1ファイル。lastModifiedの比較だけで変更検知し、内容はreadで遅延取得する */
export type WatchFile = {
  path: string;
  lastModified: number;
  read: () => Promise<string>;
};

/** 監視対象。実体(File System Access APIなど)への依存はこのインターフェースの背後に隠す */
export type WatchTarget = {
  listFiles: () => Promise<WatchFile[]>;
};

/** path → lastModified のスナップショット */
export type WatchSnapshot = Record<string, number>;

export type WatchChange =
  | { kind: "added"; path: string }
  | { kind: "changed"; path: string }
  | { kind: "removed"; path: string };

export function toSnapshot(files: WatchFile[]): WatchSnapshot {
  const snapshot: WatchSnapshot = {};
  for (const file of files) snapshot[file.path] = file.lastModified;
  return snapshot;
}

/** 2つのスナップショットを比較し、追加/変更/削除されたファイルパスを返す */
export function diffWatchSnapshot(prev: WatchSnapshot, next: WatchSnapshot): WatchChange[] {
  const changes: WatchChange[] = [];
  for (const path of Object.keys(next)) {
    if (!(path in prev)) changes.push({ kind: "added", path });
    else if (prev[path] !== next[path]) changes.push({ kind: "changed", path });
  }
  for (const path of Object.keys(prev)) {
    if (!(path in next)) changes.push({ kind: "removed", path });
  }
  return changes;
}

export type PollResult =
  | { changed: true; files: Record<string, string>; snapshot: WatchSnapshot; changes: WatchChange[] }
  | { changed: false };

/**
 * 監視対象を1回スキャンし、前回スナップショットと比較する。
 * 変化がなければ `{changed: false}`。変化があれば全ファイルを読み込み直して返す
 * (どのファイルが変わったかに関わらず、常に「読み込んだファイル一式」として扱う設計に合わせて全件読む)
 */
export async function pollWatchTarget(target: WatchTarget, prevSnapshot: WatchSnapshot): Promise<PollResult> {
  const listed = await target.listFiles();
  const nextSnapshot = toSnapshot(listed);
  const changes = diffWatchSnapshot(prevSnapshot, nextSnapshot);
  if (changes.length === 0) return { changed: false };

  const entries = await Promise.all(listed.map(async (file) => [file.path, await file.read()] as const));
  return { changed: true, files: Object.fromEntries(entries), snapshot: nextSnapshot, changes };
}
