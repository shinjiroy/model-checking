#!/usr/bin/env node
/**
 * `model-checking` CLI。テストを書かずに手元で仕様をすぐ検査するための入口。
 *
 * 使い方:
 *   model-checking check specs/                       ディレクトリ配下の仕様をすべて検査
 *   model-checking check specs/order.ts --max-states 500000
 *
 * 違反(反例)検出時は非ゼロ終了するため、CI でもそのまま落とせる。
 * vitest 経由の `npm run check` は置き換えず併存させる位置づけ
 * (CLI=手元で素早く、vitest=CIで退行を止める)。
 */
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import { runCheck } from "./cli/run.js";

const USAGE = `使い方:
  model-checking check <ファイル|ディレクトリ> [...] [--max-states <数>]

例:
  model-checking check specs/
  model-checking check specs/order.ts --max-states 500000`;

export type ParsedArgs =
  | { command: "check"; targets: string[]; maxStates?: number }
  | { command: "help" }
  | { command: "error"; message: string };

/** argv(node と実行ファイルを除いた残り)を解釈する */
export function parseArgs(argv: string[]): ParsedArgs {
  const [command, ...rest] = argv;
  if (command === undefined || command === "help" || command === "--help" || command === "-h") {
    return { command: "help" };
  }
  if (command !== "check") {
    return { command: "error", message: `未知のサブコマンドです: ${command}` };
  }

  const targets: string[] = [];
  let maxStates: number | undefined;
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]!;
    if (arg === "--max-states") {
      const value = rest[++i];
      const parsed = value === undefined ? NaN : Number(value);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        return { command: "error", message: `--max-states には正の整数を指定してください: ${value ?? ""}` };
      }
      maxStates = parsed;
    } else if (arg.startsWith("--max-states=")) {
      const parsed = Number(arg.slice("--max-states=".length));
      if (!Number.isInteger(parsed) || parsed <= 0) {
        return { command: "error", message: `--max-states には正の整数を指定してください` };
      }
      maxStates = parsed;
    } else {
      targets.push(arg);
    }
  }

  if (targets.length === 0) {
    return { command: "error", message: "検査対象のファイルまたはディレクトリを指定してください" };
  }
  return { command: "check", targets, ...(maxStates !== undefined && { maxStates }) };
}

export async function main(argv: string[]): Promise<number> {
  const parsed = parseArgs(argv);
  if (parsed.command === "help") {
    console.log(USAGE);
    return 0;
  }
  if (parsed.command === "error") {
    console.error(parsed.message);
    console.error(`\n${USAGE}`);
    return 2;
  }

  // ビルド後は dist/cli.js と dist/index.js が並ぶ。利用者の仕様ファイルが解決できない
  // `@model-checking/spec` を、この CLI 自身のエントリへエイリアスする。
  const specModulePath = fileURLToPath(new URL("./index.js", import.meta.url));

  return runCheck(
    parsed.targets,
    { esbuild, specModulePath },
    { print: line => console.log(line), ...(parsed.maxStates !== undefined && { maxStates: parsed.maxStates }) },
  );
}

/**
 * このモジュールが node のエントリとして直接実行されたか。
 * bin は `node_modules/.bin/model-checking` → `dist/cli.js` のシンボリックリンクで置かれるため、
 * `process.argv[1]`(リンク側のパス)と `import.meta.url`(Nodeが返す実体パス)は一致しない。
 * 両者を実パスに正規化して比較する。テストからの import 時は argv[1] がテストランナーになり一致しない。
 */
function isDirectRun(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(entry) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

// 直接実行された時だけ動かす(テストからの import では走らせない)
if (isDirectRun()) {
  main(process.argv.slice(2)).then(
    code => process.exit(code),
    err => {
      console.error(err);
      process.exit(2);
    },
  );
}
