import { useEffect, useRef } from "react";
import type { ChannelDef, TraceStep } from "@model-checking/spec";
import { detectMessageArrows, formatMessageArrow } from "../core/messageArrows.js";

const NO_ACTOR_LANE = "—";

function formatParam(param: unknown): string | null {
  if (param === undefined) return null;
  try {
    return JSON.stringify(param);
  } catch {
    return String(param);
  }
}

type StepCardProps = {
  step: TraceStep<unknown>;
  index: number;
  selected: boolean;
  violation: boolean;
  arrows: string[];
  onSelect: () => void;
};

function StepCard({ step, index, selected, violation, arrows, onSelect }: StepCardProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const paramText = formatParam(step.param);
  const tone = violation
    ? "border-rose-400 bg-rose-50 hover:bg-rose-100"
    : "border-slate-200 bg-white hover:bg-slate-50";
  // 選択状態は枠線ではなくリング+影で示す。違反(rose)の枠線と喧嘩させないため
  const selection = selected ? "ring-2 ring-blue-600 ring-offset-1" : "";

  // 選択中のステップがレーンの横スクロール外にあると現在位置を見失うため、選択のたびに画面内へ寄せる
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [selected]);

  return (
    <button
      ref={ref}
      type="button"
      aria-current={selected ? "step" : undefined}
      className={`flex min-h-11 w-full cursor-pointer flex-col gap-0.5 rounded-lg border px-2.5 py-2 text-left text-sm transition-colors ${tone} ${selection}`}
      onClick={onSelect}
    >
      <span className="flex items-center gap-1.5">
        <span className={`font-semibold ${violation ? "text-rose-700" : "text-slate-400"}`}>#{index}</span>
        <span className="truncate font-semibold text-slate-900">{step.action ?? "(初期状態)"}</span>
      </span>
      {paramText !== null && (
        <span className="truncate font-mono text-slate-500" title={paramText}>
          {paramText}
        </span>
      )}
      {arrows.map((text) => (
        <span key={text} className="truncate font-mono text-xs text-blue-700" title={text}>
          {text}
        </span>
      ))}
    </button>
  );
}

type Props = {
  trace: TraceStep<unknown>[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  /** 状態のどのフィールドがどの方向のチャネルかを示す可視化用メタデータ。未指定なら矢印は表示しない */
  channels?: Record<string, ChannelDef>;
};

/**
 * actorごとの縦レーンにステップを時系列順にカード表示するタイムライン。
 * 初期状態(action: null)はレーン外の先頭に置く。違反ステップ(末尾)は強調する。
 * channelsが指定されていれば、直前ステップとの状態比較からメッセージの送受信を判定し、
 * 「▶ from→to: field」の矢印注釈をステップカードに添える。
 */
export function TraceTimeline({ trace, selectedIndex, onSelect, channels }: Props) {
  const steps = trace.slice(1);
  const lastIndex = trace.length - 1;
  const lanes = Array.from(new Set(steps.map((step) => step.actor ?? NO_ACTOR_LANE)));

  return (
    <div className="overflow-x-auto">
      <div className="mb-2 max-w-56">
        <StepCard
          step={trace[0]!}
          index={0}
          selected={selectedIndex === 0}
          violation={lastIndex === 0}
          arrows={[]}
          onSelect={() => onSelect(0)}
        />
      </div>
      {steps.length > 0 && (
        // レーンは横方向に間延びさせない: 各ステップ列は最大10remで打ち止め、
        // 余白は右に残す(視線移動を短く保つ)。レーン名の列は横スクロールしても左に留まる
        <div
          className="grid w-max items-start gap-x-1.5 gap-y-1"
          style={{ gridTemplateColumns: `minmax(4.5rem, auto) repeat(${steps.length}, minmax(7rem, 10rem))` }}
        >
          {lanes.map((lane, laneIdx) => (
            <div
              key={`label-${lane}`}
              className="sticky left-0 z-10 self-stretch bg-white pr-2 text-sm font-semibold text-slate-500"
              style={{ gridRow: laneIdx + 1, gridColumn: 1 }}
            >
              <span className="flex min-h-11 items-center">{lane}</span>
            </div>
          ))}
          {steps.map((step, i) => {
            const laneIdx = lanes.indexOf(step.actor ?? NO_ACTOR_LANE);
            const traceIndex = i + 1;
            const arrows = detectMessageArrows(trace[traceIndex - 1]!.state, step.state, channels).map(
              formatMessageArrow,
            );
            return (
              <div key={traceIndex} style={{ gridRow: laneIdx + 1, gridColumn: i + 2 }}>
                <StepCard
                  step={step}
                  index={traceIndex}
                  selected={selectedIndex === traceIndex}
                  violation={traceIndex === lastIndex}
                  arrows={arrows}
                  onSelect={() => onSelect(traceIndex)}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
