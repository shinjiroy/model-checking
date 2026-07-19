/**
 * ワンクリックデモ用: examples/*.ts をViteの `?raw` importでテキストのまま取り込む。
 */
import tutorialWithdrawSource from "../../../../examples/tutorial-withdraw.ts?raw";
import paymentRetrySource from "../../../../examples/payment-retry.ts?raw";
import orderPaymentSource from "../../../../examples/order-payment.ts?raw";
import docPermissionSource from "../../../../examples/doc-permission.ts?raw";
import conduitFavoriteCountSource from "../../../../examples/conduit-favorite-count.ts?raw";
import conduitCommentDeleteSource from "../../../../examples/conduit-comment-delete.ts?raw";

export type DemoSpec = {
  label: string;
  fileName: string;
  source: string;
};

export const demoSpecs: DemoSpec[] = [
  {
    label: "tutorial-withdraw(入門: 残高がマイナスになる)",
    fileName: "tutorial-withdraw.ts",
    source: tutorialWithdrawSource,
  },
  { label: "payment-retry(二重課金)", fileName: "payment-retry.ts", source: paymentRetrySource },
  { label: "order-payment(キャンセル競合)", fileName: "order-payment.ts", source: orderPaymentSource },
  { label: "doc-permission(権限の抜け漏れ)", fileName: "doc-permission.ts", source: docPermissionSource },
  {
    label: "conduit-favorite-count(favorite数の二重管理)",
    fileName: "conduit-favorite-count.ts",
    source: conduitFavoriteCountSource,
  },
  {
    label: "conduit-comment-delete(コメント削除権限)",
    fileName: "conduit-comment-delete.ts",
    source: conduitCommentDeleteSource,
  },
];
