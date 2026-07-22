/**
 * CLIの検査対象となる仕様ファイルの列挙。
 * ファイルパスならそのまま、ディレクトリなら配下の `.ts` を再帰的に集める。
 * テストファイル(`*.test.ts` / `*.spec.ts`)と型宣言(`*.d.ts`)は、
 * それ自身が検査対象の仕様を公開しない(vitestを読み込むなど)ため除外する。
 */
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/** ファイルシステムの最小インターフェース(テストで差し替え可能にするため) */
export type FileSystemLike = {
  statIsDirectory: (path: string) => boolean;
  readDir: (path: string) => string[];
};

const defaultFs: FileSystemLike = {
  statIsDirectory: path => statSync(path).isDirectory(),
  readDir: path => readdirSync(path),
};

/** このファイルは仕様ファイルとして読み込む対象か */
export function isSpecFile(name: string): boolean {
  if (!name.endsWith(".ts")) return false;
  if (name.endsWith(".d.ts")) return false;
  if (name.endsWith(".test.ts") || name.endsWith(".spec.ts")) return false;
  return true;
}

/**
 * 指定パス(ファイルまたはディレクトリ)から検査対象の仕様ファイル一覧を返す。
 * ディレクトリは再帰的に走査する。結果はパス順にソートして安定させる。
 */
export function discoverSpecFiles(target: string, fs: FileSystemLike = defaultFs): string[] {
  if (!fs.statIsDirectory(target)) {
    return [target];
  }
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readDir(dir)) {
      if (entry === "node_modules" || entry.startsWith(".")) continue;
      const full = join(dir, entry);
      if (fs.statIsDirectory(full)) {
        walk(full);
      } else if (isSpecFile(entry)) {
        found.push(full);
      }
    }
  };
  walk(target);
  return found.sort();
}
