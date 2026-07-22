type Props = {
  fileNames: string[];
  entry: string;
  onChange: (entry: string) => void;
};

export function EntrySelector({ fileNames, entry, onChange }: Props) {
  return (
    <section className="panel">
      <h2 className="panel-title">読み込んだファイル</h2>
      <p className="text-sm text-slate-600">
        エントリファイル(defineSpecまたはdefineModelをexportしているファイル)を選択してください。
      </p>
      <ul className="mt-3 space-y-1">
        {fileNames.map((name) => (
          <li key={name}>
            <label className="choice-row">
              <input
                type="radio"
                name="entry"
                className="size-4 accent-blue-600"
                checked={entry === name}
                onChange={() => onChange(name)}
              />
              <span className="font-mono">{name}</span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}
