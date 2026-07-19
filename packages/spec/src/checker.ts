import { canonicalKey } from "./canonical.js";
import type { Spec } from "./spec.js";

export type Violation = { kind: "invariant"; name: string } | { kind: "deadlock" };

export type TraceStep<S> = {
  /** 発火したアクション名。初期状態はnull */
  action: string | null;
  /** アクションを実行した主体(仕様のactorメタデータの写し) */
  actor?: string;
  /** paramsで選ばれた値 */
  param?: unknown;
  /** 遷移後の状態のスナップショット */
  state: S;
};

export type CheckResult<S> =
  | { ok: true; statesExplored: number; complete: boolean }
  | { ok: false; violation: Violation; trace: TraceStep<S>[]; statesExplored: number };

export type CheckOptions = {
  /** 探索する状態数の上限。超えた場合はcomplete: falseで打ち切る */
  maxStates?: number;
  /**
   * 探索中に一定間隔(1024状態ごと)で呼ばれる進捗コールバック。同期的に呼ばれるため、
   * UIスレッドへの転送が必要な場合は呼び出し側(Workerホスト側)でスロットリングする
   */
  onProgress?: (statesExplored: number) => void;
};

/** onProgressを呼ぶ間隔(状態数) */
const PROGRESS_INTERVAL = 1024;

type Node<S> = {
  state: S;
  parent: Node<S> | null;
  action: string | null;
  actor: string | undefined;
  param: unknown;
};

/**
 * BFSによる明示的状態探索。BFSなので、返る反例トレースは違反への最短経路になる。
 */
export function check<S>(spec: Spec<S>, options: CheckOptions = {}): CheckResult<S> {
  const maxStates = options.maxStates ?? 1_000_000;
  const accepting = spec.accepting ?? (() => false);
  const invariants = Object.entries(spec.invariants ?? {});

  const init = deepFreeze(spec.init);
  const visited = new Set<string>([canonicalKey(init)]);
  const root: Node<S> = { state: init, parent: null, action: null, actor: undefined, param: undefined };

  const initViolation = findViolatedInvariant(invariants, init);
  if (initViolation !== null) {
    return {
      ok: false,
      violation: { kind: "invariant", name: initViolation },
      trace: buildTrace(root),
      statesExplored: visited.size,
    };
  }

  const queue: Node<S>[] = [root];
  let head = 0;
  let complete = true;

  while (head < queue.length) {
    const node = queue[head++]!;
    let enabled = false;

    for (const [actionName, def] of Object.entries(spec.actions)) {
      const paramList: readonly unknown[] = def.params ? def.params(node.state) : [undefined];
      for (const param of paramList) {
        if (def.when && !def.when(node.state, param)) continue;
        enabled = true;

        const nextState = deepFreeze(def.then(node.state, param));
        const key = canonicalKey(nextState);
        if (visited.has(key)) continue;

        const next: Node<S> = { state: nextState, parent: node, action: actionName, actor: def.actor, param };
        const violated = findViolatedInvariant(invariants, nextState);
        if (violated !== null) {
          return {
            ok: false,
            violation: { kind: "invariant", name: violated },
            trace: buildTrace(next),
            statesExplored: visited.size + 1,
          };
        }

        if (visited.size >= maxStates) {
          complete = false;
          continue;
        }
        visited.add(key);
        queue.push(next);
        if (options.onProgress && visited.size % PROGRESS_INTERVAL === 0) {
          options.onProgress(visited.size);
        }
      }
    }

    if (!enabled && !accepting(node.state)) {
      return {
        ok: false,
        violation: { kind: "deadlock" },
        trace: buildTrace(node),
        statesExplored: visited.size,
      };
    }
  }

  return { ok: true, statesExplored: visited.size, complete };
}

function findViolatedInvariant<S>(
  invariants: [string, (state: S) => boolean][],
  state: S,
): string | null {
  for (const [name, predicate] of invariants) {
    if (!predicate(state)) return name;
  }
  return null;
}

function buildTrace<S>(node: Node<S>): TraceStep<S>[] {
  const trace: TraceStep<S>[] = [];
  for (let n: Node<S> | null = node; n !== null; n = n.parent) {
    const step: TraceStep<S> = { action: n.action, state: n.state };
    if (n.actor !== undefined) step.actor = n.actor;
    if (n.param !== undefined) step.param = n.param;
    trace.push(step);
  }
  return trace.reverse();
}

/** 状態を再帰的に凍結する。ユーザーのアクション関数内での破壊的変更を例外で検出するため */
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
