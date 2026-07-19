import { diff, type DiffEntry } from "../core/diff.js";

function formatValue(value: unknown): string {
  if (value === undefined) return "undefined";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

const KIND_LABEL: Record<DiffEntry["kind"], string> = {
  added: "追加",
  changed: "変更",
  removed: "削除",
};

type Props = {
  prevState: unknown;
  state: unknown;
  isInitial: boolean;
};

/**
 * 選択ステップの状態スナップショットを、直前ステップとのdiff付きで表示する。
 * 初期状態(isInitial)は直前が存在しないため、全フィールドを追加として表示する。
 */
export function StateDiffView({ prevState, state, isInitial }: Props) {
  const entries = diff(isInitial ? {} : prevState, state);

  return (
    <div className="state-diff">
      <h3>{isInitial ? "初期状態" : "直前ステップからの差分"}</h3>
      {entries.length === 0 ? (
        <p className="state-diff__empty">変化なし</p>
      ) : (
        <ul className="state-diff__list">
          {entries.map((entry) => (
            <li key={entry.path} className={`state-diff__entry state-diff__entry--${entry.kind}`}>
              <span className="state-diff__kind">{KIND_LABEL[entry.kind]}</span>
              <span className="state-diff__path">{entry.path}</span>
              {entry.kind === "changed" && (
                <span className="state-diff__value">
                  {formatValue(entry.before)} → {formatValue(entry.after)}
                </span>
              )}
              {entry.kind === "added" && <span className="state-diff__value">{formatValue(entry.after)}</span>}
              {entry.kind === "removed" && <span className="state-diff__value">{formatValue(entry.before)}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
