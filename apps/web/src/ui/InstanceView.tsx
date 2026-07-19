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
    <div className="instance-view">
      <h3>原子(ソートごと)</h3>
      <ul className="atom-list">
        {Object.entries(instance.atoms).map(([sort, atoms]) => (
          <li key={sort}>
            <strong>{sort}</strong>: {atoms.length > 0 ? atoms.join(", ") : "(なし)"}
          </li>
        ))}
      </ul>

      <h3>関係</h3>
      {Object.entries(instance.relations).map(([name, tuples]) => (
        <div key={name} className="relation-table-wrapper">
          <table className="relation-table">
            <caption>{name}</caption>
            <tbody>
              {tuples.length === 0 ? (
                <tr>
                  <td className="relation-table__empty">(空)</td>
                </tr>
              ) : (
                tuples.map((tuple, index) => (
                  <tr key={index}>
                    {tuple.map((value, column) => (
                      <td key={column}>{value}</td>
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
