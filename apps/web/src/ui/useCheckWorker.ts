/**
 * check.worker.ts とのメッセージのやりとりをReactの状態にまとめるフック。
 * Workerの生成・破棄・再生成(キャンセル)もここで管理する。
 * 状態遷移そのものはcheckWorkerReducer.ts(純関数)に委譲し、ここではWorkerのライフサイクルだけを扱う。
 *
 * epochRef: 生成したWorkerインスタンスの世代番号。cancel()で新Workerを作るたびに+1する。
 * attach()はこの値をクロージャで固定してそのWorkerの`onmessage`に焼き付けるため、
 * (terminate後に遅延して届いた)旧Workerからのメッセージは古いepoch値のままdispatchされ、
 * checkWorkerReducerのworker-messageガードで確実に無視される(詳細はcheckWorkerReducer.ts参照)。
 */
import { useCallback, useEffect, useRef, useReducer } from "react";
import type { WorkerRequest, WorkerResponse } from "../core/protocol.js";
import { checkWorkerReducer, initialCheckWorkerState, type CheckWorkerState } from "./checkWorkerReducer.js";

function createWorker(): Worker {
  return new Worker(new URL("../worker/check.worker.ts", import.meta.url), { type: "module" });
}

export function useCheckWorker(): {
  state: CheckWorkerState;
  analyze: (files: Record<string, string>, entry: string) => void;
  runCheck: (exportName: string, maxStates: number) => void;
  cancel: () => void;
  reset: () => void;
} {
  const workerRef = useRef<Worker | null>(null);
  const epochRef = useRef(0);
  const [state, dispatch] = useReducer(checkWorkerReducer, initialCheckWorkerState);

  const attach = useCallback((worker: Worker, epoch: number) => {
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      dispatch({ type: "worker-message", message: event.data, epoch });
    };
  }, []);

  useEffect(() => {
    const worker = createWorker();
    workerRef.current = worker;
    attach(worker, epochRef.current);
    // クリーンアップ時は常にworkerRef.currentを terminate する。
    // cancel()でWorkerを差し替えていても、closure内のworker変数ではなくrefの現在値を見るため、
    // 差し替え後の最新Workerがきちんと後始末される(古いWorkerが積み上がらない)
    return () => workerRef.current?.terminate();
  }, [attach]);

  const send = useCallback((request: WorkerRequest) => {
    workerRef.current?.postMessage(request);
  }, []);

  const analyze = useCallback(
    (files: Record<string, string>, entry: string) => {
      dispatch({ type: "analyze-start" });
      send({ type: "analyze", files, entry });
    },
    [send],
  );

  const runCheck = useCallback(
    (exportName: string, maxStates: number) => {
      dispatch({ type: "check-start" });
      send({ type: "check", exportName, maxStates });
    },
    [send],
  );

  const cancel = useCallback(() => {
    workerRef.current?.terminate();
    const worker = createWorker();
    workerRef.current = worker;
    epochRef.current += 1;
    attach(worker, epochRef.current);
    dispatch({ type: "cancel" });
  }, [attach]);

  const reset = useCallback(() => {
    dispatch({ type: "reset" });
  }, []);

  return { state, analyze, runCheck, cancel, reset };
}
