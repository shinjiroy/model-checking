/**
 * データモデル・権限検証(フェーズ3)のモデル定義。
 * 状態機械側の`defineSpec`と同じ「プレーンオブジェクトを受け取る恒等関数」という形だが、
 * こちらは構築時(defineModel呼び出し時)に式木(Formula)の妥当性を検証する:
 * 未知のソート・関係名、引数の数・ソート不一致に加え、量化子の外に持ち出された変数
 * (漏出Term。ある forall/exists のコールバックで受け取った変数を、別の量化子のbodyへ
 * 埋め込んでしまった場合など)もここで日本語エラーとして投げる。
 */
import type { Formula, Term } from "./formula.js";

export type ModelDef = {
  /** 有限スコープで列挙する集合(例: "User", "Doc") */
  sorts: readonly string[];
  /** 関係名 → 引数のソート列(例: owner: ["User","Doc"]) */
  relations: Record<string, readonly string[]>;
  /** 前提。この制約を満たすインスタンスだけを検証対象の設計として扱う */
  constraints?: Record<string, Formula>;
  /** 検証したい性質。前提の下で破れないことを確認する */
  assertions: Record<string, Formula>;
  /** 各ソートの既定要素数(小スコープ) */
  scope: Record<string, number>;
};

export function defineModel(def: ModelDef): ModelDef {
  validateModelDef(def);
  return def;
}

function validateModelDef(def: ModelDef): void {
  for (const [name, argSorts] of Object.entries(def.relations)) {
    argSorts.forEach((sort, index) => {
      if (!def.sorts.includes(sort)) {
        throw new Error(
          `relations.${name}の第${index + 1}引数のソートが未知です: ${sort}(sortsに宣言されていません)`,
        );
      }
    });
  }

  for (const sort of def.sorts) {
    if (!(sort in def.scope)) {
      throw new Error(`scopeにソート ${sort} の要素数が指定されていません`);
    }
  }

  for (const [name, formula] of Object.entries(def.constraints ?? {})) {
    validateFormula(def, formula, `constraints.${name}`, new Set());
  }
  for (const [name, formula] of Object.entries(def.assertions)) {
    validateFormula(def, formula, `assertions.${name}`, new Set());
  }
}

/** 現在このノードの内側で(祖先のforall/exists経由で)束縛されている変数idの集合 */
type BoundVars = ReadonlySet<number>;

function validateFormula(def: ModelDef, formula: Formula, path: string, bound: BoundVars): void {
  switch (formula.kind) {
    case "forall":
    case "exists":
      if (!def.sorts.includes(formula.sort)) {
        throw new Error(`${path}: 未知のソートです: ${formula.sort}(sortsに宣言されていません)`);
      }
      validateFormula(
        def,
        formula.body,
        `${path}.${formula.kind}(${formula.sort})`,
        new Set([...bound, formula.varId]),
      );
      return;
    case "rel":
      validateRelArgs(def, formula.name, formula.args, path, bound);
      return;
    case "eq":
    case "neq":
      validateTermPair(formula.left, formula.right, formula.kind, path, bound);
      return;
    case "and":
    case "or":
      formula.operands.forEach((operand, index) =>
        validateFormula(def, operand, `${path}.${formula.kind}[${index}]`, bound),
      );
      return;
    case "not":
      validateFormula(def, formula.operand, `${path}.not`, bound);
      return;
    case "implies":
    case "iff":
      validateFormula(def, formula.left, `${path}.${formula.kind}.left`, bound);
      validateFormula(def, formula.right, `${path}.${formula.kind}.right`, bound);
      return;
    default: {
      const exhaustive: never = formula;
      throw new Error(`${path}: 未知の式ノードです: ${JSON.stringify(exhaustive)}`);
    }
  }
}

/**
 * 量化子の外に持ち出された変数(漏出Term)を検出する。forall/existsのコールバックの外へ
 * Termを保存しておき、別の(その変数を束縛していない)量化子のbody内で使い回した場合に
 * ここへ到達する。JS変数のスコープを飛び越えてASTへ直接混ぜ込まない限り起きないミスだが、
 * 起きた場合にエンジン側の評価で不可解に落ちるより、構築時に検知して分かりやすく伝える
 */
function checkTermBound(term: Term, path: string, bound: BoundVars): void {
  if (!bound.has(term.id)) {
    throw new Error(
      `${path}: 量化子の外に持ち出した変数が式に含まれています。` +
        "forall/existsのコールバック内で受け取った変数はそのコールバックの中でのみ使えます",
    );
  }
}

function validateRelArgs(def: ModelDef, name: string, args: readonly Term[], path: string, bound: BoundVars): void {
  const argSorts = def.relations[name];
  if (!argSorts) {
    throw new Error(`${path}: 未知の関係です: ${name}(relationsに宣言されていません)`);
  }
  if (argSorts.length !== args.length) {
    throw new Error(
      `${path}: 関係 ${name} の引数の数が一致しません(期待: ${argSorts.length}個, 実際: ${args.length}個)`,
    );
  }
  args.forEach((arg, index) => {
    checkTermBound(arg, path, bound);
    const expected = argSorts[index]!;
    if (arg.sort !== expected) {
      throw new Error(
        `${path}: 関係 ${name} の第${index + 1}引数のソートが一致しません(期待: ${expected}, 実際: ${arg.sort})`,
      );
    }
  });
}

function validateTermPair(left: Term, right: Term, kind: "eq" | "neq", path: string, bound: BoundVars): void {
  checkTermBound(left, path, bound);
  checkTermBound(right, path, bound);
  if (left.sort !== right.sort) {
    throw new Error(`${path}: ${kind}の両辺のソートが一致しません(${left.sort} vs ${right.sort})`);
  }
}
