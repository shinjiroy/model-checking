import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { readDroppedFiles, readSelectedFiles } from "./fileTree.js";
import { demoSpecs } from "./demoSpecs.js";

type Props = {
  onFilesLoaded: (files: Record<string, string>) => void;
};

export function DropZone({ onFilesLoaded }: Props) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragOver(false);
    try {
      const files = await readDroppedFiles(event.dataTransfer);
      if (Object.keys(files).length === 0) {
        setLoadError(".ts / .tsxファイルが見つかりませんでした");
        return;
      }
      setLoadError(null);
      onFilesLoaded(files);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleFileInput(event: ChangeEvent<HTMLInputElement>) {
    const fileList = event.target.files;
    if (!fileList || fileList.length === 0) return;
    try {
      const files = await readSelectedFiles(fileList);
      setLoadError(null);
      onFilesLoaded(files);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : String(error));
    } finally {
      event.target.value = "";
    }
  }

  return (
    <section className="panel">
      <div
        className={`flex flex-col items-center gap-3 rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
          isDragOver ? "border-blue-500 bg-blue-50" : "border-slate-300 bg-slate-50"
        }`}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={(event) => void handleDrop(event)}
      >
        <p className="text-sm text-slate-600">仕様ファイル(.ts)をドラッグ&ドロップ、またはフォルダごとドロップ</p>
        <button type="button" className="btn btn-secondary" onClick={() => inputRef.current?.click()}>
          ファイルを選択
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".ts,.tsx"
          hidden
          onChange={(event) => void handleFileInput(event)}
        />
      </div>
      {loadError && <p className="mt-3 text-sm font-semibold text-rose-700">{loadError}</p>}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="text-sm text-slate-600">ワンクリックデモ:</span>
        {demoSpecs.map((demo) => (
          <button
            key={demo.fileName}
            type="button"
            className="btn btn-secondary"
            onClick={() => onFilesLoaded({ [demo.fileName]: demo.source })}
          >
            {demo.label}
          </button>
        ))}
      </div>
    </section>
  );
}
