import { defineSpec } from "@model-checking/spec";

/**
 * 題材: 注文キャンセルと決済Webhookの競合。
 * handleWebhookが現在の注文状態を確認せずWebhookの内容を反映するため、
 * キャンセル済みの注文が課金確定される反例が存在する。
 */

export type Order = "pending" | "authorized" | "captured" | "cancelled";
export type Webhook = "authorized" | "captured";

type State = {
  order: Order;
  /** 決済リクエスト済みか(二重リクエストはしない前提。状態空間を有界に保つ) */
  paymentRequested: boolean;
  /** 決済プロバイダから届いた未処理のWebhook */
  webhooks: Webhook[];
  /** 補助変数: 一度でもキャンセルされたか(時系列性質を不変条件で書くため) */
  wasCancelled: boolean;
};

export const orderPaymentSpec = defineSpec<State>({
  init: {
    order: "pending",
    paymentRequested: false,
    webhooks: [],
    wasCancelled: false,
  },

  actions: {
    // 決済をリクエストする(プロバイダは成功し、Webhookを積む)
    requestPayment: {
      when: s => s.order === "pending" && !s.paymentRequested,
      then: s => ({ ...s, paymentRequested: true, webhooks: [...s.webhooks, "authorized"] }),
    },

    // 届いたWebhookを処理する
    handleWebhook: {
      when: s => s.webhooks.length > 0,
      then: s => {
        const [head, ...rest] = s.webhooks;
        return {
          ...s,
          order: head!, // バグ: 現在の注文状態を確認せずWebhookの内容をそのまま反映
          webhooks: head === "authorized" ? [...rest, "captured"] : rest,
        };
      },
    },

    // ユーザーがキャンセルする
    cancel: {
      when: s => s.order === "pending" || s.order === "authorized",
      then: s => ({ ...s, order: "cancelled", wasCancelled: true }),
    },
  },

  invariants: {
    // キャンセルした注文が後から課金確定されることはない
    cancelledOrderIsNeverCaptured: s => !(s.order === "captured" && s.wasCancelled),
  },

  // Webhookを処理しきっていれば、発火可能なアクションがなくても正常終了
  accepting: s => s.webhooks.length === 0,
});
