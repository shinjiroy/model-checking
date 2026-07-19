import { useState } from "react";
import { pruneUnreachableFiles } from "../core/bundle.js";
import { buildShareUrl, encodeSharePayload, isShareUrlTooLong, type SharePayload } from "../core/share.js";

type Props = {
  files: Record<string, string>;
  entry: string;
  specName: string | null;
  maxStates: number;
};

export function ShareControls({ files, entry, specName, maxStates }: Props) {
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const [createError, setCreateError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleCreate() {
    setBusy(true);
    setCopyStatus("idle");
    setCreateError(null);
    try {
      // entryから到達不能なファイルはバンドルに含まれず復元後の挙動に影響しないため、
      // 共有URLを短くするために除外する
      const payload: SharePayload = { version: 1, files: pruneUnreachableFiles(files, entry), entry, maxStates };
      if (specName) payload.specName = specName;

      const encoded = await encodeSharePayload(payload);
      const url = buildShareUrl(window.location.href, encoded);
      setShareUrl(url);
      window.history.replaceState(null, "", url);

      try {
        await navigator.clipboard.writeText(url);
        setCopyStatus("copied");
      } catch {
        setCopyStatus("failed");
      }
    } catch {
      // CompressionStream/クリップボードAPI非対応や、その他予期しない失敗をまとめて捕捉する
      setShareUrl(null);
      setCreateError("このブラウザは共有URLの作成に対応していません");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h2>共有</h2>
      <p>エントリから参照されている仕様ファイルをURLに埋め込みます(サーバーへは送信されません)。</p>
      <button type="button" onClick={() => void handleCreate()} disabled={busy}>
        {busy ? "作成中…" : "共有URLを作成"}
      </button>

      {createError && <p className="error-text">{createError}</p>}

      {shareUrl && (
        <div className="share-result">
          <input
            type="text"
            readOnly
            value={shareUrl}
            onFocus={(event) => event.currentTarget.select()}
            aria-label="共有URL"
          />
          {copyStatus === "copied" && <p className="share-status">クリップボードにコピーしました</p>}
          {copyStatus === "failed" && (
            <p className="error-text">クリップボードへのコピーに失敗しました。上のテキストボックスから手動でコピーしてください</p>
          )}
          {isShareUrlTooLong(shareUrl) && (
            <p className="warning-text">URLが長いため、チャット等に貼り付けると途中で切れる可能性があります</p>
          )}
        </div>
      )}
    </section>
  );
}
