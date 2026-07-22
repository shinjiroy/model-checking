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
    <section className="my-6 rounded-xl border border-rose-300 bg-rose-50 p-5" role="alert">
      <h2 className="panel-title text-rose-800">{PHASE_LABEL[error.phase]}</h2>
      {error.location && (
        <p className="font-mono text-base text-rose-700">
          位置: {error.location.file}:{error.location.line}:{error.location.column}
        </p>
      )}
      <pre className="mt-2 overflow-x-auto text-base whitespace-pre-wrap text-rose-900">{error.message}</pre>
    </section>
  );
}
