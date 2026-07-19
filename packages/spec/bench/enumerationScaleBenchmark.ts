#!/usr/bin/env node
/**
 * 全列挙エンジン(datamodel/engine.tsのenumerationEngine)のコスト構造を実測するベンチマークCLI。
 *
 * 状態機械側のscaleBenchmark.tsが「探索器のスループット」を測るのに対し、本CLIは
 * 「スコープ・関係のアリティ・関係の本数を変えたとき、総インスタンス数(=検査空間の大きさ)と
 * findViolationの所要時間がどう増えるか」を測る。総インスタンス数は各関係について2^(タプル総数)の
 * 総積であり、スコープに対して二重指数的に増える。既定のmaxInstances(1,000,000)を境に検査が
 * 打ち切られる(complete: false)「崖」がどのスコープで現れるかを具体的な数値で得ることが目的。
 *
 * 計測結果はdocs/z3-engine-evaluation.mdの数値表の取得元。
 *
 * 実行方法:
 *   npm run bench:enum -w @model-checking/spec
 */
import {
  defineModel,
  forall,
  implies,
  rel,
  checkModel,
  type ModelDef,
  type Term,
} from "../src/index.js";

const DEFAULT_MAX_INSTANCES = 1_000_000;

/**
 * モデルの理論総インスタンス数を厳密(BigInt)に求める。
 * 各関係のタプル総数 = 引数ソートのスコープの積。総インスタンス数 = 2^(全関係のタプル総数の和)。
 * JSのNumberでは2^53を超えると精度が落ち、2^1024超でInfinityになるためBigIntで持つ。
 */
function totalInstances(model: ModelDef, scope: Record<string, number>): { exponent: number; total: bigint } {
  let exponent = 0;
  for (const argSorts of Object.values(model.relations)) {
    let tuples = 1;
    for (const sort of argSorts) tuples *= scope[sort] ?? 0;
    exponent += tuples;
  }
  return { exponent, total: 2n ** BigInt(exponent) };
}

/** 常に真の恒等式。反例を出さず、maxInstancesまで(または全空間を)必ず列挙させるための番人述語 */
function tautology(relName: string, argSorts: readonly string[]): ModelDef["assertions"][string] {
  // relの引数として各ソートの変数を1つずつ束縛して渡す
  function build(index: number, acc: Term[]): ReturnType<typeof implies> {
    if (index === argSorts.length) return implies(rel(relName, ...acc), rel(relName, ...acc));
    return forall(argSorts[index]!, (x) => build(index + 1, [...acc, x]));
  }
  return build(0, []);
}

type Row = {
  label: string;
  scopeText: string;
  exponent: number;
  total: bigint;
  instancesChecked: number;
  complete: boolean;
  elapsedMs: number;
};

function run(label: string, model: ModelDef, scope: Record<string, number>): Row {
  const { exponent, total } = totalInstances(model, scope);
  const start = performance.now();
  const result = checkModel(model, { scope, maxInstances: DEFAULT_MAX_INSTANCES });
  const elapsedMs = performance.now() - start;
  const complete = result.ok ? result.complete : true;
  const scopeText = Object.entries(scope)
    .map(([s, n]) => `${s}:${n}`)
    .join(", ");
  return { label, scopeText, exponent, total, instancesChecked: result.instancesChecked, complete, elapsedMs };
}

/** 単一関係のモデルを、指定アリティ(引数ソート列)で組み立てる */
function singleRelationModel(argSorts: readonly string[], sorts: readonly string[]): ModelDef {
  return defineModel({
    sorts,
    relations: { r: argSorts },
    assertions: { taut: tautology("r", argSorts) },
    scope: Object.fromEntries(sorts.map((s) => [s, 1])),
  });
}

/** ドキュメント権限モデル(examples/doc-permission.ts相当、4関係)を組み立てる */
function docPermissionModel(): ModelDef {
  return defineModel({
    sorts: ["User", "Doc"],
    relations: {
      owner: ["User", "Doc"],
      sharedWith: ["User", "Doc"],
      admin: ["User"],
      canEdit: ["User", "Doc"],
    },
    assertions: {
      // 常に真の番人述語(全空間を列挙させ、コスト構造だけを測る)
      taut: forall("User", (u) => forall("Doc", (d) => implies(rel("canEdit", u, d), rel("canEdit", u, d)))),
    },
    scope: { User: 1, Doc: 1 },
  });
}

function formatTotal(total: bigint): string {
  const s = total.toString();
  if (s.length <= 15) return Number(total).toLocaleString();
  // 桁数が大きい場合は概数(有効数字3桁 × 10^k)で示す
  const digits = s.length - 1;
  const mantissa = `${s[0]}.${s.slice(1, 3)}`;
  return `約${mantissa}×10^${digits}`;
}

function printTable(title: string, rows: Row[]): void {
  console.log(`\n### ${title}`);
  console.log(
    "| " +
      ["構成", "スコープ", "タプル総数(指数E)", "総インスタンス数(2^E)", "検査済み", "complete", "経過時間"].join(" | ") +
      " |",
  );
  console.log("| " + Array(7).fill("---").join(" | ") + " |");
  for (const r of rows) {
    console.log(
      "| " +
        [
          r.label,
          r.scopeText,
          String(r.exponent),
          formatTotal(r.total),
          r.instancesChecked.toLocaleString(),
          String(r.complete),
          `${r.elapsedMs.toFixed(1)} ms`,
        ].join(" | ") +
        " |",
    );
  }
}

function main(): void {
  console.log(`全列挙エンジンのコスト構造ベンチマーク (maxInstances=${DEFAULT_MAX_INSTANCES.toLocaleString()})`);
  console.log(`Node ${process.version}`);

  // 1. 単一の1項関係 r(A): タプル総数 = n、総インスタンス数 = 2^n(スコープに対して指数的、緩やか)
  const unaryRows: Row[] = [];
  for (const n of [2, 4, 8, 16, 20, 24]) {
    const model = singleRelationModel(["A"], ["A"]);
    unaryRows.push(run("1項 r(A)", model, { A: n }));
  }
  printTable("単一の1項関係 r(A): 総数 = 2^n", unaryRows);

  // 2. 単一の2項関係 r(A,A): タプル総数 = n^2、総インスタンス数 = 2^(n^2)(二重指数的)
  const binaryRows: Row[] = [];
  for (const n of [2, 3, 4, 5, 6]) {
    const model = singleRelationModel(["A", "A"], ["A"]);
    binaryRows.push(run("2項 r(A,A)", model, { A: n }));
  }
  printTable("単一の2項関係 r(A,A): 総数 = 2^(n^2)", binaryRows);

  // 3. 2本の2項関係: 総インスタンス数 = 2^(2 n^2)
  const twoBinaryRows: Row[] = [];
  for (const n of [2, 3, 4]) {
    const model = defineModel({
      sorts: ["A"],
      relations: { r: ["A", "A"], s: ["A", "A"] },
      assertions: { taut: tautology("r", ["A", "A"]) },
      scope: { A: 1 },
    });
    twoBinaryRows.push(run("2項×2本 r,s(A,A)", model, { A: n }));
  }
  printTable("2本の2項関係 r(A,A), s(A,A): 総数 = 2^(2n^2)", twoBinaryRows);

  // 4. ドキュメント権限モデル(4関係): タプル総数 = 3*User*Doc + User
  const docRows: Row[] = [];
  for (const [u, d] of [
    [2, 1],
    [3, 1],
    [4, 1],
    [2, 2],
    [3, 2],
    [2, 3],
    [5, 1],
  ] as const) {
    docRows.push(run("doc-permission(4関係)", docPermissionModel(), { User: u, Doc: d }));
  }
  printTable("ドキュメント権限モデル(owner/sharedWith/admin/canEdit): 総数 = 2^(3·U·D + U)", docRows);
}

main();
