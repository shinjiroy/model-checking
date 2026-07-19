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
  const paramText = formatParam(step.param);
  const classNames = ["step-card"];
  if (selected) classNames.push("step-card--selected");
  if (violation) classNames.push("step-card--violation");

  return (
    <button type="button" className={classNames.join(" ")} onClick={onSelect}>
      <span className="step-card__index">#{index}</span>
      <span className="step-card__action">{step.action ?? "(初期状態)"}</span>
      {paramText !== null && <span className="step-card__param">{paramText}</span>}
      {arrows.map((text) => (
        <span key={text} className="step-card__arrow">
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
    <div className="timeline">
      <div className="timeline-initial">
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
        <div
          className="timeline-lanes"
          style={{ gridTemplateColumns: `120px repeat(${steps.length}, minmax(140px, 1fr))` }}
        >
          {lanes.map((lane, laneIdx) => (
            <div key={`label-${lane}`} className="lane-label" style={{ gridRow: laneIdx + 1, gridColumn: 1 }}>
              {lane}
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
