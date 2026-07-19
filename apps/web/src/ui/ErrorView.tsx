import type { WorkerError } from "./checkWorkerReducer.js";

const PHASE_LABEL: Record<WorkerError["phase"], string> = {
  bundle: "構文エラー(バンドル)",
  execute: "実行時エラー",
  check: "検査中のエラー",
};

type Props = {
  error: WorkerError;
};

export function ErrorView({ error }: Props) {
  return (
    <section className="error-panel" role="alert">
      <h2>{PHASE_LABEL[error.phase]}</h2>
      {error.location && (
        <p className="error-location">
          位置: {error.location.file}:{error.location.line}:{error.location.column}
        </p>
      )}
      <p className="error-message">{error.message}</p>
    </section>
  );
}
