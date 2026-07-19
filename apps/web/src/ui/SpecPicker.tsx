import type { DetectedExport } from "../core/detect.js";

const KIND_LABEL: Record<DetectedExport["kind"], string> = {
  spec: "状態機械",
  model: "データモデル",
};

type Props = {
  exports: DetectedExport[];
  selected: string | null;
  onChange: (name: string) => void;
};

/** Spec形・ModelDef形のエクスポートが複数あるとき、検査対象を選ばせる(1件なら呼び出し側が自動選択する) */
export function SpecPicker({ exports: found, selected, onChange }: Props) {
  if (found.length <= 1) return null;

  return (
    <section>
      <h2>検査対象の選択</h2>
      <p>複数の検査対象がexportされています。検査するものを選んでください。</p>
      <ul className="file-list">
        {found.map(({ name, kind }) => (
          <li key={name}>
            <label>
              <input type="radio" name="spec" checked={selected === name} onChange={() => onChange(name)} />
              {name} <span className="kind-label">({KIND_LABEL[kind]})</span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}
