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

export type Spec<S> = {
  init: S;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  actions: Record<string, ActionDef<S, any>>;
  invariants?: Record<string, (state: S) => boolean>;
  /** 発火可能なアクションがなくても正常終了とみなす状態(デッドロック判定から除外) */
  accepting?: (state: S) => boolean;
};

export function defineSpec<S>(spec: Spec<S>): Spec<S> {
  return spec;
}
