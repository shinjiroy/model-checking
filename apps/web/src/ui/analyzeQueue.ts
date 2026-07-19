/**
 * 「新しいファイル一式でanalyzeを実行したい」というリクエストを、Workerの現在の状態
 * (準備中か・解析/検査を実行中か)に応じてどう扱うかを決める純関数。
 *
 * ウォッチモードの変更検知・共有URL復元は、いずれもWorkerに新しいanalyzeを送り込みたいが、
 * 実行中(analyzing/checking)のWorkerに単純に上書きで送ると、Worker側の直列化(check.worker.ts)
 * 頼みになり主スレッド側で「いつ送るべきか」を判断できない。ここでその判断だけを切り出してテストする。
 *
 * - 解析・検査のどちらかが実行中なら "cancel"(実行中の作業を丸ごと無効化し、Workerを再生成する。
 *   世代ガード(checkWorkerReducer.ts)により、旧Workerからの遅延メッセージは新しい結果を上書きしない)
 * - 何も実行中でなく、Workerの準備ができていれば "flush-now"(即座にanalyzeを送ってよい)
 * - Workerがまだ準備できていなければ "wait"(workerReadyになるまで呼び出し側でキューに置いておく)
 */
export type AnalyzeQueueDecision = "cancel" | "flush-now" | "wait";

export type AnalyzeQueueWorkerState = {
  analyzing: boolean;
  checking: boolean;
  workerReady: boolean;
};

export function decideAnalyzeQueueAction(state: AnalyzeQueueWorkerState): AnalyzeQueueDecision {
  if (state.analyzing || state.checking) return "cancel";
  if (state.workerReady) return "flush-now";
  return "wait";
}
