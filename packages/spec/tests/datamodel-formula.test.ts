import { describe, expect, test } from "vitest";
import { defineModel, forall, exists, rel, eq, neq, and, or, not, implies, iff, type Term } from "../src/index.js";

const baseModel = {
  sorts: ["User", "Doc"],
  relations: {
    owner: ["User", "Doc"],
    admin: ["User"],
  },
  scope: { User: 2, Doc: 1 },
};

describe("defineModel: 正常系", () => {
  test("正しいモデル定義はそのまま返る(defineSpecと同様の恒等関数)", () => {
    const model = defineModel({
      ...baseModel,
      assertions: {
        ownersAreNotAdmins: forall("User", u => forall("Doc", d => implies(rel("owner", u, d), not(rel("admin", u))))),
      },
    });
    expect(model.sorts).toEqual(["User", "Doc"]);
  });

  test("and/or/not/eq/exists/iffを含む式木も構築できる", () => {
    const model = defineModel({
      ...baseModel,
      assertions: {
        mixed: forall("User", u =>
          and(
            or(rel("admin", u), exists("Doc", d => rel("owner", u, d))),
            iff(rel("admin", u), rel("admin", u)),
            not(eq(u, u)),
            implies(rel("admin", u), rel("admin", u)),
          ),
        ),
      },
    });
    expect(model.assertions.mixed).toBeDefined();
  });

  test("同じソートを入れ子で量化しても、内側と外側の変数を正しく別物として扱える(誤キャプチャしない)", () => {
    // forallの中でさらに同じ"User"ソートをforallする(u1とu2は別々のid・別々のTermになる)。
    // 構築時バリデーション(束縛チェック)がu1・u2それぞれを正しく別の変数として認識できることを固定する
    const model = defineModel({
      ...baseModel,
      assertions: {
        crossReference: forall("User", u1 => forall("User", u2 => implies(eq(u1, u2), rel("admin", u1)))),
      },
      constraints: {
        // 制約側でも同様に入れ子量化・変数の相互参照ができることを確認する
        distinctPairSymmetric: forall("User", u1 => forall("User", u2 => implies(neq(u1, u2), neq(u2, u1)))),
      },
    });
    expect(model.assertions.crossReference).toBeDefined();
  });
});

describe("defineModel: バリデーションエラー", () => {
  test("relationsの引数ソートが未知だとエラー", () => {
    expect(() =>
      defineModel({
        sorts: ["User"],
        relations: { owner: ["User", "Doc"] },
        assertions: {},
        scope: { User: 1 },
      }),
    ).toThrow(/未知です/);
  });

  test("scopeにソートの要素数が指定されていないとエラー", () => {
    expect(() =>
      defineModel({
        sorts: ["User", "Doc"],
        relations: { owner: ["User", "Doc"] },
        assertions: {},
        scope: { User: 1 },
      }),
    ).toThrow(/scope/);
  });

  test("assertionsで未知の関係を参照するとエラー", () => {
    expect(() =>
      defineModel({
        ...baseModel,
        assertions: {
          bad: forall("User", u => rel("nonExistent", u)),
        },
      }),
    ).toThrow(/未知の関係です: nonExistent/);
  });

  test("assertionsで未知のソートを量化するとエラー", () => {
    expect(() =>
      defineModel({
        ...baseModel,
        assertions: {
          bad: forall("Group", (g) => rel("admin", g)),
        },
      }),
    ).toThrow(/未知のソートです: Group/);
  });

  test("関係の引数の数が一致しないとエラー", () => {
    expect(() =>
      defineModel({
        ...baseModel,
        assertions: {
          bad: forall("User", u => rel("owner", u)), // ownerは(User, Doc)の2引数
        },
      }),
    ).toThrow(/引数の数が一致しません/);
  });

  test("関係の引数のソートが一致しないとエラー", () => {
    expect(() =>
      defineModel({
        ...baseModel,
        assertions: {
          bad: forall("User", u => forall("Doc", d => rel("owner", d, u))), // 引数の順序が逆
        },
      }),
    ).toThrow(/ソートが一致しません/);
  });

  test("constraintsのバリデーションエラーも検出する", () => {
    expect(() =>
      defineModel({
        ...baseModel,
        constraints: {
          bad: forall("User", u => rel("nonExistent", u)),
        },
        assertions: {},
      }),
    ).toThrow(/未知の関係です: nonExistent/);
  });

  test("eqで両辺のソートが異なるとエラー", () => {
    expect(() =>
      defineModel({
        ...baseModel,
        assertions: {
          bad: forall("User", u => forall("Doc", d => eq(u, d))),
        },
      }),
    ).toThrow(/ソートが一致しません/);
  });

  test("量化コールバックの外へ持ち出したTerm(漏出Term)を別の量化のbodyへ埋め込むと構築時エラーになる", () => {
    // capturedUserは最初のforallのコールバック内でしか本来使えないはずの変数だが、
    // クロージャの外の変数へ代入することでスコープの外に持ち出せてしまう。
    // これを全く関係ない(capturedUserを束縛していない)forall("Doc", ...)のbodyに埋め込むと、
    // 「量化子の外に持ち出した変数」として構築時に検出されるべき
    let capturedUser: Term | undefined;
    forall("User", u => {
      capturedUser = u;
      return rel("admin", u); // この式自体は捨てる(検証はしない)
    });

    expect(() =>
      defineModel({
        ...baseModel,
        assertions: {
          bad: forall("Doc", d => rel("owner", capturedUser!, d)),
        },
      }),
    ).toThrow(/量化子の外に持ち出した変数/);
  });

  test("トップレベル(いかなる量化子にも囲まれていない)でTermを使うと漏出Termとして構築時エラーになる", () => {
    let capturedUser: Term | undefined;
    forall("User", u => {
      capturedUser = u;
      return rel("admin", u);
    });

    expect(() =>
      defineModel({
        ...baseModel,
        assertions: {
          bad: rel("admin", capturedUser!),
        },
      }),
    ).toThrow(/量化子の外に持ち出した変数/);
  });
});
