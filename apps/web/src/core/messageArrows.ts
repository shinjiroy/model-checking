/**
 * トレースのchannelsメタデータから、ステップごとのメッセージ矢印(送信/受信)を導出する。
 *
 * 検査器のCheckResultはchannelsで「どの状態フィールドがどの方向のチャネルか」を教えてくれるが、
 * 「そのチャネルにいつメッセージが乗り/降りたか」はトレースの前後ステップの配列長を比較しないと
 * 分からない。判定ルールは単純で、対象フィールドの配列長が
 * - 直前のステップより増えていれば送信(from→toのチャネルへメッセージが積まれた)
 * - 直前のステップより減っていれば受信(toの主体がメッセージを取り出した)
 * とする。矢印の向き(from→to)はどちらの場合もチャネル定義そのままで、送信/受信は
 * あくまで「そのステップで何が起きたか」の注釈にすぎない。
 */
import type { ChannelDef } from "@model-checking/spec";

export type MessageArrow = {
  /** チャネルの状態フィールド名 */
  field: string;
  from: string;
  to: string;
  /** このステップでチャネルに何が起きたか */
  kind: "send" | "receive";
};

/**
 * 直前ステップの状態(prevState)と現在ステップの状態(state)を比較し、
 * channelsに登録された各フィールドについて発生したメッセージ矢印を返す。
 * 初期ステップ(prevStateがundefined)やchannels未指定の仕様では常に空配列を返す。
 */
export function detectMessageArrows(
  prevState: unknown,
  state: unknown,
  channels: Record<string, ChannelDef> | undefined,
): MessageArrow[] {
  if (!channels || prevState === undefined) return [];
  if (!isPlainRecord(prevState) || !isPlainRecord(state)) return [];

  const arrows: MessageArrow[] = [];
  for (const [field, def] of Object.entries(channels)) {
    const prevArr = prevState[field];
    const curArr = state[field];
    if (!Array.isArray(prevArr) || !Array.isArray(curArr)) continue;

    if (curArr.length > prevArr.length) {
      arrows.push({ field, from: def.from, to: def.to, kind: "send" });
    } else if (curArr.length < prevArr.length) {
      arrows.push({ field, from: def.from, to: def.to, kind: "receive" });
    }
  }
  return arrows;
}

/** 矢印を「▶ from→to: field」のような1行の注釈テキストにする */
export function formatMessageArrow(arrow: MessageArrow): string {
  return `▶ ${arrow.from}→${arrow.to}: ${arrow.field}`;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
