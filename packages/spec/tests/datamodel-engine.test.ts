import { describe, expect, test } from "vitest";
import {
  defineModel,
  forall,
  exists,
  rel,
  eq,
  neq,
  and,
  or,
  not,
  implies,
  iff,
  lit,
  card,
  count,
  add,
  lt,
  le,
  checkModel,
} from "../src/index.js";

describe("評価器: 量化・論理・等値・関係の真偽", () => {
  test("rel: 関係に含まれるタプルはtrue", () => {
    const model = defineModel({
      sorts: ["User", "Doc"],
      relations: { owner: ["User", "Doc"] },
      constraints: {
        fixOwner: forall("User", u => forall("Doc", d => iff(rel("owner", u, d), eq(u, u)))),
      },
      assertions: {
        // User0はownerと等しい(=全ユーザーがowner)ことを要求し、User1のみのスコープなら真
        alwaysOwner: forall("User", u => forall("Doc", d => rel("owner", u, d))),
      },
      scope: { User: 1, Doc: 1 },
    });
    const result = checkModel(model);
    expect(result.ok).toBe(true);
  });

  test("forall: 全称は1つでも反例があれば偽になる(検査でassertion違反として検出される)", () => {
    const model = defineModel({
      sorts: ["User"],
      relations: { admin: ["User"] },
      assertions: {
        everyoneIsAdmin: forall("User", u => rel("admin", u)),
      },
      scope: { User: 1 },
    });
    // admin関係の可能な値: {} または {User0} の2通り。{}のときeveryoneIsAdminは破れる
    const result = checkModel(model);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.assertion).toBe("everyoneIsAdmin");
    expect(result.instance.relations.admin).toEqual([]);
  });

  test("exists: 存在量化は1つでも満たせばtrue(自己含意は常に真)", () => {
    const model = defineModel({
      sorts: ["User"],
      relations: { admin: ["User"] },
      assertions: {
        trivial: implies(exists("User", u => rel("admin", u)), exists("User", u => rel("admin", u))),
      },
      scope: { User: 2 },
    });
    const result = checkModel(model);
    expect(result.ok).toBe(true);
  });

  test("eq/neq: 同じ変数はeq、異なる原子はneqになりうる", () => {
    const model = defineModel({
      sorts: ["User"],
      relations: {},
      assertions: {
        reflexive: forall("User", u => eq(u, u)),
        distinctPairExists: exists("User", u => exists("User", v => neq(u, v))),
      },
      scope: { User: 2 },
    });
    const result = checkModel(model);
    expect(result.ok).toBe(true);
  });

  test("ネストした量化(forallの中のforall)を正しく評価する", () => {
    const model = defineModel({
      sorts: ["User", "Doc"],
      relations: { owner: ["User", "Doc"] },
      assertions: {
        atMostOneOwnerConfigurationIsChecked: forall("User", u => forall("Doc", d => or(rel("owner", u, d), not(rel("owner", u, d))))),
      },
      scope: { User: 2, Doc: 2 },
    });
    // 排中律なので常に真
    const result = checkModel(model);
    expect(result.ok).toBe(true);
  });
});

describe("評価器: 同一ソートの入れ子量化が誤キャプチャしないことの固定(設計判断のリグレッションテスト)", () => {
  // exists u: exists v: neq(u, v) は「2つの相異なる要素が存在する」という主張。
  // もしu(外側)とv(内側)が誤って同じ変数として評価されてしまう実装バグがあれば、
  // neq(u, v)は常にfalseになり、スコープに関わらずこの主張は常に破れる(assertion違反)はずである。
  // スコープを2にすると満たせる・1にすると満たせない、という対比が「正しく別変数として評価されている」証拠になる
  function distinctPairModel(userCount: number) {
    return defineModel({
      sorts: ["User"],
      relations: {},
      assertions: {
        thereExistTwoDistinctUsers: exists("User", u => exists("User", v => neq(u, v))),
      },
      scope: { User: userCount },
    });
  }

  test("スコープ2なら相異なる2要素が存在するので性質は破れない(ok:true)", () => {
    const result = checkModel(distinctPairModel(2));
    expect(result.ok).toBe(true);
  });

  test("スコープ1なら相異なる2要素を選べないので性質は破れる(ok:false)。誤キャプチャならこの非対称性が消える", () => {
    const result = checkModel(distinctPairModel(1));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.assertion).toBe("thereExistTwoDistinctUsers");
  });

  test("3階層の入れ子(forallの中でforall、さらにexists)でも各変数を独立に評価する", () => {
    const model = defineModel({
      sorts: ["User"],
      relations: { admin: ["User"] },
      assertions: {
        // 任意のu1, u2について、u1=u2 か、u1!=u2のどちらかのユーザーが存在するかは自明に真
        nested: forall("User", u1 =>
          forall("User", u2 => or(eq(u1, u2), exists("User", u3 => and(neq(u3, u1), neq(u3, u2))))),
        ),
      },
      scope: { User: 3 }, // u1 != u2 なユーザーが2人いれば、残る1人がu3として使える
    });
    const result = checkModel(model);
    expect(result.ok).toBe(true);
  });
});

describe("評価器: 算術(add/lit)・集合濃度(card/count)・比較(lt/le)", () => {
  test("card: 関係ownerのタプル数が<=1という濃度制約は、各Docのオーナーが高々1人なら真", () => {
    // owner関係の取りうる部分集合は2^(User*Doc)=2^2通り(User:2,Doc:1)。全て「Docごとに高々1人」を満たすかは
    // ownerのタプル数自体で判定できるため、card(owner)<=1という制約がその不変を過不足なく捉えているかを確認する
    const model = defineModel({
      sorts: ["User", "Doc"],
      relations: { owner: ["User", "Doc"] },
      assertions: {
        atMostOneOwnerTotal: le(card("owner"), lit(1)),
      },
      scope: { User: 2, Doc: 1 },
    });
    // ownerの部分集合のうちタプル数が2のもの(User0,User1両方がowner)がassertionを破る反例になるはず
    const result = checkModel(model);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.instance.relations.owner!.length).toBeGreaterThan(1);
  });

  test("card: 関係が空ならタプル数0で0<=0は真", () => {
    const model = defineModel({
      sorts: ["User"],
      relations: { admin: ["User"] },
      constraints: {
        adminIsEmpty: forall("User", u => not(rel("admin", u))),
      },
      assertions: {
        zeroAdmins: le(card("admin"), lit(0)),
      },
      scope: { User: 2 },
    });
    const result = checkModel(model);
    expect(result.ok).toBe(true);
  });

  test("count: #{u: User | admin(u)} <= 1 (管理者は高々1人)は、2人とも管理者になる反例で破れる", () => {
    const model = defineModel({
      sorts: ["User"],
      relations: { admin: ["User"] },
      assertions: {
        atMostOneAdmin: le(count("User", u => rel("admin", u)), lit(1)),
      },
      scope: { User: 2 },
    });
    const result = checkModel(model);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.instance.relations.admin!.length).toBe(2);
  });

  test("count+add+lt: 各Docについてオーナー数+共有数の合計が全ユーザー数未満なら真になりうる", () => {
    const model = defineModel({
      sorts: ["User", "Doc"],
      relations: { owner: ["User", "Doc"], sharedWith: ["User", "Doc"] },
      constraints: {
        // ownerとsharedWithは互いに素(1人のユーザーが両方を兼ねない)
        disjoint: forall("User", u => forall("Doc", d => not(and(rel("owner", u, d), rel("sharedWith", u, d))))),
      },
      assertions: {
        totalBelowUserCount: forall("Doc", d =>
          lt(add(count("User", u => rel("owner", u, d)), count("User", u => rel("sharedWith", u, d))), lit(3)),
        ),
      },
      scope: { User: 2, Doc: 1 },
    });
    // User:2なので、owner+sharedWith(互いに素)の合計は最大2 < 3となり、常に真
    const result = checkModel(model);
    expect(result.ok).toBe(true);
  });

  test("count: 外側のforallで束縛したTermをcountのbody内から参照でき、それぞれの変数は独立に評価される", () => {
    // 外側のforall(User u)の変数と、count内部で新規に束縛されるUser変数は別のvarId。
    // countのbody(rel("owner", u, d))はuを外側から、count自身の変数は使わずrelの第1引数を固定して
    // 「dのオーナー数」を数える形で、外側変数の参照とcount自身の束縛変数の独立性を両方確認する
    const model = defineModel({
      sorts: ["User", "Doc"],
      relations: { owner: ["User", "Doc"] },
      assertions: {
        ownerCountPerDocIsAtMostTotal: forall("Doc", d =>
          le(count("User", u => rel("owner", u, d)), card("owner")),
        ),
      },
      scope: { User: 2, Doc: 2 },
    });
    // 特定のDocのオーナー数は、全Docにわたるownerタプル総数(card)を超えることはないので常に真
    const result = checkModel(model);
    expect(result.ok).toBe(true);
  });

  test("使用例: 各Docのオーナーは高々1人(forall d. count(User, u=>owner(u,d)) <= 1)を検証する", () => {
    // 濃度制約の典型的な用例。「1つのDocに複数のオーナーがいてはいけない」という性質を、
    // count(集合内包の濃度)+forallで表現する。User:2, Doc:1のスコープでは両ユーザーが同じDocを
    // 所有できてしまうインスタンスが存在するため、この性質は破れる(反例が見つかる)
    const model = defineModel({
      sorts: ["User", "Doc"],
      relations: { owner: ["User", "Doc"] },
      assertions: {
        atMostOneOwnerPerDoc: forall("Doc", d => le(count("User", u => rel("owner", u, d)), lit(1))),
      },
      scope: { User: 2, Doc: 1 },
    });
    const result = checkModel(model);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.assertion).toBe("atMostOneOwnerPerDoc");
    expect(result.instance.relations.owner).toEqual([
      ["User0", "Doc0"],
      ["User1", "Doc0"],
    ]);
  });

  test("lt: 空関係のcardは0で、0 < 1は真", () => {
    const model = defineModel({
      sorts: ["User"],
      relations: { admin: ["User"] },
      constraints: {
        adminIsEmpty: forall("User", u => not(rel("admin", u))),
      },
      assertions: {
        cardLessThanOne: lt(card("admin"), lit(1)),
      },
      scope: { User: 2 },
    });
    const result = checkModel(model);
    expect(result.ok).toBe(true);
  });
});

describe("enumerationEngine: 制約による絞り込み", () => {
  test("constraintsを満たさないインスタンスは検査対象から除外される", () => {
    const model = defineModel({
      sorts: ["User"],
      relations: { admin: ["User"] },
      constraints: {
        // adminは常に空でなければならない、という強い制約
        adminIsEmpty: forall("User", u => not(rel("admin", u))),
      },
      assertions: {
        // 制約下ではadminは常に空なので、この主張は常に真になる(制約なしなら破れうる)
        noAdmins: forall("User", u => not(rel("admin", u))),
      },
      scope: { User: 2 },
    });
    const result = checkModel(model);
    expect(result.ok).toBe(true);
  });

  test("constraintsが矛盾している(充足するインスタンスが1つもない)場合はsatisfiedInstances: 0になる", () => {
    // 「全ユーザーについてadmin(u)かつnot admin(u)」は、どんなインスタンスでも成り立たない矛盾した制約。
    // この場合assertionsは実質的に一度も検証されないため、ok: trueだけでなくsatisfiedInstances: 0を見て
    // 「制約が強すぎて何も検証できていない」ことを区別できる必要がある
    const model = defineModel({
      sorts: ["User"],
      relations: { admin: ["User"] },
      constraints: {
        contradiction: forall("User", u => and(rel("admin", u), not(rel("admin", u)))),
      },
      assertions: {
        // constraintsが矛盾している限り、assertionsの中身がどんな主張でも(たとえ明らかに偽でも)
        // ok: trueになってしまう(検証されていないだけ)ことも合わせて示す
        obviouslyFalse: forall("User", u => not(eq(u, u))),
      },
      scope: { User: 2 },
    });

    const result = checkModel(model);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.satisfiedInstances).toBe(0);
    expect(result.instancesChecked).toBeGreaterThan(0); // インスタンス自体は列挙されている(全て制約で弾かれた)
  });
});

describe("enumerationEngine: assertionの破れ検出とok:true", () => {
  test("性質が破れない場合はok:trueとinstancesCheckedを返す", () => {
    const model = defineModel({
      sorts: ["User"],
      relations: { admin: ["User"] },
      assertions: {
        tautology: forall("User", u => implies(rel("admin", u), rel("admin", u))),
      },
      scope: { User: 2 },
    });
    const result = checkModel(model);
    // constraintsが無いため全インスタンスが検証対象になる: admin(User,2)の部分集合は2^2=4通り
    expect(result).toEqual({ ok: true, instancesChecked: 4, complete: true, satisfiedInstances: 4 });
  });

  test("性質が破れる場合はok:falseで違反したassertion名とinstanceを返す", () => {
    const model = defineModel({
      sorts: ["User"],
      relations: { admin: ["User"] },
      assertions: {
        noOneIsAdmin: forall("User", u => not(rel("admin", u))),
      },
      scope: { User: 1 },
    });
    const result = checkModel(model);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.assertion).toBe("noOneIsAdmin");
    expect(result.instance.atoms.User).toEqual(["User0"]);
  });
});

describe("enumerationEngine: maxInstancesによる打ち切り", () => {
  test("maxInstancesを超える場合はcomplete: falseで打ち切り、違反が見つからなければok:true", () => {
    const model = defineModel({
      sorts: ["User"],
      relations: { admin: ["User"], vip: ["User"] },
      assertions: {
        tautology: forall("User", u => implies(rel("admin", u), rel("admin", u))),
      },
      scope: { User: 3 }, // admin: 2^3=8, vip: 2^3=8 → 全体で64インスタンス
    });
    const result = checkModel(model, { maxInstances: 10 });
    expect(result).toEqual({ ok: true, instancesChecked: 10, complete: false, satisfiedInstances: 10 });
  });
});

describe("enumerationEngine: onProgress", () => {
  test("1024インスタンスごとにonProgressが呼ばれる", () => {
    const model = defineModel({
      sorts: ["User"],
      relations: { a: ["User"], b: ["User"], c: ["User"], d: ["User"] },
      assertions: {
        tautology: forall("User", u => implies(rel("a", u), rel("a", u))),
      },
      scope: { User: 4 }, // 各関係2^4=16通り、4関係で16^4=65536インスタンス
    });
    const progressValues: number[] = [];
    const result = checkModel(model, { maxInstances: 5000, onProgress: n => progressValues.push(n) });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.complete).toBe(false);
    expect(progressValues.length).toBeGreaterThan(0);
    expect(progressValues[0]).toBe(1024);
    expect(progressValues.every(n => n % 1024 === 0)).toBe(true);
  });
});

describe("enumerationEngine: 決定的な列挙順", () => {
  test("同じモデルを複数回検査しても同じ結果(同じinstance)になる", () => {
    const model = defineModel({
      sorts: ["User", "Doc"],
      relations: { owner: ["User", "Doc"], sharedWith: ["User", "Doc"], admin: ["User"], canEdit: ["User", "Doc"] },
      constraints: {
        canEditDefinition: forall("User", u =>
          forall("Doc", d => iff(rel("canEdit", u, d), or(rel("owner", u, d), rel("sharedWith", u, d), rel("admin", u)))),
        ),
      },
      assertions: {
        onlyOwnerOrAdminCanEdit: forall("User", u => forall("Doc", d => implies(rel("canEdit", u, d), or(rel("owner", u, d), rel("admin", u))))),
      },
      scope: { User: 2, Doc: 1 },
    });

    const first = checkModel(model);
    const second = checkModel(model);
    expect(first).toEqual(second);
  });
});
