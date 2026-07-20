# 実設計での検証: RealWorld/Conduit + 自チーム設計

「実在する設計をモデル化して、レビューで見逃される問題を実際に発見できるか」の検証。
ツールの存在意義そのものを問う部分なので、二本立てで進める。

- **トラックA**: RealWorld(Conduit)を concept 単位でモデル化した、公開・再現可能なショーケース(本ドキュメントの主対象)
- **トラックB**: 自チームの実設計の検証(チーム内部設計の情報が要るため枠組みのみ提示)

## 参考: concept design

論文「What You See Is What It Does: A Structural Pattern for Legible Software」(Daniel Jackson & Eagon Meng, MIT, 2025)は、
RealWorld/Conduit を **concepts(独立した機能単位)+ synchronizations(概念間を仲介するイベント規則)** に分解する。
Daniel Jackson は Alloy の作者であり、本ツールが依拠する形式手法系譜の中心にあたる。
この分解方針を「どこをモデル化するか」の設計図として借りる(DSLの形式そのものを移植するわけではない)。

- 論文: https://arxiv.org/abs/2508.14511
- MIT News: https://news.mit.edu/2025/mit-researchers-propose-new-model-for-legible-modular-software-1106
- Daniel Jackson (The Essence of Software): https://essenceofsoftware.com/posts/wysiwid/

## なぜ非モノリシックに切り出すか

RealWorld全体を単一モデルに詰めない。M4の全列挙エンジンは関係数・スコープに対して指数的
(総インスタンス ≈ 2^(全関係の可能タプル総数))なため、全体を1モデルにすると小スコープでも爆発し、
`maxInstances` 打ち切り(`complete: false`)で「検査した感」だけ残りカバレッジがほぼ出ない
(docs/datamodel-sketch.md「全列挙エンジンの実装方針」)。concept design の主眼もモジュール性であり、
正しい使い方は逆で、**1つの concept + その周辺 synchronization だけを切り出して小スコープで検査する**。

バグが宿るのは概念そのものより **synchronization(概念間の整合ルール)** の側にある。
状態機械側(M1/M2)とデータモデル側(M4)の両方を刺激するよう、題材を2つ選んだ。

## トラックA-1: favorite数の二重管理(状態機械 / インターリーブ探索)

- 仕様: [examples/conduit-favorite-count.ts](../examples/conduit-favorite-count.ts)
- 回帰テスト: [packages/spec/tests/conduit-favorite-count.test.ts](../packages/spec/tests/conduit-favorite-count.test.ts)
- 検査方式: 明示的状態探索(`check`)。Favorite concept の synchronization にタイミング依存が宿る例

Conduitの記事は「お気に入りしたユーザー集合(真実の源)」と「favoritesCount(別管理の数値カウンタ)」を
二重に持つ。カウンタ更新を素朴な read-modify-write(現在値を読む→+1して書き戻す)で実装すると、
2ユーザーが同じ記事を同時にお気に入りしたとき、両者が古い値(0)を読んでから書き戻し、カウンタが1にしかならない。

**発見される反例(最短4ステップ)**: `read_alice`(0を読む)→ `read_bob`(0を読む)→ `commit_alice`(count=1, 集合={alice})→
`commit_bob`(count=0+1=1, 集合={alice, bob})。結果、お気に入り集合は2件なのにカウンタは1件で食い違う
(不変条件 `countMatchesFavorites` 違反)。read と commit を別アクションに分けて read-modify-write の非原子性を表現しており、
検査器が「両者がreadしてから両者がcommitする」インターリーブを自動的に試して反例を返す。

**修正**: commit で古い `readValue` ではなく現在の `count` をインクリメントする(原子的インクリメント)と反例が消える
(テストの「反例が消える」ケースで固定)。これはツールの差別化価値であるインターリーブ探索が効く題材にあたる。

## トラックA-2: コメント削除権限の under-specification(データモデル / 小スコープ列挙)

- 仕様: [examples/conduit-comment-delete.ts](../examples/conduit-comment-delete.ts)
- 回帰テスト: [packages/spec/tests/conduit-comment-delete.test.ts](../packages/spec/tests/conduit-comment-delete.test.ts)
- 検査方式: 小スコープ全列挙(`checkModel`)。Comment concept の synchronization(誰が削除できるか)を検証

RealWorldのAPI仕様はコメント削除の権限を明示しておらず、実装ごとに解釈が割れる。

- 解釈X: コメントを削除できるのは投稿者本人のみ
- 解釈Y: 記事の著者もモデレーションのため自記事のコメントを削除できる

synchronization(`canDeleteComment` の定義)を解釈Yで実装し、意図(解釈X)をassertionとして検証すると、
**「記事の著者が、自分が書いたわけではない他人のコメントを削除できてしまう」反例**が見つかる
(assertion `onlyCommentAuthorCanDelete` 違反)。scopeは User: 2, Comment: 1, Article: 1。

これはレビューで見逃されやすい設計判断の典型で、`canDeleteComment` に記事著者を含めた瞬間、
「投稿者本人のみ」という素朴な期待が静かに破れる。ツールは二つの解釈の分岐を反例として突きつけ、
チームに「記事著者にモデレーション権を与えるのか」を意識的に決めさせる。

**修正**: 削除権を投稿者本人のみに限定する(記事著者を外す)と反例が消える(テストで固定)。

## 他に狙える反例(concept × synchronization の候補)

同じ切り出し方で以下も題材化できる。トラックAを広げる際の入口として残す。

- ユーザ削除時のカスケードの抜け(記事/コメント/favorite/フォロー関係が宙に浮く参照整合性違反)
- フォロワー数カウンタと follow 関係の二重管理(favorite数と同型のロストアップデート)
- Feed = フォロー × 記事 の導出整合(自分の記事を含む/含まないの取り違え)
- 自己フォロー / 自分の記事の favorite の可否(仕様が under-specified)

## トラックB: 自チームの実設計

トラックA単独では「レビューで見逃されたバグの発見」の説得力に欠ける(RealWorldは公開題材で既知の論点が多い)。
それを示すには、**非同期・リトライ・状態遷移を含む自チームの実設計を1つ選んでモデル化し、
レビューで見逃されたバグを1件以上発見する**ことが要る。ツールの差別化価値(インターリーブ探索)が効く題材を選ぶ。

このトラックはチーム内部設計の情報(対象フロー・状態・不変条件・レビュー経緯)が前提となるため、本PRでは枠組みのみ示す。
着手時の進め方:

1. 対象を1つ選ぶ(非同期API・リトライ・排他制御・複数プロセスのいずれかを含むもの)
2. concept + synchronization に分解し、タイミング依存が宿りそうな同期規則を1つ切り出す
3. 状態機械(`defineSpec`)またはデータモデル(`defineModel`)でモデル化し、意図した性質を不変条件/assertionで書く
4. 反例が出たら、レビューで見逃されていたかを確認する(見逃しバグが1件でも出れば、ツールの存在意義が立つ)

トラックAの2題材(状態機械/データモデルそれぞれ1つ)が、この手順の具体的な雛形になる。
