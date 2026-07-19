import { defineSpec } from "@model-checking/spec";
import type { ActionDef } from "@model-checking/spec";

/**
 * RealWorld(Conduit)のトラックA題材: favorite数の二重管理によるロストアップデート。
 *
 * Conduitの記事は「お気に入りしたユーザー集合(真実の源)」と「favoritesCount(別管理の数値カウンタ)」を
 * 二重に持つ。カウンタ更新を素朴に read-modify-write(現在値を読む→+1して書き戻す)で実装すると、
 * 2ユーザーが同じ記事を同時にお気に入りしたとき、両者が古い値(0)を読んでから書き戻し、
 * カウンタが1にしかならない = ロストアップデート。お気に入り集合は2件なのにカウンタは1件で食い違う。
 *
 * これはツールの差別化価値であるインターリーブ探索が効く題材(concept間のsynchronizationにタイミング依存が宿る例)。
 * read と commit を別アクションに分けることで read-modify-write の非原子性を表現し、
 * 検査器が「両者がreadしてから両者がcommitする」インターリーブを自動的に試して反例を出す。
 *
 * 状態空間を有界に保つため、各ユーザーのお気に入りは高々1回(phaseがdoneで終端)にしている。
 */

const USERS = ["alice", "bob"] as const;

type ReqPhase = "idle" | "reading" | "done";

type State = {
  /** 記事をお気に入りしたユーザー集合(真実の源) */
  favoritedBy: string[];
  /** 別管理のお気に入り数カウンタ(キャッシュ) */
  count: number;
  /** 各ユーザーのお気に入りリクエストの進行状況 */
  phase: Record<string, ReqPhase>;
  /** read-modify-writeでreadした時点のカウンタ値(古くなりうる中間状態) */
  readValue: Record<string, number>;
};

// アクションをユーザーごとに生成する(actorメタデータをユーザー名にしてタイムラインのレーンを分ける)
const actions: Record<string, ActionDef<State>> = {};
for (const u of USERS) {
  // read: 現在のカウンタ値を読み取る(まだ書き戻さない)
  actions[`read_${u}`] = {
    actor: u,
    when: s => s.phase[u] === "idle",
    then: s => ({
      ...s,
      phase: { ...s.phase, [u]: "reading" },
      readValue: { ...s.readValue, [u]: s.count },
    }),
  };
  // commit: read時点の値+1を書き戻し、お気に入り集合に自分を追加する
  actions[`commit_${u}`] = {
    actor: u,
    when: s => s.phase[u] === "reading",
    then: s => ({
      ...s,
      phase: { ...s.phase, [u]: "done" },
      count: s.readValue[u]! + 1, // バグ: 古いreadValueを使うため、割り込まれるとロストアップデートになる
      favoritedBy: [...s.favoritedBy, u],
    }),
  };
}

export const conduitFavoriteCountSpec = defineSpec<State>({
  init: {
    favoritedBy: [],
    count: 0,
    phase: { alice: "idle", bob: "idle" },
    readValue: { alice: 0, bob: 0 },
  },

  actions,

  invariants: {
    // カウンタは常にお気に入り集合の要素数と一致するはず
    countMatchesFavorites: s => s.count === s.favoritedBy.length,
  },

  // 全ユーザーのリクエストが完了していれば正常終了(発火可能なアクションがなくてもデッドロックとしない)
  done: s => USERS.every(u => s.phase[u] === "done"),
});
