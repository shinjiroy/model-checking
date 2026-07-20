/**
 * データモデル・権限検証の述語を組み立てるためのコンビネータと式木(AST)。
 *
 * boolean関数は受け付けない: 述語をJS関数として書けてしまうと、その中身を解析できず
 * SMTソルバ(Z3)に翻訳できなくなる。全列挙エンジンとZ3エンジンの両方が解釈できる共通の
 * ASTを間に挟むことで、仕様(モデル定義)を書き換えずに検査エンジンだけを差し替えられるようにする
 * (docs/design-goals.mdを参照)。式木の語彙は量化・等値・関係・論理演算に絞っており、
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

/**
 * 整数値を表す式。atom値(Term)とは型で分離しており、混同できない
 * (例: `eq`の引数にIntExprを渡すことはできない)。
 * Z3翻訳可能性を損なわないよう、有限領域上の線形整数算術(加算・比較・有限個のite総和)
 * の範囲に限定している(乗算・非有界量化・実数は含めない)。
 */
export type IntExpr =
  | { kind: "lit"; value: number }
  | { kind: "card"; relation: string }
  | { kind: "count"; sort: string; varId: number; body: Formula }
  | { kind: "add"; left: IntExpr; right: IntExpr };

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
  | { kind: "iff"; left: Formula; right: Formula }
  | { kind: "lt"; left: IntExpr; right: IntExpr }
  | { kind: "le"; left: IntExpr; right: IntExpr };

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

/** 整数リテラル(非負整数を想定) */
export function lit(value: number): IntExpr {
  return { kind: "lit", value };
}

/** 関係のタプル数(集合の濃度): `#relation` */
export function card(relation: string): IntExpr {
  return { kind: "card", relation };
}

/** 集合内包の濃度: `#{ x: sort | body(x) }`。bodyを満たす原子の数 */
export function count(sort: string, body: (x: Term) => Formula): IntExpr {
  const x = freshVar(sort);
  return { kind: "count", sort, varId: x.id, body: body(x) };
}

/** 加算(`+`)。可変長引数はleft-foldで畳み込む */
export function add(first: IntExpr, second: IntExpr, ...rest: IntExpr[]): IntExpr {
  return rest.reduce<IntExpr>((acc, next) => ({ kind: "add", left: acc, right: next }), {
    kind: "add",
    left: first,
    right: second,
  });
}

export function lt(left: IntExpr, right: IntExpr): Formula {
  return { kind: "lt", left, right };
}

export function le(left: IntExpr, right: IntExpr): Formula {
  return { kind: "le", left, right };
}

/** `left > right` の糖衣構文(`right < left`) */
export function gt(left: IntExpr, right: IntExpr): Formula {
  return lt(right, left);
}

/** `left >= right` の糖衣構文(`right <= left`) */
export function ge(left: IntExpr, right: IntExpr): Formula {
  return le(right, left);
}
