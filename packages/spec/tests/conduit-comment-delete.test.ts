import { describe, expect, test } from "vitest";
import { checkModel, defineModel, forall, rel, iff } from "../src/index.js";
import { conduitCommentDeleteModel } from "../../../examples/conduit-comment-delete.js";

describe("Conduitコメント削除権限のunder-specification(トラックA)", () => {
  test("記事著者が他人のコメントを削除できてしまう反例を見つける", () => {
    const result = checkModel(conduitCommentDeleteModel);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.assertion).toBe("onlyCommentAuthorCanDelete");

    const { instance } = result;
    const commentAuthorSet = new Set(instance.relations.commentAuthor!.map(t => t.join(",")));
    const canDeleteSet = new Set(instance.relations.canDeleteComment!.map(t => t.join(",")));
    const commentOnSet = new Set(instance.relations.commentOn!.map(t => t.join(",")));
    const articleAuthorSet = new Set(instance.relations.articleAuthor!.map(t => t.join(",")));

    // 反例には「コメント投稿者ではないのに削除でき、その根拠が記事著者であるユーザー」が含まれる
    const offending = instance.atoms.User!.flatMap(u =>
      instance.atoms.Comment!.map(c => ({ u, c })),
    ).find(({ u, c }) => {
      const key = `${u},${c}`;
      const isArticleAuthorOfComment = instance.atoms.Article!.some(
        a => commentOnSet.has(`${c},${a}`) && articleAuthorSet.has(`${u},${a}`),
      );
      return canDeleteSet.has(key) && !commentAuthorSet.has(key) && isArticleAuthorOfComment;
    });
    expect(offending).toBeDefined();
  });

  test("削除権を投稿者本人のみに限定する(記事著者を外す)と反例が消える", () => {
    // examples側は変更できないため、同じ語彙で解釈X(修正版)を組み立てて検証する
    const fixed = defineModel({
      sorts: conduitCommentDeleteModel.sorts,
      relations: conduitCommentDeleteModel.relations,
      constraints: {
        everyCommentHasAuthor: conduitCommentDeleteModel.constraints!.everyCommentHasAuthor!,
        everyCommentOnArticle: conduitCommentDeleteModel.constraints!.everyCommentOnArticle!,
        // 修正: 削除できるのは投稿者本人のみ(記事著者のモデレーション権を与えない)
        canDeleteDefinition: forall("User", u =>
          forall("Comment", c => iff(rel("canDeleteComment", u, c), rel("commentAuthor", u, c))),
        ),
      },
      assertions: conduitCommentDeleteModel.assertions,
      scope: conduitCommentDeleteModel.scope,
    });

    const result = checkModel(fixed);
    expect(result.ok).toBe(true);
    // constraintsを満たすインスタンスが実際に検証された(0件なら修正の効果を確認できていない)
    if (result.ok) expect(result.satisfiedInstances).toBeGreaterThan(0);
  });
});
