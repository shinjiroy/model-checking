/**
 * 利用者のTypeScript仕様ファイルをNodeで実行可能な形にして読み込み、
 * 公開された仕様(defineSpecの戻り値)・データモデル(defineModelの戻り値)を取り出す。
 *
 * 肝は `@model-checking/spec` の import 自己解決。`npx --package=<tarball>` で一時ディレクトリに
 * 展開された状態だと、利用者の仕様ファイルはローカルに `node_modules` を持たないため
 * `import { defineSpec } from "@model-checking/spec"` を解決できない。そこで esbuild の
 * alias で `@model-checking/spec` を CLI 自身のモジュール(dist/index.js)へ向け、バンドルに
 * インライン展開する。Webアプリが apps/web/src/core/bundle.ts で esbuild-wasm を使って
 * 行っているのと同じ発想を Node 側で行う。
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { ModelDef } from "../datamodel/model.js";
import type { Spec } from "../spec.js";

/** esbuild.build 互換の最小API(実行時は本物のesbuild、テストでは注入して差し替える) */
export type EsbuildLike = {
  build: (options: EsbuildBuildOptions) => Promise<EsbuildBuildResult>;
};

export type EsbuildBuildOptions = {
  entryPoints: string[];
  bundle: boolean;
  write: boolean;
  format: "esm";
  platform: "node";
  /** import指定子 → 解決先の絶対パス。`@model-checking/spec` をCLI自身へ向ける */
  alias: Record<string, string>;
  logLevel: "silent";
};

export type EsbuildBuildResult = {
  outputFiles?: { text: string }[];
};

/** 仕様ファイル1つから取り出した検査対象 */
export type LoadedSpec = { name: string; kind: "spec"; value: Spec<unknown> };
export type LoadedModel = { name: string; kind: "model"; value: ModelDef };
export type LoadedTarget = LoadedSpec | LoadedModel;

/** 仕様ファイルを esbuild で単一ESMにバンドルする(@model-checking/spec を specModulePath へエイリアス) */
export async function bundleSpecFile(
  entryPath: string,
  specModulePath: string,
  esbuild: EsbuildLike,
): Promise<string> {
  const result = await esbuild.build({
    entryPoints: [entryPath],
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    alias: { "@model-checking/spec": specModulePath },
    logLevel: "silent",
  });
  const code = result.outputFiles?.[0]?.text;
  if (code === undefined) {
    throw new Error(`仕様ファイルのバンドルに失敗しました: ${entryPath}`);
  }
  return code;
}

/** バンドル済みESMコードを一時ファイル経由で読み込み、モジュールの公開値を返す */
async function importBundledModule(code: string): Promise<Record<string, unknown>> {
  const dir = mkdtempSync(join(tmpdir(), "model-checking-"));
  const file = join(dir, "spec.mjs");
  writeFileSync(file, code);
  try {
    return (await import(pathToFileURL(file).href)) as Record<string, unknown>;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** defineSpec の戻り値らしさ(init と actions を持つ) */
function looksLikeSpec(value: unknown): value is Spec<unknown> {
  return (
    isPlainObject(value) &&
    "init" in value &&
    isPlainObject((value as { actions?: unknown }).actions)
  );
}

/** defineModel の戻り値らしさ(sorts 配列と assertions を持つ) */
function looksLikeModel(value: unknown): value is ModelDef {
  return (
    isPlainObject(value) &&
    Array.isArray((value as { sorts?: unknown }).sorts) &&
    isPlainObject((value as { assertions?: unknown }).assertions)
  );
}

/** モジュールの公開値から検査対象(Spec/ModelDef)を抽出する */
export function extractTargets(module: Record<string, unknown>): LoadedTarget[] {
  const targets: LoadedTarget[] = [];
  for (const [name, value] of Object.entries(module)) {
    if (looksLikeModel(value)) {
      targets.push({ name, kind: "model", value });
    } else if (looksLikeSpec(value)) {
      targets.push({ name, kind: "spec", value });
    }
  }
  return targets;
}

/**
 * 仕様ファイルを読み込み、公開されている検査対象の一覧を返す。
 * `specModulePath` は CLI 自身の `@model-checking/spec` エントリ(dist/index.js)への絶対パス。
 */
export async function loadSpecFile(
  entryPath: string,
  specModulePath: string,
  esbuild: EsbuildLike,
): Promise<LoadedTarget[]> {
  const code = await bundleSpecFile(entryPath, specModulePath, esbuild);
  const module = await importBundledModule(code);
  return extractTargets(module);
}
