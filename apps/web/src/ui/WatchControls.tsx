import { supportsFileSystemAccess } from "./fsaWatchTarget.js";

type Props = {
  dirName: string | null;
  onOpenDirectory: () => void;
  onStop: () => void;
  busy: boolean;
};

/**
 * File System Access API対応ブラウザ(Chrome/Edge系)でのみ「フォルダを開いて監視」ボタンを表示する。
 * 非対応ブラウザでは何も表示せず、ドラッグ&ドロップ経路にフォールバックする。
 */
export function WatchControls({ dirName, onOpenDirectory, onStop, busy }: Props) {
  if (!supportsFileSystemAccess) return null;

  return (
    <section className="panel">
      <h2 className="panel-title">ウォッチモード</h2>
      {dirName ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-600">
            監視中: <strong className="font-mono text-slate-900">{dirName}</strong>(保存すると自動で再検査します)
          </p>
          <button type="button" className="btn btn-secondary" onClick={onStop}>
            監視を停止
          </button>
        </div>
      ) : (
        <button type="button" className="btn btn-secondary" onClick={onOpenDirectory} disabled={busy}>
          フォルダを開いて監視
        </button>
      )}
    </section>
  );
}
