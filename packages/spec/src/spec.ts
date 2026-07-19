/**
 * 仕様記述DSLの型定義。
 * 状態SはJSONシリアライズ可能なプレーンオブジェクトに限定する
 * (重複排除の等価性判定を正規化JSONで行うため)。
 */

export type ActionDef<S, P = unknown> = {
  /** このアクションを実行する主体(可視化用メタデータ。検査結果には影響しない) */
  actor?: string;
  /** ガード条件。省略時は常に発火可能 */
  when?: (state: S, param: P) => boolean;
  /** パラメータ付き非決定性。「いずれかの値で発火する」を表し、検査器が全値を試す */
  params?: (state: S) => readonly P[];
  /** 遷移。新しい状態を返す純粋関数(元の状態は凍結されており、変更すると例外になる) */
  then: (state: S, param: P) => S;
};

/** チャネル(配列フィールド)の送信元・宛先。可視化(メッセージ矢印)用メタデータで、検査結果には影響しない */
export type ChannelDef = {
  from: string;
  to: string;
};

export type Spec<S> = {
  init: S;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  actions: Record<string, ActionDef<S, any>>;
  invariants?: Record<string, (state: S) => boolean>;
  /** 発火可能なアクションがなくても正常終了とみなす状態(デッドロック判定から除外) */
  done?: (state: S) => boolean;
  /**
   * 状態のどの配列フィールドがどの方向のチャネルかを示す可視化用メタデータ(検査には無関係)。
   * キーは状態のフィールド名、値はそのチャネルの送信元actor(from)・宛先actor(to)。
   * `actor` と同種の追加情報であり、DSLの意味論(検査結果)には一切影響しない。
   */
  channels?: Record<string, ChannelDef>;
};

export function defineSpec<S>(spec: Spec<S>): Spec<S> {
  return spec;
}
