import type { ModelCheckResult } from "@model-checking/spec";
import { InstanceView } from "./InstanceView.js";

type Props = {
  result: ModelCheckResult;
};

/** データモデル・権限検証(checkModel)の結果表示。状態機械のResultPanelに相当する */
export function ModelResultPanel({ result }: Props) {
  if (result.ok) {
    return (
      <section className="my-6 rounded-xl border border-emerald-300 bg-emerald-50 p-5">
        <h2 className="panel-title text-emerald-800">検査成功</h2>
        <p className="text-base text-emerald-900">
          検査したインスタンス数: {result.instancesChecked.toLocaleString("ja-JP")}
        </p>
        <p className="text-base text-emerald-900">
          うちconstraintsを満たしたインスタンス数: {result.satisfiedInstances.toLocaleString("ja-JP")}
        </p>
        {result.satisfiedInstances === 0 && (
          <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-base font-semibold text-amber-800">
            制約を満たすインスタンスが存在しないため、性質は検証されていません(制約が矛盾していないか確認してください)。
          </p>
        )}
        {!result.complete && (
          <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-base font-semibold text-amber-800">
            maxInstancesにより打ち切りました。スコープが有界か確認するか、上限を引き上げて再度検査してください。
          </p>
        )}
      </section>
    );
  }

  return (
    <section className="my-6 overflow-hidden rounded-xl border border-rose-300 bg-white">
      <div className="border-b border-rose-300 bg-rose-50 px-5 py-4">
        <h2 className="text-lg font-bold text-rose-800">
          違反を検出: assertion「{result.assertion}」が破れるインスタンスが見つかりました
        </h2>
        <p className="mt-1 text-base text-rose-900">
          検査したインスタンス数: {result.instancesChecked.toLocaleString("ja-JP")}
        </p>
      </div>
      <div className="p-5">
        <InstanceView instance={result.instance} />
      </div>
    </section>
  );
}
