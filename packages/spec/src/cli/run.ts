/**
 * `check` サブコマンドのオーケストレーション。
 * 対象パスを仕様ファイルへ展開し、各ファイルの公開仕様を検査して整形出力する。
 * 副作用(出力)は print コールバックに、検査ロジックは注入された関数に寄せ、
 * 純粋に近い形でテストできるようにしている。
 */
import { check as defaultCheck } from "../checker.js";
import type { CheckOptions, CheckResult } from "../checker.js";
import { checkModel as defaultCheckModel } from "../datamodel/engine.js";
import type { ModelCheckOptions, ModelCheckResult } from "../datamodel/engine.js";
import type { ModelDef } from "../datamodel/model.js";
import type { Spec } from "../spec.js";
import { discoverSpecFiles } from "./discover.js";
import type { FileSystemLike } from "./discover.js";
import { formatCheckResult, formatModelResult } from "./format.js";
import { loadSpecFile } from "./loadSpecs.js";
import type { EsbuildLike } from "./loadSpecs.js";

export type RunDeps = {
  esbuild: EsbuildLike;
  /** CLI 自身の `@model-checking/spec` エントリ(dist/index.js)への絶対パス */
  specModulePath: string;
  fs?: FileSystemLike;
  check?: (spec: Spec<unknown>, options?: CheckOptions) => CheckResult<unknown>;
  checkModel?: (model: ModelDef, options?: ModelCheckOptions) => ModelCheckResult;
};

export type RunOptions = {
  maxStates?: number;
  print: (line: string) => void;
};

/** 終了コード: 0=反例なし, 1=反例あり, 2=対象なし/読み込み失敗 */
export async function runCheck(
  targets: string[],
  deps: RunDeps,
  options: RunOptions,
): Promise<number> {
  const check = deps.check ?? defaultCheck;
  const checkModel = deps.checkModel ?? defaultCheckModel;
  const { print } = options;

  const files = dedupe(targets.flatMap(t => discoverSpecFiles(t, deps.fs)));
  if (files.length === 0) {
    print("検査対象の仕様ファイルが見つかりません。");
    return 2;
  }

  let hasViolation = false;
  let hasError = false;

  for (const file of files) {
    print(`\n${file}`);
    let loaded;
    try {
      loaded = await loadSpecFile(file, deps.specModulePath, deps.esbuild);
    } catch (err) {
      hasError = true;
      print(`  ✗ 読み込みに失敗: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }

    if (loaded.length === 0) {
      print("  (公開された仕様が見つかりません)");
      continue;
    }

    for (const target of loaded) {
      if (target.kind === "spec") {
        const result = check(target.value, { maxStates: options.maxStates });
        if (!result.ok) hasViolation = true;
        print(formatCheckResult(target.name, result));
      } else {
        const result = checkModel(target.value, { maxInstances: options.maxStates });
        if (!result.ok) hasViolation = true;
        print(formatModelResult(target.name, result));
      }
    }
  }

  if (hasViolation) return 1;
  if (hasError) return 2;
  return 0;
}

function dedupe(items: string[]): string[] {
  return [...new Set(items)];
}
