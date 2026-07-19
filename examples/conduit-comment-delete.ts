import { defineModel, forall, exists, rel, and, or, implies, iff } from "@model-checking/spec";

/**
 * RealWorld(Conduit)のトラックA題材: コメント削除権限の under-specification。
 *
 * concept design(Daniel Jackson & Eagon Meng)にならい、RealWorld全体を1つに詰めず、
 * Comment concept とその周辺 synchronization(誰がコメントを削除できるか)だけを小スコープで切り出す。
 * RealWorldのAPI仕様はコメント削除の権限を明示しておらず、実装ごとに解釈が割れる:
 *   - 解釈X: コメントを削除できるのは投稿者本人のみ
 *   - 解釈Y: 記事の著者もモデレーションのため自記事のコメントを削除できる
 *
 * ここでは synchronization(canDeleteComment の定義)を解釈Yで実装し、
 * 意図(解釈X「投稿者本人のみ削除できる」)をassertionとして検証する。
 * すると「記事の著者が、自分が書いたわけではない他人のコメントを削除できてしまう」反例が見つかる。
 *
 * これは「レビューで見逃されやすい設計判断」の典型: canDeleteComment に記事著者を含めた瞬間、
 * 「投稿者本人のみ」という素朴な期待が静かに破れる。ツールは二つの解釈の分岐を反例として突きつけ、
 * チームに「記事著者にモデレーション権を与えるのか」を意識的に決めさせる。
 *
 * scopeはComment/Articleを1、Userを2にしている(記事著者とコメント投稿者が別人である状況を
 * 表すのに2ユーザーあれば足りる)。
 */
export const conduitCommentDeleteModel = defineModel({
  sorts: ["User", "Comment", "Article"],

  relations: {
    // コメントの投稿者
    commentAuthor: ["User", "Comment"],
    // コメントがぶら下がる記事
    commentOn: ["Comment", "Article"],
    // 記事の著者
    articleAuthor: ["User", "Article"],
    // 実際にコメントを削除できるか(synchronizationで定義する導出関係)
    canDeleteComment: ["User", "Comment"],
  },

  constraints: {
    // 整合性: どのコメントにも投稿者がいる(反例を「別人が投稿した」と読めるようにするため)
    everyCommentHasAuthor: forall("Comment", c => exists("User", u => rel("commentAuthor", u, c))),
    // 整合性: どのコメントも1つの記事にぶら下がる
    everyCommentOnArticle: forall("Comment", c => exists("Article", a => rel("commentOn", c, a))),

    // synchronization(解釈Y): コメントを削除できるのは、投稿者本人 または そのコメントが付いた記事の著者
    canDeleteDefinition: forall("User", u =>
      forall("Comment", c =>
        iff(
          rel("canDeleteComment", u, c),
          or(
            rel("commentAuthor", u, c),
            exists("Article", a => and(rel("commentOn", c, a), rel("articleAuthor", u, a))),
          ),
        ),
      ),
    ),
  },

  assertions: {
    // 意図(解釈X): コメントを削除できるのは投稿者本人のみのはず
    onlyCommentAuthorCanDelete: forall("User", u =>
      forall("Comment", c => implies(rel("canDeleteComment", u, c), rel("commentAuthor", u, c))),
    ),
  },

  scope: { User: 2, Comment: 1, Article: 1 },
});
