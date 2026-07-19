// @vitest-environment jsdom
/**
 * TraceTimelineがchannelsメタデータからメッセージ矢印を描画することの検証。
 * payment-retryの実際の反例トレース(check()の実出力)を入力に使う。
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { check } from "@model-checking/spec";
import { paymentRetrySpec } from "../../../examples/payment-retry.js";
import { TraceTimeline } from "../src/ui/TraceTimeline.js";

afterEach(() => cleanup());

describe("TraceTimeline: channels指定時のメッセージ矢印描画", () => {
  test("送信(inFlight増加)・受信(inFlight減少)のステップに矢印注釈が出る", () => {
    const result = check(paymentRetrySpec);
    expect(result.ok).toBe(false);
    if (result.ok) return;

    render(<TraceTimeline trace={result.trace} selectedIndex={0} onSelect={() => {}} channels={result.channels} />);

    // #1,#3(送信)と#4,#5(受信)でinFlightが変化する。矢印テキストは送受信で区別しないため計4件出現する
    expect(screen.getAllByText("▶ client→server: inFlight")).toHaveLength(4);
    // #4,#5でresponsesが増える(送信)
    expect(screen.getAllByText("▶ server→client: responses")).toHaveLength(2);
  });

  test("channels未指定なら矢印は描画されない(後方互換)", () => {
    const result = check(paymentRetrySpec);
    expect(result.ok).toBe(false);
    if (result.ok) return;

    render(<TraceTimeline trace={result.trace} selectedIndex={0} onSelect={() => {}} />);

    expect(screen.queryByText(/^▶ /)).toBeNull();
  });
});
