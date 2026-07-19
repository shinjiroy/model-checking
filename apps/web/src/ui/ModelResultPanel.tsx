import type { ModelCheckResult } from "@model-checking/spec";
import { InstanceView } from "./InstanceView.js";

type Props = {
  result: ModelCheckResult;
};

/** データモデル・権限検証(checkModel)の結果表示。状態機械のResultPanelに相当する */
export function ModelResultPanel({ result }: Props) {
  if (result.ok) {
    return (
      <section className="result-panel result-panel--ok">
        <h2>検査成功</h2>
        <p>検査したインスタンス数: {result.instancesChecked.toLocaleString("ja-JP")}</p>
        <p>うちconstraintsを満たしたインスタンス数: {result.satisfiedInstances.toLocaleString("ja-JP")}</p>
        {result.satisfiedInstances === 0 && (
          <p className="warning-text">
            制約を満たすインスタンスが存在しないため、性質は検証されていません(制約が矛盾していないか確認してください)。
          </p>
        )}
        {!result.complete && (
          <p className="warning-text">
            maxInstancesにより打ち切りました。スコープが有界か確認するか、上限を引き上げて再度検査してください。
          </p>
        )}
      </section>
    );
  }

  return (
    <section className="result-panel result-panel--violation">
      <h2 className="violation-banner">違反を検出: assertion「{result.assertion}」が破れるインスタンスが見つかりました</h2>
      <p>検査したインスタンス数: {result.instancesChecked.toLocaleString("ja-JP")}</p>
      <InstanceView instance={result.instance} />
    </section>
  );
}
