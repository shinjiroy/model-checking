import { describe, expect, test } from "vitest";
import {
  checkWorkerReducer,
  initialCheckWorkerState,
  type CheckWorkerState,
} from "../src/ui/checkWorkerReducer.js";
import type { CheckResult } from "@model-checking/spec";
import type { WorkerResponse } from "../src/core/protocol.js";

/** worker-messageアクションを組み立てる。epochは既定でstateの現世代(0)に合わせる */
function message(
  msg: WorkerResponse,
  epoch = 0,
): { type: "worker-message"; message: WorkerResponse; epoch: number } {
  return { type: "worker-message", message: msg, epoch };
}

describe("checkWorkerReducer: analyze→analyzed→check→result の一連の流れ", () => {
  test("ready → analyze-start → analyzed → check-start → progress → result", () => {
    let state: CheckWorkerState = initialCheckWorkerState;
    expect(state.workerReady).toBe(false);

    state = checkWorkerReducer(state, message({ type: "ready" }));
    expect(state.workerReady).toBe(true);

    state = checkWorkerReducer(state, { type: "analyze-start" });
    expect(state.analyzing).toBe(true);
    expect(state.exports).toBeNull();

    state = checkWorkerReducer(state, message({ type: "analyzed", exports: [{ name: "mySpec", kind: "spec" }] }));
    expect(state.analyzing).toBe(false);
    expect(state.exports).toEqual([{ name: "mySpec", kind: "spec" }]);

    state = checkWorkerReducer(state, { type: "check-start" });
    expect(state.checking).toBe(true);
    expect(state.result).toBeNull();
    expect(state.statesExplored).toBe(0);

    state = checkWorkerReducer(state, message({ type: "progress", statesExplored: 1024 }));
    expect(state.statesExplored).toBe(1024);
    expect(state.checking).toBe(true); // 進捗だけではcheckingは終わらない

    const result: CheckResult<unknown> = { ok: true, statesExplored: 2048, complete: true };
    state = checkWorkerReducer(state, message({ type: "result", kind: "spec", result }));
    expect(state.checking).toBe(false);
    expect(state.result).toEqual({ kind: "spec", result });
  });

  test("analyze-start / check-start は前回のresult・error・exportsをクリアする", () => {
    const dirty: CheckWorkerState = {
      epoch: 0,
      workerReady: true,
      analyzing: false,
      exports: [{ name: "old", kind: "spec" }],
      checking: false,
      statesExplored: 999,
      result: { kind: "spec", result: { ok: true, statesExplored: 1, complete: true } },
      error: { phase: "bundle", message: "前回のエラー" },
    };

    const afterAnalyzeStart = checkWorkerReducer(dirty, { type: "analyze-start" });
    expect(afterAnalyzeStart).toMatchObject({
      analyzing: true,
      exports: null,
      result: null,
      error: null,
      statesExplored: 0,
    });
    expect(afterAnalyzeStart.workerReady).toBe(true); // workerReadyは維持される

    const afterCheckStart = checkWorkerReducer(dirty, { type: "check-start" });
    expect(afterCheckStart).toMatchObject({ checking: true, result: null, error: null, statesExplored: 0 });
  });

  test("result: kind='model'のメッセージはCheckOrModelResultとしてkind='model'のまま保持される", () => {
    let state: CheckWorkerState = checkWorkerReducer(initialCheckWorkerState, { type: "check-start" });
    const modelResult = {
      ok: false as const,
      assertion: "onlyOwnerOrAdminCanEdit",
      instance: { atoms: {}, relations: {} },
      instancesChecked: 10,
    };
    state = checkWorkerReducer(state, message({ type: "result", kind: "model", result: modelResult }));
    expect(state.result).toEqual({ kind: "model", result: modelResult });
  });
});

describe("checkWorkerReducer: cancel", () => {
  test("cancel後はworkerReadyも含めて初期状態に戻り、epochが1つ進む(新Workerのreadyを待つ)", () => {
    const running: CheckWorkerState = {
      epoch: 0,
      workerReady: true,
      analyzing: false,
      exports: [{ name: "mySpec", kind: "spec" }],
      checking: true,
      statesExplored: 500_000,
      result: null,
      error: null,
    };

    const state = checkWorkerReducer(running, { type: "cancel" });
    expect(state).toEqual({ ...initialCheckWorkerState, epoch: 1 });
  });

  test("cancelを繰り返すたびにepochが単調に増える", () => {
    let state: CheckWorkerState = initialCheckWorkerState;
    state = checkWorkerReducer(state, { type: "cancel" });
    state = checkWorkerReducer(state, { type: "cancel" });
    state = checkWorkerReducer(state, { type: "cancel" });
    expect(state.epoch).toBe(3);
  });
});

describe("checkWorkerReducer: reset", () => {
  test("resetはworkerReady・epochを維持したまま解析・検査結果だけクリアする", () => {
    const dirty: CheckWorkerState = {
      epoch: 2,
      workerReady: true,
      analyzing: true,
      exports: [{ name: "a", kind: "spec" }, { name: "b", kind: "model" }],
      checking: true,
      statesExplored: 123,
      result: { kind: "spec", result: { ok: false, violation: { kind: "deadlock" }, trace: [], statesExplored: 1 } },
      error: { phase: "check", message: "前回のエラー" },
    };

    const state = checkWorkerReducer(dirty, { type: "reset" });
    expect(state).toEqual({ ...initialCheckWorkerState, epoch: 2, workerReady: true });
  });

  test("workerReadyがfalseのままresetしてもfalseを維持する", () => {
    const state = checkWorkerReducer(initialCheckWorkerState, { type: "reset" });
    expect(state).toEqual(initialCheckWorkerState);
  });
});

describe("checkWorkerReducer: 世代ガード(旧Workerからの遅延メッセージを無視する)", () => {
  test("cancel後、旧epoch(0)のメッセージは適用されない(受け入れ基準1の核: 誤った結果を表示しない)", () => {
    let state: CheckWorkerState = checkWorkerReducer(initialCheckWorkerState, message({ type: "ready" }, 0));
    state = checkWorkerReducer(state, { type: "check-start" });
    expect(state.checking).toBe(true);

    // 検査実行中にcancel()され、Workerが再生成される(epoch: 0 → 1)
    state = checkWorkerReducer(state, { type: "cancel" });
    expect(state.epoch).toBe(1);
    expect(state.checking).toBe(false);

    // 旧Worker(epoch 0)からterminate後に遅延して届いた"result"は無視される
    const staleResult: CheckResult<unknown> = { ok: true, statesExplored: 99, complete: true };
    const afterStale = checkWorkerReducer(state, message({ type: "result", kind: "spec", result: staleResult }, 0));
    expect(afterStale).toEqual(state); // 何も変化しない
    expect(afterStale.result).toBeNull();
  });

  test("cancel後、旧epochの'analyzed'・'error'メッセージも無視される", () => {
    let state: CheckWorkerState = checkWorkerReducer(initialCheckWorkerState, { type: "analyze-start" });
    state = checkWorkerReducer(state, { type: "cancel" }); // epoch: 0 → 1

    const afterStaleAnalyzed = checkWorkerReducer(
      state,
      message({ type: "analyzed", exports: [{ name: "old", kind: "spec" }] }, 0),
    );
    expect(afterStaleAnalyzed.exports).toBeNull();

    const afterStaleError = checkWorkerReducer(
      state,
      message({ type: "error", phase: "bundle", message: "旧ファイルのエラー" }, 0),
    );
    expect(afterStaleError.error).toBeNull();
  });

  test("cancel後、新epoch(1)のメッセージは正しく適用される", () => {
    let state: CheckWorkerState = checkWorkerReducer(initialCheckWorkerState, { type: "cancel" }); // epoch: 1
    state = checkWorkerReducer(state, message({ type: "ready" }, 1));
    expect(state.workerReady).toBe(true);

    state = checkWorkerReducer(state, message({ type: "analyzed", exports: [{ name: "newSpec", kind: "spec" }] }, 1));
    expect(state.exports).toEqual([{ name: "newSpec", kind: "spec" }]);
  });

  test("resetはepochを進めないため、reset前後どちらの'analyzed'も同じepochとして適用される", () => {
    // resetはWorkerを再生成しない(同じWorkerが引き続き使われる)ため、epoch自体は変わらない。
    // 「実行中に読み込んだ新ファイル」への対処はApp.tsx側でreset前にcancel()を選ぶ判断に委ねている
    let state: CheckWorkerState = checkWorkerReducer(initialCheckWorkerState, { type: "analyze-start" });
    state = checkWorkerReducer(state, { type: "reset" });
    expect(state.epoch).toBe(0);

    state = checkWorkerReducer(
      state,
      message({ type: "analyzed", exports: [{ name: "afterReset", kind: "spec" }] }, 0),
    );
    expect(state.exports).toEqual([{ name: "afterReset", kind: "spec" }]);
  });

  test("progressも旧epochなら無視される(打ち切り後に古い進捗表示が一瞬出るのを防ぐ)", () => {
    let state: CheckWorkerState = checkWorkerReducer(initialCheckWorkerState, { type: "check-start" });
    state = checkWorkerReducer(state, { type: "cancel" }); // epoch: 0 → 1

    const afterStaleProgress = checkWorkerReducer(state, message({ type: "progress", statesExplored: 12345 }, 0));
    expect(afterStaleProgress.statesExplored).toBe(0);
  });
});

describe("checkWorkerReducer: error遷移", () => {
  test("bundleフェーズのエラーはanalyzing/checkingを終了させ、location付きで保持する", () => {
    let state = checkWorkerReducer(initialCheckWorkerState, { type: "analyze-start" });
    state = checkWorkerReducer(
      state,
      message({
        type: "error",
        phase: "bundle",
        message: "構文エラー",
        location: { file: "main.ts", line: 3, column: 1 },
      }),
    );

    expect(state.analyzing).toBe(false);
    expect(state.checking).toBe(false);
    expect(state.error).toEqual({
      phase: "bundle",
      message: "構文エラー",
      location: { file: "main.ts", line: 3, column: 1 },
    });
  });

  test("checkフェーズのエラーはlocationなしでも保持できる", () => {
    let state = checkWorkerReducer(initialCheckWorkerState, { type: "check-start" });
    state = checkWorkerReducer(state, message({ type: "error", phase: "check", message: "検査に失敗しました" }));

    expect(state.checking).toBe(false);
    expect(state.error).toEqual({ phase: "check", message: "検査に失敗しました", location: undefined });
  });
});
