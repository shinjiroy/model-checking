/**
 * データモデル・権限検証(フェーズ3)の検査エンジン。
 *
 * ModelEngineインターフェースの背後に検査方式を隠すことで、
 * 「小スコープの全インスタンス列挙」(このファイルのenumerationEngine)と
 * 将来のZ3ベースエンジンを、モデル定義(Formula/ModelDef)を書き換えずに差し替えられるようにする
 * (docs/datamodel-sketch.md参照)。
 */
import type { Formula, Term } from "./formula.js";
import type { ModelDef } from "./model.js";

/** 検査対象の1インスタンス(小スコープの世界の1つの解釈) */
export type Instance = {
  /** ソート → そのソートの原子名一覧(例 User: ["User0","User1"]) */
  atoms: Record<string, readonly string[]>;
  /** 関係名 → そのインスタンスでの実際のタプル集合 */
  relations: Record<string, readonly (readonly string[])[]>;
};

export type ModelCheckResult =
  | {
      ok: true;
      instancesChecked: number;
      complete: boolean;
      /**
       * constraintsを満たしたインスタンス数(assertionsの検証対象になった数)。
       * これが0だと、constraints自体が矛盾していて(充足可能なインスタンスが1つもなく)
       * assertionsが実質的に一度も検証されていない可能性がある。ok: trueだけでは
       * 「性質が本当に確認できたのか」「制約が強すぎて何も検証できなかったのか」を区別できないため、
       * この数を見て判断できるようにしている
       */
      satisfiedInstances: number;
    }
  | { ok: false; assertion: string; instance: Instance; instancesChecked: number };

export type ModelCheckOptions = {
  /** 各ソートの要素数をModelDef.scopeから上書きする */
  scope?: Record<string, number>;
  /** 列挙するインスタンス数の上限。超えた場合はcomplete: falseで打ち切る */
  maxInstances?: number;
  /** 検査中に一定間隔(1024インスタンスごと)で呼ばれる進捗コールバック */
  onProgress?: (instancesChecked: number) => void;
};

export interface ModelEngine {
  findViolation(model: ModelDef, options?: ModelCheckOptions): ModelCheckResult;
}

const DEFAULT_MAX_INSTANCES = 1_000_000;
const PROGRESS_INTERVAL = 1024;

/** path→内側から外側へ辿った束縛変数のid → 現在の値(原子名) */
type Env = Record<number, string>;

function evalTerm(term: Term, env: Env): string {
  const value = env[term.id];
  if (value === undefined) {
    // defineModelの構築時バリデーション(量化子の外に持ち出された変数の検出)を通過していれば
    // 本来ここには来ない。防御的なフォールバックとして残しておく
    throw new Error(
      `検査中に未束縛の変数を評価しようとしました(id=${term.id})。defineModelのバリデーションを迂回して` +
        "式木を直接組み立てた場合に起こりえます",
    );
  }
  return value;
}

function evalFormula(formula: Formula, instance: Instance, env: Env): boolean {
  switch (formula.kind) {
    case "forall": {
      const atoms = instance.atoms[formula.sort] ?? [];
      return atoms.every((atom) => evalFormula(formula.body, instance, { ...env, [formula.varId]: atom }));
    }
    case "exists": {
      const atoms = instance.atoms[formula.sort] ?? [];
      return atoms.some((atom) => evalFormula(formula.body, instance, { ...env, [formula.varId]: atom }));
    }
    case "rel": {
      const tuples = instance.relations[formula.name] ?? [];
      const args = formula.args.map((term) => evalTerm(term, env));
      return tuples.some((tuple) => tuple.length === args.length && tuple.every((value, index) => value === args[index]));
    }
    case "eq":
      return evalTerm(formula.left, env) === evalTerm(formula.right, env);
    case "neq":
      return evalTerm(formula.left, env) !== evalTerm(formula.right, env);
    case "and":
      return formula.operands.every((operand) => evalFormula(operand, instance, env));
    case "or":
      return formula.operands.some((operand) => evalFormula(operand, instance, env));
    case "not":
      return !evalFormula(formula.operand, instance, env);
    case "implies":
      return !evalFormula(formula.left, instance, env) || evalFormula(formula.right, instance, env);
    case "iff":
      return evalFormula(formula.left, instance, env) === evalFormula(formula.right, instance, env);
    default: {
      const exhaustive: never = formula;
      throw new Error(`internal: 未知の式ノードです: ${JSON.stringify(exhaustive)}`);
    }
  }
}

/** ソート列から原子の組(直積)を、ソートごとの原子リストの並び順通りに決定的に列挙する */
function cartesianProduct(argSorts: readonly string[], atoms: Record<string, readonly string[]>): string[][] {
  let combinations: string[][] = [[]];
  for (const sort of argSorts) {
    const sortAtoms = atoms[sort] ?? [];
    const next: string[][] = [];
    for (const prefix of combinations) {
      for (const atom of sortAtoms) {
        next.push([...prefix, atom]);
      }
    }
    combinations = next;
  }
  return combinations;
}

/**
 * 全列挙エンジン: 各関係の「取りうるタプル全体(直積)」の部分集合を、関係ごとに独立に選んで
 * インスタンスを作る。全関係の部分集合の組み合わせ数(2^タプル数の総積)だけインスタンスがあり、
 * これをmaxInstancesまで(混合基数のカウンタとして)決定的な順序で列挙する。
 * constraintsを全て満たし、assertionsのいずれかを破る最初のインスタンスを返す。
 */
export const enumerationEngine: ModelEngine = {
  findViolation(model: ModelDef, options: ModelCheckOptions = {}): ModelCheckResult {
    const scope = { ...model.scope, ...options.scope };
    const maxInstances = options.maxInstances ?? DEFAULT_MAX_INSTANCES;

    const atoms: Record<string, string[]> = {};
    for (const sort of model.sorts) {
      const count = scope[sort] ?? 0;
      atoms[sort] = Array.from({ length: count }, (_, index) => `${sort}${index}`);
    }

    // 関係名の列挙順・各関係のタプル列挙順を固定することで、インスタンスの列挙順を決定的にする
    const relationNames = Object.keys(model.relations);
    const universes: Record<string, string[][]> = {};
    const radices: number[] = [];
    for (const name of relationNames) {
      const universe = cartesianProduct(model.relations[name]!, atoms);
      universes[name] = universe;
      radices.push(2 ** universe.length);
    }

    const total = radices.reduce((acc, radix) => acc * radix, 1);
    const limit = Math.min(total, maxInstances);
    const complete = total <= maxInstances;

    const constraints = Object.entries(model.constraints ?? {});
    const assertions = Object.entries(model.assertions);
    let satisfiedInstances = 0;

    for (let index = 0; index < limit; index++) {
      let rest = index;
      const relations: Record<string, string[][]> = {};
      for (let r = 0; r < relationNames.length; r++) {
        const name = relationNames[r]!;
        const radix = radices[r]!;
        const mask = rest % radix;
        rest = Math.floor(rest / radix);
        // ビット演算(<<, &)は32bit整数に丸められるため、大きいタプル数でも安全な算術演算で判定する
        relations[name] = universes[name]!.filter((_, bit) => Math.floor(mask / 2 ** bit) % 2 === 1);
      }

      const instance: Instance = { atoms, relations };

      const satisfiesConstraints = constraints.every(([, formula]) => evalFormula(formula, instance, {}));
      if (satisfiesConstraints) {
        satisfiedInstances += 1;
        for (const [name, formula] of assertions) {
          if (!evalFormula(formula, instance, {})) {
            return { ok: false, assertion: name, instance, instancesChecked: index + 1 };
          }
        }
      }

      if (options.onProgress && (index + 1) % PROGRESS_INTERVAL === 0) {
        options.onProgress(index + 1);
      }
    }

    return { ok: true, instancesChecked: limit, complete, satisfiedInstances };
  },
};

/** 既定エンジン(全列挙)でモデルを検査するファサード */
export function checkModel(model: ModelDef, options?: ModelCheckOptions): ModelCheckResult {
  return enumerationEngine.findViolation(model, options);
}
