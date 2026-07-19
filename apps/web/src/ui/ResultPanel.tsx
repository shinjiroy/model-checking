import { useEffect, useState } from "react";
import type { CheckResult, TraceStep } from "@model-checking/spec";
import { TraceTimeline } from "./TraceTimeline.js";
import { StateDiffView } from "./StateDiffView.js";

function violationLabel(violation: { kind: "invariant"; name: string } | { kind: "deadlock" }): string {
  if (violation.kind === "invariant") return `invariant: ${violation.name}`;
  return "デッドロック(発火可能なアクションなし)";
}

type Props = {
  result: CheckResult<unknown>;
};

export function ResultPanel({ result }: Props) {
  if (result.ok) {
    return (
      <section className="result-panel result-panel--ok">
        <h2>検査成功</h2>
        <p>探索済み状態数: {result.statesExplored.toLocaleString("ja-JP")}</p>
        {!result.complete && (
          <p className="warning-text">
            maxStatesにより打ち切りました。状態空間が有界か確認するか、上限を引き上げて再度検査してください。
          </p>
        )}
      </section>
    );
  }

  return (
    <section className="result-panel result-panel--violation">
      <h2 className="violation-banner">違反を検出: {violationLabel(result.violation)}</h2>
      <p>探索済み状態数: {result.statesExplored.toLocaleString("ja-JP")}</p>
      <ViolationTrace trace={result.trace} />
    </section>
  );
}

function ViolationTrace({ trace }: { trace: TraceStep<unknown>[] }) {
  const steps = trace;
  const [selectedIndex, setSelectedIndex] = useState(steps.length - 1);

  useEffect(() => {
    setSelectedIndex(steps.length - 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- traceが変わった時だけ末尾へ戻す
  }, [steps]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "ArrowLeft") setSelectedIndex((i) => Math.max(0, i - 1));
      else if (event.key === "ArrowRight") setSelectedIndex((i) => Math.min(steps.length - 1, i + 1));
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [steps.length]);

  const selected = steps[selectedIndex]!;
  const prev = selectedIndex > 0 ? steps[selectedIndex - 1]!.state : undefined;

  return (
    <div className="violation-trace">
      <TraceTimeline trace={steps} selectedIndex={selectedIndex} onSelect={setSelectedIndex} />

      <div className="step-nav">
        <button type="button" onClick={() => setSelectedIndex((i) => Math.max(0, i - 1))} disabled={selectedIndex === 0}>
          ← 前のステップ
        </button>
        <span>
          #{selectedIndex} / #{steps.length - 1}
        </span>
        <button
          type="button"
          onClick={() => setSelectedIndex((i) => Math.min(steps.length - 1, i + 1))}
          disabled={selectedIndex === steps.length - 1}
        >
          次のステップ →
        </button>
      </div>

      <StateDiffView prevState={prev} state={selected.state} isInitial={selectedIndex === 0} />
    </div>
  );
}
