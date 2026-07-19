import { describe, expect, test } from "vitest";
import { checkModel, defineModel, forall, rel, or, implies, iff } from "../src/index.js";
import { docPermissionModel } from "../../../examples/doc-permission.js";

describe("ドキュメント共有の権限モデル(フェーズ3題材: 権限の抜け漏れ)", () => {
  test("sharedWith経由の編集権が「オーナーか管理者のみ」の意図を破る反例を見つける", () => {
    const result = checkModel(docPermissionModel);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.assertion).toBe("onlyOwnerOrAdminCanEdit");

    const { instance } = result;
    expect(instance.atoms.User).toEqual(["User0", "User1"]);
    expect(instance.atoms.Doc).toEqual(["Doc0"]);

    // 反例には「owner でも admin でもないのに sharedWith 経由で canEdit を持つユーザー」が含まれる
    const ownerSet = new Set(instance.relations.owner!.map(t => t.join(",")));
    const adminSet = new Set(instance.relations.admin!.map(t => t.join(",")));
    const sharedWithSet = new Set(instance.relations.sharedWith!.map(t => t.join(",")));
    const canEditSet = new Set(instance.relations.canEdit!.map(t => t.join(",")));

    const offendingUser = instance.atoms.User!.find(u =>
      instance.atoms.Doc!.some(d => {
        const key = `${u},${d}`;
        return canEditSet.has(key) && !ownerSet.has(key) && !adminSet.has(u) && sharedWithSet.has(key);
      }),
    );
    expect(offendingUser).toBeDefined();
  });

  test("scopeをUser:1, Doc:1に縮めても同じ反例が見つかる(User:2は反例に必要な最小値ではない)", () => {
    // examples/doc-permission.tsのコメント通り、scope: {User:2, Doc:1}は反例を示すための最小値ではない。
    // ModelCheckOptions.scopeでモデル定義のscopeを上書きし、User:1でも反例が見つかることを固定する
    const result = checkModel(docPermissionModel, { scope: { User: 1, Doc: 1 } });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.assertion).toBe("onlyOwnerOrAdminCanEdit");
    expect(result.instance.atoms.User).toEqual(["User0"]);
    expect(result.instance.atoms.Doc).toEqual(["Doc0"]);

    // 唯一のユーザーがowner・adminどちらでもないままsharedWith経由でcanEditを持ってしまっている
    expect(result.instance.relations.owner).toEqual([]);
    expect(result.instance.relations.admin).toEqual([]);
    expect(result.instance.relations.sharedWith).toEqual([["User0", "Doc0"]]);
    expect(result.instance.relations.canEdit).toEqual([["User0", "Doc0"]]);
  });

  test("canEditの定義からsharedWithを外す(オーナー・管理者のみに限定する)と反例が消える", () => {
    // examples/doc-permission.tsは変更できないため、同じ語彙で「修正版」を別途組み立てて検証する
    const fixed = defineModel({
      sorts: ["User", "Doc"],
      relations: {
        owner: ["User", "Doc"],
        sharedWith: ["User", "Doc"],
        admin: ["User"],
        canEdit: ["User", "Doc"],
      },
      constraints: {
        // 修正: 共有(sharedWith)だけでは編集権を渡さない
        canEditDefinition: forall("User", u =>
          forall("Doc", d => iff(rel("canEdit", u, d), or(rel("owner", u, d), rel("admin", u)))),
        ),
      },
      assertions: {
        onlyOwnerOrAdminCanEdit: forall("User", u =>
          forall("Doc", d => implies(rel("canEdit", u, d), or(rel("owner", u, d), rel("admin", u)))),
        ),
      },
      scope: { User: 2, Doc: 1 },
    });

    const result = checkModel(fixed);
    expect(result).toEqual({
      ok: true,
      instancesChecked: expect.any(Number),
      complete: true,
      satisfiedInstances: expect.any(Number),
    });
    // constraintsを満たすインスタンスが実際にいくつか(0件ではない)検証されたことも確認する
    // (0件だと「制約が強すぎて何も検証できていない」だけの可能性があり、修正の効果を確認できない)
    if (result.ok) expect(result.satisfiedInstances).toBeGreaterThan(0);
  });
});
