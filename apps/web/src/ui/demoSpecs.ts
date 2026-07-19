/**
 * ワンクリックデモ用: examples/*.ts をViteの `?raw` importでテキストのまま取り込む。
 */
import paymentRetrySource from "../../../../examples/payment-retry.ts?raw";
import orderPaymentSource from "../../../../examples/order-payment.ts?raw";
import docPermissionSource from "../../../../examples/doc-permission.ts?raw";

export type DemoSpec = {
  label: string;
  fileName: string;
  source: string;
};

export const demoSpecs: DemoSpec[] = [
  { label: "payment-retry(二重課金)", fileName: "payment-retry.ts", source: paymentRetrySource },
  { label: "order-payment(キャンセル競合)", fileName: "order-payment.ts", source: orderPaymentSource },
  { label: "doc-permission(権限の抜け漏れ)", fileName: "doc-permission.ts", source: docPermissionSource },
];
