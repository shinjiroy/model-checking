import type { Instance } from "@model-checking/spec";

type Props = {
  instance: Instance;
};

/**
 * データモデル検査の反例インスタンスを可視化する: ソートごとの原子一覧+関係ごとのタプルの表。
 * 「誰が・どのドキュメントに・なぜ権限を持ってしまったか」を、関係の表を見比べることで追えるようにする。
 */
export function InstanceView({ instance }: Props) {
  return (
    <div className="mt-4">
      <h3 className="mb-2 text-lg font-bold text-slate-900">原子(ソートごと)</h3>
      <ul className="space-y-1 font-mono text-base text-slate-700">
        {Object.entries(instance.atoms).map(([sort, atoms]) => (
          <li key={sort}>
            <strong>{sort}</strong>: {atoms.length > 0 ? atoms.join(", ") : "(なし)"}
          </li>
        ))}
      </ul>

      <h3 className="mt-5 mb-2 text-lg font-bold text-slate-900">関係</h3>
      {Object.entries(instance.relations).map(([name, tuples]) => (
        <div key={name} className="my-3 overflow-x-auto">
          <table className="border-collapse font-mono text-sm">
            <caption className="mb-1 text-left font-sans text-base font-semibold text-slate-700">{name}</caption>
            <tbody>
              {tuples.length === 0 ? (
                <tr>
                  <td className="border border-slate-300 px-2.5 py-1.5 text-slate-400 italic">(空)</td>
                </tr>
              ) : (
                tuples.map((tuple, index) => (
                  <tr key={index}>
                    {tuple.map((value, column) => (
                      <td key={column} className="border border-slate-300 px-2.5 py-1.5">
                        {value}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
