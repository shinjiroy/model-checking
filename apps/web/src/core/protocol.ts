/**
 * メインスレッドとWeb Worker間のメッセージ型定義。
 * 検査パイプライン(esbuild-wasmバンドル→実行→check/checkModel)はすべてWorker内で完結させ、
 * メインスレッドはこの型を通じてUI表示に必要な情報だけを受け取る。
 */
import type { CheckResult, ModelCheckResult } from "@model-checking/spec";
import type { DetectedExport } from "./detect.js";

/** main → worker */
export type WorkerRequest =
  | { type: "analyze"; files: Record<string, string>; entry: string }
  // maxStatesは状態機械のcheck()向けの上限であると同時に、データモデルのcheckModel()向けの
  // maxInstances(検査するインスタンス数の上限)としても流用する(意味はkindに応じて読み替える)
  | { type: "check"; exportName: string; maxStates: number };

/** バンドル・実行時エラーの発生フェーズ */
export type ErrorPhase = "bundle" | "execute" | "check";

/** バンドル済みコード上のエラーを元ソースへマッピングした位置情報 */
export type SourceLocation = {
  file: string;
  line: number;
  column: number;
};

/** worker → main */
export type WorkerResponse =
  | { type: "ready" }
  | { type: "analyzed"; exports: DetectedExport[] }
  | { type: "progress"; statesExplored: number }
  | { type: "result"; kind: "spec"; result: CheckResult<unknown> }
  | { type: "result"; kind: "model"; result: ModelCheckResult }
  | {
      type: "error";
      phase: ErrorPhase;
      message: string;
      location?: SourceLocation;
    };
