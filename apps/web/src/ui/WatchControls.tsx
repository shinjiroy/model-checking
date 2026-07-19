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
    <section>
      <h2>ウォッチモード</h2>
      {dirName ? (
        <div className="watch-indicator">
          <p>
            監視中: <strong>{dirName}</strong>(保存すると自動で再検査します)
          </p>
          <button type="button" onClick={onStop}>
            監視を停止
          </button>
        </div>
      ) : (
        <button type="button" onClick={onOpenDirectory} disabled={busy}>
          フォルダを開いて監視
        </button>
      )}
    </section>
  );
}
