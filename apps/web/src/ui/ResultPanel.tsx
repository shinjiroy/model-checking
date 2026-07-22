import { useEffect, useState } from "react";
import type { ChannelDef, CheckResult, TraceStep } from "@model-checking/spec";
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
      <section className="my-6 rounded-xl border border-emerald-300 bg-emerald-50 p-5">
        <h2 className="panel-title text-emerald-800">検査成功</h2>
        <p className="text-base text-emerald-900">探索済み状態数: {result.statesExplored.toLocaleString("ja-JP")}</p>
        {!result.complete && (
          <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-base font-semibold text-amber-800">
            maxStatesにより打ち切りました。状態空間が有界か確認するか、上限を引き上げて再度検査してください。
          </p>
        )}
      </section>
    );
  }

  return (
    <section className="my-6 overflow-hidden rounded-xl border border-rose-300 bg-white">
      <div className="border-b border-rose-300 bg-rose-50 px-5 py-4">
        <h2 className="text-lg font-bold text-rose-800">違反を検出: {violationLabel(result.violation)}</h2>
        <p className="mt-1 text-base text-rose-900">探索済み状態数: {result.statesExplored.toLocaleString("ja-JP")}</p>
      </div>
      <div className="p-5">
        <ViolationTrace trace={result.trace} channels={result.channels} />
      </div>
    </section>
  );
}

function ViolationTrace({
  trace,
  channels,
}: {
  trace: TraceStep<unknown>[];
  channels?: Record<string, ChannelDef>;
}) {
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
    <div>
      <TraceTimeline trace={steps} selectedIndex={selectedIndex} onSelect={setSelectedIndex} channels={channels} />

      {/* ステップ送り。現在位置は大きな数字とバーの両方で示し、どこを見ているかを一目で分かるようにする */}
      <div className="my-4 flex flex-wrap items-center gap-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <button
          type="button"
          className="btn btn-secondary btn-square"
          aria-label="前のステップ"
          onClick={() => setSelectedIndex((i) => Math.max(0, i - 1))}
          disabled={selectedIndex === 0}
        >
          ←
        </button>
        <div className="min-w-0 flex-1">
          <p className="flex items-baseline gap-1 font-semibold text-slate-900">
            <span className="text-base text-slate-500">ステップ</span>
            <span className="text-2xl leading-none">#{selectedIndex}</span>
            <span className="text-base text-slate-500">/ #{steps.length - 1}</span>
          </p>
          <div
            className="mt-2 flex gap-0.5"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={steps.length - 1}
            aria-valuenow={selectedIndex}
            aria-label="トレース内の現在位置"
          >
            {steps.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 flex-1 rounded-full ${
                  i === selectedIndex ? "bg-blue-600" : i < selectedIndex ? "bg-blue-200" : "bg-slate-200"
                }`}
              />
            ))}
          </div>
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-square"
          aria-label="次のステップ"
          onClick={() => setSelectedIndex((i) => Math.min(steps.length - 1, i + 1))}
          disabled={selectedIndex === steps.length - 1}
        >
          →
        </button>
      </div>
      <p className="mb-4 text-sm text-slate-500">←→キーでもステップを送れます</p>

      <StateDiffView prevState={prev} state={selected.state} isInitial={selectedIndex === 0} />
    </div>
  );
}
