import { describe, expect, test } from "vitest";
import { decideAnalyzeQueueAction } from "../src/ui/analyzeQueue.js";

describe("decideAnalyzeQueueAction", () => {
  test("解析中はcancelを選ぶ(検査は実行していなくても直列化のためcancelする)", () => {
    expect(decideAnalyzeQueueAction({ analyzing: true, checking: false, workerReady: true })).toBe("cancel");
  });

  test("検査中はcancelを選ぶ", () => {
    expect(decideAnalyzeQueueAction({ analyzing: false, checking: true, workerReady: true })).toBe("cancel");
  });

  test("解析・検査どちらも実行中ならcancelを選ぶ", () => {
    expect(decideAnalyzeQueueAction({ analyzing: true, checking: true, workerReady: true })).toBe("cancel");
  });

  test("何も実行しておらずWorkerが準備できていればflush-nowを選ぶ", () => {
    expect(decideAnalyzeQueueAction({ analyzing: false, checking: false, workerReady: true })).toBe("flush-now");
  });

  test("何も実行していないがWorkerがまだ準備できていなければwaitを選ぶ", () => {
    expect(decideAnalyzeQueueAction({ analyzing: false, checking: false, workerReady: false })).toBe("wait");
  });

  test("workerReadyがfalseでもanalyzing/checking中ならcancelが優先される", () => {
    // (実際にはworkerReady=falseとanalyzing/checking=trueは同時に起きない想定だが、
    // 判断ロジック自体はanalyzing/checkingを優先することを明示しておく)
    expect(decideAnalyzeQueueAction({ analyzing: true, checking: false, workerReady: false })).toBe("cancel");
  });
});
