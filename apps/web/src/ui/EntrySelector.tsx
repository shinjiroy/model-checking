type Props = {
  fileNames: string[];
  entry: string;
  onChange: (entry: string) => void;
};

export function EntrySelector({ fileNames, entry, onChange }: Props) {
  return (
    <section>
      <h2>読み込んだファイル</h2>
      <p>エントリファイル(defineSpecまたはdefineModelをexportしているファイル)を選択してください。</p>
      <ul className="file-list">
        {fileNames.map((name) => (
          <li key={name}>
            <label>
              <input type="radio" name="entry" checked={entry === name} onChange={() => onChange(name)} />
              {name}
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}
