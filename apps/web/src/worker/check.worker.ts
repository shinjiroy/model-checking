/**
 * 検査パイプライン(esbuild-wasmバンドル→実行→check/checkModel)をすべてここで実行する。
 * メインスレッドはこのWorkerとprotocol.tsの型でのみやりとりし、UIをブロックしない。
 */
import { initialize, build } from "esbuild-wasm";
import wasmURL from "esbuild-wasm/esbuild.wasm?url";
import { check, checkModel, type ModelDef, type Spec } from "@model-checking/spec";
import { bundleSpec, type EsbuildLike } from "../core/bundle.js";
import { executeBundle } from "../core/execute.js";
import { detectExports, type DetectedExport } from "../core/detect.js";
import { mapExecutionError } from "../core/errormap.js";
import { specSources } from "./specSources.js";
import type { WorkerRequest, WorkerResponse } from "../core/protocol.js";

// esbuild-wasmの型はEsbuildLikeより厳密なため構造的な代入検査は素通りしない。
// 実行時にはAPI互換(build関数を持つオブジェクト)であることをbundle.ts側の契約として明示的にキャストする
const esbuildApi = { build } as unknown as EsbuildLike;

/** 直近のanalyze結果。checkはこれに対して実行する */
type AnalyzedModule = {
  bundledCode: string;
  moduleExports: Record<string, unknown>;
  exports: DetectedExport[];
};

let analyzed: AnalyzedModule | null = null;

function post(message: WorkerResponse): void {
  postMessage(message);
}

async function handleAnalyze(files: Record<string, string>, entry: string): Promise<void> {
  analyzed = null;

  const bundled = await bundleSpec(esbuildApi, files, entry, specSources);
  if (!bundled.ok) {
    const [first] = bundled.errors;
    post({
      type: "error",
      phase: "bundle",
      message: first?.message ?? "バンドルに失敗しました",
      location:
        first?.file !== undefined && first.line !== undefined && first.column !== undefined
          ? { file: first.file, line: first.line, column: first.column }
          : undefined,
    });
    return;
  }

  const executed = executeBundle(bundled.code, "__specModule__");
  if (!executed.ok) {
    const mapped = mapExecutionError(executed.error, bundled.code);
    post({
      type: "error",
      phase: "execute",
      message: mapped.message,
      location: mapped.location ?? undefined,
    });
    return;
  }

  const exportsFound = detectExports(executed.moduleExports);
  if (exportsFound.length === 0) {
    post({
      type: "error",
      phase: "execute",
      message: "defineSpecまたはdefineModelの結果がexportされていません",
    });
    return;
  }

  analyzed = { bundledCode: bundled.code, moduleExports: executed.moduleExports, exports: exportsFound };
  post({ type: "analyzed", exports: exportsFound });
}

/**
 * 主スレッド側(App.tsx)はanalyzing/checking中の新しいanalyze要求を極力このWorkerに
 * 送らないよう直列化しているが、念のためWorker側でも直列化する: 実行中に届いたanalyzeは
 * 「後着の最新1件だけ」を保留し、実行中のものが終わり次第それを実行する
 * (複数件保留しても最新のファイル内容だけが意味を持つため、古い保留分は上書きで捨てる)
 */
let analyzeInFlight = false;
let pendingAnalyzeRequest: { files: Record<string, string>; entry: string } | null = null;

async function runAnalyzeQueue(files: Record<string, string>, entry: string): Promise<void> {
  if (analyzeInFlight) {
    pendingAnalyzeRequest = { files, entry };
    return;
  }
  analyzeInFlight = true;
  try {
    await handleAnalyze(files, entry);
  } finally {
    analyzeInFlight = false;
  }

  const next = pendingAnalyzeRequest;
  if (next) {
    pendingAnalyzeRequest = null;
    await runAnalyzeQueue(next.files, next.entry);
  }
}

const PROGRESS_THROTTLE_MS = 100;

function handleCheck(exportName: string, maxStates: number): void {
  if (!analyzed) {
    post({ type: "error", phase: "check", message: "先に仕様の解析(analyze)を実行してください" });
    return;
  }

  const found = analyzed.exports.find((e) => e.name === exportName);
  const candidate = analyzed.moduleExports[exportName];
  if (!found || candidate === undefined) {
    post({
      type: "error",
      phase: "check",
      message: `指定されたエクスポート ${exportName} が解析結果に見つかりません`,
    });
    return;
  }

  let lastPostedAt = 0;
  const onProgress = (statesExplored: number): void => {
    const now = Date.now();
    if (now - lastPostedAt < PROGRESS_THROTTLE_MS) return;
    lastPostedAt = now;
    post({ type: "progress", statesExplored });
  };

  try {
    if (found.kind === "spec") {
      const result = check(candidate as Spec<unknown>, { maxStates, onProgress });
      post({ type: "result", kind: "spec", result });
    } else {
      // maxStates入力をmaxInstances(検査するインスタンス数の上限)として流用する
      const result = checkModel(candidate as ModelDef, { maxInstances: maxStates, onProgress });
      post({ type: "result", kind: "model", result });
    }
  } catch (error) {
    const mapped = mapExecutionError(error, analyzed.bundledCode);
    post({
      type: "error",
      phase: "check",
      message: mapped.message,
      location: mapped.location ?? undefined,
    });
  }
}

async function main(): Promise<void> {
  await initialize({ wasmURL });
  post({ type: "ready" });
}

addEventListener("message", (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  if (request.type === "analyze") {
    void runAnalyzeQueue(request.files, request.entry);
  } else if (request.type === "check") {
    handleCheck(request.exportName, request.maxStates);
  }
});

void main();
