/**
 * useCheckWorker(check.worker.tsとのやりとりをまとめるReactフック)の状態遷移を、
 * Reactに依存しない純関数として切り出したもの。ロジックはここでvitestから直接テストできる。
 *
 * epochによる世代ガード: `cancel()`(検査/解析実行中に新しいファイルを読み込んだ場合など)は
 * 旧Workerをterminateして新Workerを生成するが、旧Workerが送信済みだったメッセージ
 * (`analyzed`/`progress`/`result`/`error`)がterminate後に遅延して届くことがある
 * (Worker.terminate()はメッセージ配信タイミングを厳密には保証しない)。
 * これを画面に反映してしまうと、直前に読み込んだ「新しいファイル」に対して
 * 「古いファイル」の解析結果・検査結果が表示される事故につながる。
 *
 * 対策として、Workerインスタンスを生成し直すたびにepochを1つ進め、そのepoch値を
 * 生成したWorkerの `message` ハンドラにクロージャで固定して持たせる(useCheckWorker.ts参照)。
 * `worker-message` アクションはこのepochを一緒に運び、reducerは
 * 現在のstate.epochと一致する場合のみメッセージを適用する。一致しなければ
 * (=そのメッセージは既に破棄されたWorld世代から来た)何もせず無視する。
 */
import type { CheckResult, ModelCheckResult } from "@model-checking/spec";
import type { ErrorPhase, SourceLocation, WorkerResponse } from "../core/protocol.js";
import type { DetectedExport } from "../core/detect.js";

export type WorkerError = { phase: ErrorPhase; message: string; location?: SourceLocation };

/** kindを見れば状態機械の反例トレース(result.trace)なのかデータモデルの反例インスタンス
 *  (result.instance)なのかをUI側で迷わず分岐できるようにするタグ付きユニオン */
export type CheckOrModelResult =
  | { kind: "spec"; result: CheckResult<unknown> }
  | { kind: "model"; result: ModelCheckResult };

export type CheckWorkerState = {
  /** Workerインスタンスの世代。cancel()のたびに1つ進む */
  epoch: number;
  workerReady: boolean;
  analyzing: boolean;
  /** 解析結果のエクスポート一覧(Spec形・ModelDef形を種別付きで) */
  exports: DetectedExport[] | null;
  checking: boolean;
  statesExplored: number;
  result: CheckOrModelResult | null;
  error: WorkerError | null;
};

export const initialCheckWorkerState: CheckWorkerState = {
  epoch: 0,
  workerReady: false,
  analyzing: false,
  exports: null,
  checking: false,
  statesExplored: 0,
  result: null,
  error: null,
};

export type CheckWorkerAction =
  /** analyzeメッセージ送信直前: 前回の解析・検査結果をクリアして進捗表示を始める */
  | { type: "analyze-start" }
  /** checkメッセージ送信直前: 前回の検査結果をクリアして進捗表示を始める */
  | { type: "check-start" }
  /** キャンセル: Workerを再生成するため、epochを進めwokerReadyを含め初期状態に戻す */
  | { type: "cancel" }
  /** 新しい仕様ファイルの読み込み(何も実行中でない場合): Worker自体は生きているので
   *  workerReady・epochは維持し、それ以外(解析・検査結果)だけを初期状態に戻す */
  | { type: "reset" }
  /** Workerからのメッセージ受信。epochはメッセージを送ってきたWorkerインスタンスの世代 */
  | { type: "worker-message"; message: WorkerResponse; epoch: number };

export function checkWorkerReducer(state: CheckWorkerState, action: CheckWorkerAction): CheckWorkerState {
  switch (action.type) {
    case "analyze-start":
      return { ...state, analyzing: true, exports: null, result: null, error: null, statesExplored: 0 };
    case "check-start":
      return { ...state, checking: true, result: null, error: null, statesExplored: 0 };
    case "cancel":
      return { ...initialCheckWorkerState, epoch: state.epoch + 1 };
    case "reset":
      return { ...initialCheckWorkerState, epoch: state.epoch, workerReady: state.workerReady };
    case "worker-message":
      if (action.epoch !== state.epoch) return state; // 旧世代のWorkerから遅延して届いたメッセージは無視する(世代ガード)
      return applyWorkerMessage(state, action.message);
    default:
      return state;
  }
}

function applyWorkerMessage(state: CheckWorkerState, message: WorkerResponse): CheckWorkerState {
  switch (message.type) {
    case "ready":
      return { ...state, workerReady: true };
    case "analyzed":
      return { ...state, analyzing: false, exports: message.exports, error: null };
    case "progress":
      return { ...state, statesExplored: message.statesExplored };
    case "result":
      // message.kindで分岐して構築することで、kindとresultの対応関係をTypeScriptに追跡させる
      // (分割代入した2つのプロパティをそのまま組み直すと、対応関係の相関が失われて型エラーになる)
      return {
        ...state,
        checking: false,
        result:
          message.kind === "spec"
            ? { kind: "spec", result: message.result }
            : { kind: "model", result: message.result },
      };
    case "error":
      return {
        ...state,
        analyzing: false,
        checking: false,
        error: { phase: message.phase, message: message.message, location: message.location },
      };
    default:
      return state;
  }
}
