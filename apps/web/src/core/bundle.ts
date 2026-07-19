/**
 * 仕様ファイル群をesbuildでブラウザ実行可能な単一のIIFEにバンドルする。
 *
 * esbuildのAPIオブジェクト(`build`関数を持つもの)を引数で受け取ることで、
 * Worker上ではesbuild-wasmを、テストではnode向けのネイティブesbuildを注入できるようにし、
 * バンドルロジック自体はブラウザAPIに依存しないnodeで高速にテストできるようにしている。
 */

/** `esbuild.build` 互換のAPI。esbuild-wasm/ネイティブesbuildの両方を満たす最小の形 */
export type EsbuildLike = {
  build: (options: EsbuildBuildOptions) => Promise<EsbuildBuildResult>;
};

// esbuildの型を直接importせず、利用する範囲だけの最小構造を自前定義する
// (esbuild-wasmとesbuildのバージョンを揃えていれば構造的に互換)
export type EsbuildBuildOptions = {
  entryPoints: string[];
  bundle: boolean;
  write: boolean;
  format: string;
  globalName: string;
  sourcemap: string;
  banner: Record<string, string>;
  logLevel: string;
  plugins: EsbuildPlugin[];
};

export type EsbuildBuildResult = {
  outputFiles?: { text: string }[];
};

export type EsbuildMessageLocation = {
  file: string;
  line: number;
  column: number;
} | null;

export type EsbuildMessage = {
  text: string;
  location?: EsbuildMessageLocation;
};

export type EsbuildBuildFailure = {
  errors: EsbuildMessage[];
};

export type EsbuildOnResolveArgs = {
  path: string;
  importer: string;
  namespace: string;
  kind: string;
};

export type EsbuildOnResolveResult = {
  path?: string;
  namespace?: string;
  errors?: EsbuildMessage[];
};

export type EsbuildOnLoadArgs = {
  path: string;
  namespace: string;
};

export type EsbuildOnLoadResult = {
  contents?: string;
  loader?: string;
  resolveDir?: string;
  errors?: EsbuildMessage[];
};

export type EsbuildPluginBuild = {
  onResolve: (
    options: { filter: RegExp; namespace?: string },
    callback: (args: EsbuildOnResolveArgs) => EsbuildOnResolveResult | undefined,
  ) => void;
  onLoad: (
    options: { filter: RegExp; namespace?: string },
    callback: (args: EsbuildOnLoadArgs) => EsbuildOnLoadResult | undefined,
  ) => void;
};

export type EsbuildPlugin = {
  name: string;
  setup: (build: EsbuildPluginBuild) => void;
};

/**
 * `@model-checking/spec` のソース(apps/webから`?raw`で取り込んだテキスト)。
 * キーはパッケージのsrc/からの相対パス(例: "index.ts", "datamodel/model.ts")
 */
export type SpecSources = Record<string, string>;

/**
 * バンドルに仮想モジュールとして必要な `@model-checking/spec` のソースファイル一覧。
 * `packages/spec/src/index.ts` (とそこから辿れる全ファイル) が実際にimportしているファイルと
 * 一致している必要がある。ここに載っているのに worker/specSources.ts や
 * tests/helpers/specSources.ts に登録し忘れると、そのファイルをimportする仕様
 * (例: defineModelを使うもの)だけがバンドル時に失敗する — 気づきにくい登録漏れを
 * 早期に検知するため、bundleSpec呼び出し時にこの一覧との整合性を確認する
 */
export const REQUIRED_SPEC_SOURCE_PATHS = [
  "index.ts",
  "spec.ts",
  "checker.ts",
  "canonical.ts",
  "datamodel/index.ts",
  "datamodel/formula.ts",
  "datamodel/model.ts",
  "datamodel/engine.ts",
] as const;

export type BundleError = {
  message: string;
  file?: string;
  line?: number;
  column?: number;
};

export type BundleResult = { ok: true; code: string } | { ok: false; errors: BundleError[] };

const SPEC_PACKAGE_NAME = "@model-checking/spec";
/** esbuildの仮想namespace名。ソースマップ上は `namespace:path` の形で現れる(errormap.tsで剥がす) */
export const SPEC_NAMESPACE = "spec-source";
export const USER_NAMESPACE = "user-file";

const EXTERNAL_IMPORT_MESSAGE =
  "ブラウザ内検査では外部ライブラリをインポートできません。インポートできるのは @model-checking/spec と相対パスのみです";

/** specSourcesにREQUIRED_SPEC_SOURCE_PATHSの全キーが揃っているか確認し、不足分を返す(空なら揃っている) */
export function findMissingSpecSources(specSources: SpecSources): string[] {
  return REQUIRED_SPEC_SOURCE_PATHS.filter((path) => !(path in specSources));
}

/**
 * files(相対パス→ソース)とentry(エントリのパス)からIIFEバンドルを生成する。
 * @model-checking/spec へのインポートはspecSourcesの仮想モジュールへ解決する。
 */
export async function bundleSpec(
  esbuild: EsbuildLike,
  files: Record<string, string>,
  entry: string,
  specSources: SpecSources,
  globalName = "__specModule__",
): Promise<BundleResult> {
  const missing = findMissingSpecSources(specSources);
  if (missing.length > 0) {
    return {
      ok: false,
      errors: [
        {
          message:
            `internal: specSourcesに必要なファイルが登録されていません: ${missing.join(", ")}` +
            "(worker/specSources.ts またはテストヘルパーの登録漏れです)",
        },
      ],
    };
  }

  try {
    const result = await esbuild.build({
      entryPoints: [entry],
      bundle: true,
      write: false,
      format: "iife",
      globalName,
      sourcemap: "inline",
      // "use strict"を先頭に置くことで、frozen状態への破壊的変更をTypeErrorとして検出できるようにする。
      // banner注入時、esbuildは生成コードの行ズレをsourcemapに反映してくれる
      banner: { js: '"use strict";' },
      logLevel: "silent",
      plugins: [virtualFsPlugin(files, specSources)],
    });
    const code = result.outputFiles?.[0]?.text ?? "";
    return { ok: true, code };
  } catch (error) {
    return { ok: false, errors: toBundleErrors(error) };
  }
}

function toBundleErrors(error: unknown): BundleError[] {
  const failure = error as Partial<EsbuildBuildFailure> | undefined;
  const messages = failure?.errors;
  if (!messages || messages.length === 0) {
    return [{ message: error instanceof Error ? error.message : String(error) }];
  }
  return messages.map(messageToBundleError);
}

function messageToBundleError(message: EsbuildMessage): BundleError {
  const location = message.location;
  if (!location) return { message: message.text };
  return {
    message: message.text,
    file: stripNamespacePrefix(location.file),
    line: location.line,
    column: location.column,
  };
}

/** esbuildはカスタムnamespaceのファイルを `namespace:path` 形式で表すため、ユーザー向けには剥がす */
function stripNamespacePrefix(file: string): string {
  for (const namespace of [USER_NAMESPACE, SPEC_NAMESPACE]) {
    const prefix = `${namespace}:`;
    if (file.startsWith(prefix)) return file.slice(prefix.length);
  }
  return file;
}

function virtualFsPlugin(files: Record<string, string>, specSources: SpecSources): EsbuildPlugin {
  return {
    name: "virtual-fs",
    setup(build) {
      build.onResolve({ filter: /.*/ }, (args) => {
        if (args.namespace === SPEC_NAMESPACE) {
          return resolveSpecImport(args.importer, args.path);
        }

        if (args.path === SPEC_PACKAGE_NAME) {
          return { path: "index.ts", namespace: SPEC_NAMESPACE };
        }

        if (args.kind === "entry-point") {
          const resolved = resolveUserPath("", args.path, files);
          if (resolved.kind === "found") return { path: resolved.path, namespace: USER_NAMESPACE };
          if (resolved.kind === "escaped") {
            return { errors: [{ text: `仕様フォルダの外は参照できません: ${args.path}` }] };
          }
          return { errors: [{ text: `エントリファイルが見つかりません: ${args.path}` }] };
        }

        if (args.path.startsWith(".") || args.path.startsWith("/")) {
          const resolved = resolveUserPath(args.importer, args.path, files);
          if (resolved.kind === "found") return { path: resolved.path, namespace: USER_NAMESPACE };
          if (resolved.kind === "escaped") {
            return { errors: [{ text: `仕様フォルダの外は参照できません: ${args.path}(${args.importer}から参照)` }] };
          }
          return { errors: [{ text: `ファイルが見つかりません: ${args.path}(${args.importer}から参照)` }] };
        }

        return { errors: [{ text: EXTERNAL_IMPORT_MESSAGE }] };
      });

      build.onLoad({ filter: /.*/, namespace: USER_NAMESPACE }, (args) => {
        const contents = files[args.path];
        if (contents === undefined) {
          return { errors: [{ text: `ファイルが見つかりません: ${args.path}` }] };
        }
        return { contents, loader: loaderFor(args.path), resolveDir: "/" };
      });

      build.onLoad({ filter: /.*/, namespace: SPEC_NAMESPACE }, (args) => {
        const contents = specSources[args.path];
        if (contents === undefined) {
          return { errors: [{ text: `internal: @model-checking/specの仮想モジュールが見つかりません: ${args.path}` }] };
        }
        return { contents, loader: "ts", resolveDir: "/" };
      });
    },
  };
}

/**
 * specソース内の相対 `./xxx.js` / `../xxx.js` インポートを仮想namespace内の `.ts` ソースへ解決する。
 * `datamodel/`のようなサブディレクトリを跨ぐ相対importにも対応するため、importerからの相対パス解決
 * (resolveUserPathと同じnormalizePath)を使う
 */
function resolveSpecImport(importer: string, path: string): EsbuildOnResolveResult {
  if (!path.startsWith("./") && !path.startsWith("../")) {
    return { errors: [{ text: EXTERNAL_IMPORT_MESSAGE }] };
  }
  const importerDir = importer.includes("/") ? importer.slice(0, importer.lastIndexOf("/")) : "";
  const joined = normalizePath(importerDir ? `${importerDir}/${path}` : path);
  if (joined === null) {
    return { errors: [{ text: `internal: @model-checking/spec内のimportがルートを越えています: ${path}` }] };
  }
  const resolved = joined.replace(/\.js$/, ".ts");
  return { path: resolved, namespace: SPEC_NAMESPACE };
}

function loaderFor(path: string): string {
  if (path.endsWith(".tsx")) return "tsx";
  if (path.endsWith(".jsx")) return "jsx";
  if (path.endsWith(".json")) return "json";
  return "ts";
}

/** resolveUserPathの結果。escapedは `../` で仕様フォルダのルートより上へ出ようとしたことを表す */
type ResolveOutcome = { kind: "found"; path: string } | { kind: "escaped" } | { kind: "not-found" };

/** importerとspecifierからfiles内のキーを解決する(拡張子省略・index解決に対応) */
function resolveUserPath(importer: string, specifier: string, files: Record<string, string>): ResolveOutcome {
  const importerDir = importer.includes("/") ? importer.slice(0, importer.lastIndexOf("/")) : "";
  const joined = normalizePath(importerDir ? `${importerDir}/${specifier}` : specifier);
  if (joined === null) return { kind: "escaped" };

  // "./foo.js" は(TSの慣習に合わせ)"foo.ts" を指すとみなす。拡張子なし・直接指定にも対応する
  const withoutExt = joined.replace(/\.(ts|tsx|js|jsx)$/, "");
  const candidates = [
    joined,
    `${withoutExt}.ts`,
    `${withoutExt}.tsx`,
    `${withoutExt}/index.ts`,
    `${withoutExt}/index.tsx`,
  ];
  for (const candidate of candidates) {
    if (Object.prototype.hasOwnProperty.call(files, candidate)) return { kind: "found", path: candidate };
  }
  return { kind: "not-found" };
}

/**
 * パスセグメントを解決する。`..` で仮想ルート(files内の相対パス空間の最上位)より上へ
 * 出ようとした場合はクランプせず null を返し、呼び出し側でエラーにする
 */
function normalizePath(path: string): string | null {
  const stack: string[] = [];
  for (const part of path.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (stack.length === 0) return null;
      stack.pop();
    } else {
      stack.push(part);
    }
  }
  return stack.join("/");
}
