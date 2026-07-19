/**
 * ドラッグ&ドロップ・ファイル選択で受け取ったファイル群を `Record<相対パス, ソース>` に変換する。
 * ブラウザのFile/DataTransfer APIに依存するためcore/ではなくui/に置く。
 */

function stripLeadingSlash(path: string): string {
  return path.startsWith("/") ? path.slice(1) : path;
}

function isTsFile(name: string): boolean {
  return name.endsWith(".ts") || name.endsWith(".tsx");
}

function readFileEntry(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

function readDirectoryEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => reader.readEntries(resolve, reject));
}

/** readEntriesは一度に最大100件しか返さない仕様のため、空になるまで繰り返し呼ぶ */
async function readAllDirectoryEntries(directory: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> {
  const reader = directory.createReader();
  const all: FileSystemEntry[] = [];
  for (;;) {
    const batch = await readDirectoryEntries(reader);
    if (batch.length === 0) break;
    all.push(...batch);
  }
  return all;
}

async function walkEntry(entry: FileSystemEntry, out: Record<string, string>): Promise<void> {
  if (entry.isFile) {
    if (!isTsFile(entry.name)) return;
    const file = await readFileEntry(entry as FileSystemFileEntry);
    out[stripLeadingSlash(entry.fullPath)] = await file.text();
    return;
  }
  if (entry.isDirectory) {
    const children = await readAllDirectoryEntries(entry as FileSystemDirectoryEntry);
    await Promise.all(children.map((child) => walkEntry(child, out)));
  }
}

/** ドロップされたDataTransferから.ts/.tsxファイルを(フォルダも再帰的に)読み込む */
export async function readDroppedFiles(dataTransfer: DataTransfer): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const items = Array.from(dataTransfer.items);
  const entries = items
    .map((item) => item.webkitGetAsEntry?.())
    .filter((entry): entry is FileSystemEntry => entry !== null && entry !== undefined);

  if (entries.length > 0) {
    await Promise.all(entries.map((entry) => walkEntry(entry, out)));
    return out;
  }

  // webkitGetAsEntryが使えない環境へのフォールバック: フラットなファイル一覧として扱う
  return readSelectedFiles(dataTransfer.files);
}

/** `<input type="file" multiple>` で選択されたファイル一覧を読み込む */
export async function readSelectedFiles(fileList: FileList): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  await Promise.all(
    Array.from(fileList)
      .filter((file) => isTsFile(file.name))
      .map(async (file) => {
        const path = stripLeadingSlash(file.webkitRelativePath || file.name);
        out[path] = await file.text();
      }),
  );
  return out;
}

/** ソースに defineSpec または defineModel を含む最初のファイルをエントリの初期値として選ぶ */
export function guessEntry(files: Record<string, string>): string | null {
  const names = Object.keys(files).sort();
  for (const name of names) {
    const source = files[name]!;
    if (source.includes("defineSpec") || source.includes("defineModel")) return name;
  }
  return names[0] ?? null;
}
