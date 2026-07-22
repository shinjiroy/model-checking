import { useState, type ChangeEvent } from "react";

export const DEFAULT_MAX_STATES = 1_000_000;

/** maxStates入力欄の文字列を検証する。1以上の整数のみ許可し、空・0・小数・負数・非数値はnull(不正)とする */
function parseMaxStates(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^[0-9]+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  if (!Number.isSafeInteger(value) || value <= 0) return null;
  return value;
}

type Props = {
  maxStates: number;
  onMaxStatesChange: (value: number) => void;
  checking: boolean;
  statesExplored: number;
  onRunCheck: () => void;
  onCancel: () => void;
  disabled: boolean;
  /** 検査対象の種別。データモデルの場合は入力欄のラベルを「探索するインスタンス数」に読み替える */
  kind?: "spec" | "model" | null;
};

export function CheckControls({
  maxStates,
  onMaxStatesChange,
  checking,
  statesExplored,
  onRunCheck,
  onCancel,
  disabled,
  kind = "spec",
}: Props) {
  // 入力中の生文字列をローカルで保持する(型変換で"0"や不正値を黙って既定値に丸めないため)
  const [rawInput, setRawInput] = useState(String(maxStates));
  const parsed = parseMaxStates(rawInput);
  const isInvalid = parsed === null;
  const fieldName = kind === "model" ? "maxInstances" : "maxStates";
  const label =
    kind === "model" ? `${fieldName}(検査するインスタンス数の上限)` : `${fieldName}(探索する状態数の上限)`;
  const progressLabel = kind === "model" ? "検査済みインスタンス数" : "探索済み状態数";

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const value = event.target.value;
    setRawInput(value);
    const next = parseMaxStates(value);
    if (next !== null) onMaxStatesChange(next);
  }

  return (
    <section className="panel">
      <h2 className="panel-title">検査</h2>
      <label className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
        <span>{label}:</span>
        <input
          type="number"
          min={1}
          step={1}
          className="field-input w-44"
          value={rawInput}
          disabled={checking}
          onChange={handleChange}
          aria-invalid={isInvalid}
        />
      </label>
      {isInvalid && (
        <p className="mt-2 text-sm font-semibold text-rose-700">{fieldName}は1以上の整数で入力してください</p>
      )}
      <div className="mt-4 flex items-center gap-3">
        {!checking ? (
          <button type="button" className="btn btn-primary" onClick={onRunCheck} disabled={disabled || isInvalid}>
            検査する
          </button>
        ) : (
          <button type="button" className="btn btn-danger" onClick={onCancel}>
            キャンセル
          </button>
        )}
        {checking && (
          <p className="text-sm text-slate-600" role="status">
            {progressLabel}: <span className="font-semibold text-slate-900">{statesExplored.toLocaleString("ja-JP")}</span>
          </p>
        )}
      </div>
    </section>
  );
}
