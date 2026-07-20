import { defineModel, forall, rel, or, implies, iff } from "@model-checking/spec";

/**
 * 題材: ドキュメント共有の権限モデル(データモデル・権限)。
 *
 * 「ドキュメントを共有されたユーザーには編集権も渡る」という設計をconstraintsでcanEditとして定義し、
 * 「編集できるのはオーナーか管理者のみ」という意図した性質をassertionとして検証する。
 * sharedWith経由で編集権を得たユーザーが、オーナーでも管理者でもないという反例が見つかる
 * = 「権限モデルの抜け漏れ」をツールが発見するデモ。
 *
 * 検出できるバグ: 共有(sharedWith)だけを受けたユーザーが、オーナー・管理者どちらでもないのに
 * canEditを持ってしまう(canEditの定義に "共有されたら編集可" が含まれているため)。
 *
 * scopeはUser: 2としているが、これは反例を示すのに必要な最小値ではない
 * (実際にはUser: 1, Doc: 1でも同じ反例が見つかる。1人のユーザーがオーナーでも管理者でもないまま
 * sharedWithだけを受け取ればcanEditを持ってしまう)。複数ユーザーが存在する、より一般的な状況でも
 * 同じ抜け漏れが起きることを確認できるようUser: 2にしている。
 */
export const docPermissionModel = defineModel({
  sorts: ["User", "Doc"],

  relations: {
    // ドキュメントの所有者
    owner: ["User", "Doc"],
    // ドキュメントを共有されたユーザー(閲覧目的で共有したつもりだが…)
    sharedWith: ["User", "Doc"],
    // システム管理者(全ドキュメントを編集できる)
    admin: ["User"],
    // 実際に編集権を持つかどうか(constraintsで定義する導出関係)
    canEdit: ["User", "Doc"],
  },

  constraints: {
    // 設計: オーナー・共有先・管理者のいずれかであれば編集できる
    canEditDefinition: forall("User", u =>
      forall("Doc", d =>
        iff(rel("canEdit", u, d), or(rel("owner", u, d), rel("sharedWith", u, d), rel("admin", u))),
      ),
    ),
  },

  assertions: {
    // 意図: 編集できるのはオーナーか管理者のみのはず(共有だけでは編集権を持たないはず)
    onlyOwnerOrAdminCanEdit: forall("User", u =>
      forall("Doc", d => implies(rel("canEdit", u, d), or(rel("owner", u, d), rel("admin", u)))),
    ),
  },

  scope: { User: 2, Doc: 1 },
});
