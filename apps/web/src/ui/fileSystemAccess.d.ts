/**
 * TypeScriptのlib.dom.d.tsはFile System Access APIを部分的にしか宣言していない
 * (showDirectoryPickerや、ディレクトリの非同期反復(entries())が欠けている)ため、
 * ウォッチモードで使う範囲だけをここで補う。
 */
export {};

declare global {
  interface FileSystemDirectoryHandle {
    readonly kind: "directory";
    entries(): AsyncIterableIterator<[string, FileSystemFileHandle | FileSystemDirectoryHandle]>;
  }

  interface Window {
    showDirectoryPicker?: (options?: { mode?: "read" | "readwrite" }) => Promise<FileSystemDirectoryHandle>;
  }
}
