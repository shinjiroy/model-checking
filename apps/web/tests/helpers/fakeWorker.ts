/**
 * useCheckWorker が内部で生成する `new Worker(...)` を差し替えるためのフェイクWorker。
 *
 * useCheckWorker.ts は `new Worker(new URL("../worker/check.worker.ts", import.meta.url), ...)` で
 * Workerを生成するが、jsdom環境にはWorkerが存在しない。テストでは globalThis.Worker をこの
 * フェイクに差し替えることで、実際のWorkerモジュール(esbuild-wasm等)を読み込まずに、
 * 主スレッド側の配線層(App/useCheckWorker)だけをメッセージ駆動で検証できる。
 *
 * emit() はWorkerからメッセージが届いたことを模擬する。React状態更新を伴うため、
 * テスト側で act() でくるんで呼ぶこと。
 */
import type { WorkerRequest, WorkerResponse } from "../../src/core/protocol.js";

export class FakeWorker {
  /** 生成されたインスタンスを生成順に記録する(cancel()で作り直される新世代を追跡するため) */
  static instances: FakeWorker[] = [];

  onmessage: ((ev: MessageEvent<WorkerResponse>) => void) | null = null;
  /** postMessageで送られたリクエストの履歴 */
  readonly posted: WorkerRequest[] = [];
  terminated = false;

  constructor(
    readonly url: unknown,
    readonly options: unknown,
  ) {
    FakeWorker.instances.push(this);
  }

  postMessage(message: WorkerRequest): void {
    this.posted.push(message);
  }

  terminate(): void {
    this.terminated = true;
  }

  /** Workerからメインスレッドへメッセージが届いたことを模擬する */
  emit(message: WorkerResponse): void {
    this.onmessage?.({ data: message } as MessageEvent<WorkerResponse>);
  }

  /** このWorkerが受け取ったリクエストのうち、指定typeの最後のもの */
  lastPosted<T extends WorkerRequest["type"]>(type: T): Extract<WorkerRequest, { type: T }> | undefined {
    for (let i = this.posted.length - 1; i >= 0; i--) {
      const req = this.posted[i]!;
      if (req.type === type) return req as Extract<WorkerRequest, { type: T }>;
    }
    return undefined;
  }
}

/** globalThis.Worker をFakeWorkerに差し替え、インスタンス記録をリセットする。beforeEachで呼ぶ */
export function installFakeWorker(): void {
  FakeWorker.instances = [];
  (globalThis as unknown as { Worker: typeof FakeWorker }).Worker = FakeWorker;
}

/** 最後に生成された(=現世代の)FakeWorker */
export function latestWorker(): FakeWorker {
  const worker = FakeWorker.instances.at(-1);
  if (!worker) throw new Error("FakeWorkerがまだ生成されていません");
  return worker;
}
