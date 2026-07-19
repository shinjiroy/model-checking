/**
 * データモデル・権限検証(フェーズ3)の述語を組み立てるためのコンビネータと式木(AST)。
 *
 * boolean関数は受け付けない: 述語をJS関数として書けてしまうと、その中身を解析できず
 * SMTソルバ(Z3)に翻訳できなくなる。全列挙エンジンとZ3エンジンの両方が解釈できる共通の
 * ASTを間に挟むことで、仕様(モデル定義)を書き換えずに検査エンジンだけを差し替えられるようにする
 * (GOAL.mdの技術方針を参照)。式木の語彙は量化・等値・関係・論理演算に絞っており、
 * 将来算術等を足す場合もタグ付きユニオンにケースを追加するだけで拡張できる(docs/datamodel-sketch.md参照)。
 *
 * 変数の内部表現には、de Bruijn指数ではなく「束縛のたびに新しい一意なidを振る」方式を採る。
 * forall/exists は変数を表すTermをコールバックへ渡し、コールバックが組み立てた式(body)を
 * そのまま格納する。結果のASTはidが埋め込まれた素朴なプレーンオブジェクトになり、
 * JSONシリアライズ可能という要件を満たす。
 */

/** 変数の参照。forall/exists のコールバックへ渡され、rel/eq/neqの引数として使う */
export type Term = {
  kind: "var";
  /** このTermを生成したforall/exists呼び出しごとに一意なid */
  id: number;
  /** この変数が動くソート名 */
  sort: string;
};

export type Formula =
  | { kind: "forall"; sort: string; varId: number; body: Formula }
  | { kind: "exists"; sort: string; varId: number; body: Formula }
  | { kind: "rel"; name: string; args: readonly Term[] }
  | { kind: "eq"; left: Term; right: Term }
  | { kind: "neq"; left: Term; right: Term }
  | { kind: "and"; operands: readonly Formula[] }
  | { kind: "or"; operands: readonly Formula[] }
  | { kind: "not"; operand: Formula }
  | { kind: "implies"; left: Formula; right: Formula }
  | { kind: "iff"; left: Formula; right: Formula };

let nextVarId = 0;

function freshVar(sort: string): Term {
  nextVarId += 1;
  return { kind: "var", id: nextVarId, sort };
}

/** `forall x: sort. body(x)` */
export function forall(sort: string, body: (x: Term) => Formula): Formula {
  const x = freshVar(sort);
  return { kind: "forall", sort, varId: x.id, body: body(x) };
}

/** `exists x: sort. body(x)` */
export function exists(sort: string, body: (x: Term) => Formula): Formula {
  const x = freshVar(sort);
  return { kind: "exists", sort, varId: x.id, body: body(x) };
}

/** 関係への所属判定: `name(args...)` */
export function rel(name: string, ...args: Term[]): Formula {
  return { kind: "rel", name, args };
}

export function eq(left: Term, right: Term): Formula {
  return { kind: "eq", left, right };
}

export function neq(left: Term, right: Term): Formula {
  return { kind: "neq", left, right };
}

export function and(...operands: Formula[]): Formula {
  return { kind: "and", operands };
}

export function or(...operands: Formula[]): Formula {
  return { kind: "or", operands };
}

export function not(operand: Formula): Formula {
  return { kind: "not", operand };
}

export function implies(left: Formula, right: Formula): Formula {
  return { kind: "implies", left, right };
}

export function iff(left: Formula, right: Formula): Formula {
  return { kind: "iff", left, right };
}
