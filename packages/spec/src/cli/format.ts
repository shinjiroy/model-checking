/**
 * 検査結果のターミナル整形出力。
 * 反例トレースは Web UI のタイムラインをテキストで再現する
 * (どのアクターがどのアクションをどの順で発火し、状態がどう変わったか)。
 */
import type { CheckResult, TraceStep, Violation } from "../checker.js";
import type { Instance, ModelCheckResult } from "../datamodel/engine.js";

function describeViolation(violation: Violation): string {
  if (violation.kind === "deadlock") {
    return "デッドロック(発火可能なアクションがなく done でもない状態に到達)";
  }
  return `不変条件 ${violation.name} を破った`;
}

/** 反例トレース1本をタイムラインとして整形する */
export function formatTrace(trace: TraceStep<unknown>[]): string {
  const lines: string[] = [];
  trace.forEach((step, i) => {
    const label = step.action ?? "(初期状態)";
    const actor = step.actor !== undefined ? ` [${step.actor}]` : "";
    const param =
      step.param !== undefined ? ` param=${JSON.stringify(step.param)}` : "";
    lines.push(`    ${String(i).padStart(2)}  ${label}${actor}${param}`);
    lines.push(`        ${JSON.stringify(step.state)}`);
  });
  return lines.join("\n");
}

/** 状態機械仕様の検査結果を整形する */
export function formatCheckResult(name: string, result: CheckResult<unknown>): string {
  if (result.ok) {
    if (result.complete) {
      return `  ✓ ${name}  ${result.statesExplored} 状態を全探索、反例なし`;
    }
    return `  ⚠ ${name}  ${result.statesExplored} 状態で打ち切り(--max-states に到達)、反例なし`;
  }
  const header = `  ✗ ${name}  ${describeViolation(result.violation)}(${result.statesExplored} 状態を探索)`;
  return `${header}\n  反例トレース(最短 ${result.trace.length - 1} ステップ):\n${formatTrace(result.trace)}`;
}

/** データモデルのインスタンスを整形する(反例の解釈) */
export function formatInstance(instance: Instance): string {
  const lines: string[] = [];
  lines.push("    原子:");
  for (const [sort, atoms] of Object.entries(instance.atoms)) {
    lines.push(`      ${sort}: ${atoms.join(", ")}`);
  }
  lines.push("    関係:");
  for (const [rel, tuples] of Object.entries(instance.relations)) {
    const rendered = tuples.map(t => `(${t.join(", ")})`).join(" ") || "(空)";
    lines.push(`      ${rel}: ${rendered}`);
  }
  return lines.join("\n");
}

/** データモデル検証の結果を整形する */
export function formatModelResult(name: string, result: ModelCheckResult): string {
  if (result.ok) {
    if (result.satisfiedInstances === 0) {
      return `  ⚠ ${name}  制約を満たすインスタンスが0件(制約が矛盾している可能性。${result.instancesChecked} 件を列挙)`;
    }
    return `  ✓ ${name}  ${result.satisfiedInstances}/${result.instancesChecked} 件で assertion を確認、反例なし`;
  }
  return (
    `  ✗ ${name}  assertion ${result.assertion} を破るインスタンスあり(${result.instancesChecked} 件を列挙)\n` +
    `  反例インスタンス:\n${formatInstance(result.instance)}`
  );
}
