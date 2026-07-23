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

// diffの3種はどれも「違反」ではないため、意味の階層(rose/amber)とは別の弱い色で塗り分ける
const KIND_STYLE: Record<DiffEntry["kind"], string> = {
  added: "bg-emerald-50 text-emerald-900",
  changed: "bg-sky-50 text-sky-900",
  removed: "bg-slate-100 text-slate-700",
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
    <div>
      <h3 className="mb-2 text-lg font-bold text-slate-900">{isInitial ? "初期状態" : "直前ステップからの差分"}</h3>
      {entries.length === 0 ? (
        <p className="text-base text-slate-500">変化なし</p>
      ) : (
        <ul className="space-y-1">
          {entries.map((entry) => (
            <li
              key={entry.path}
              className={`flex flex-wrap items-baseline gap-2 rounded-lg px-2 py-1.5 font-mono text-sm ${KIND_STYLE[entry.kind]}`}
            >
              <span className="rounded bg-white/70 px-1.5 py-0.5 text-xs font-semibold">
                {KIND_LABEL[entry.kind]}
              </span>
              <span className="font-semibold">{entry.path}</span>
              {entry.kind === "changed" && (
                <span>
                  {formatValue(entry.before)} → {formatValue(entry.after)}
                </span>
              )}
              {entry.kind === "added" && <span>{formatValue(entry.after)}</span>}
              {entry.kind === "removed" && <span>{formatValue(entry.before)}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
