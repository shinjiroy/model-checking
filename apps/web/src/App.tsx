import { useCallback, useEffect, useRef, useState } from "react";
import { DropZone } from "./ui/DropZone.js";
import { EntrySelector } from "./ui/EntrySelector.js";
import { SpecPicker } from "./ui/SpecPicker.js";
import { CheckControls, DEFAULT_MAX_STATES } from "./ui/CheckControls.js";
import { ErrorView } from "./ui/ErrorView.js";
import { ResultPanel } from "./ui/ResultPanel.js";
import { ModelResultPanel } from "./ui/ModelResultPanel.js";
import { ShareControls } from "./ui/ShareControls.js";
import { WatchControls } from "./ui/WatchControls.js";
import { useCheckWorker } from "./ui/useCheckWorker.js";
import { useDirectoryWatch } from "./ui/useDirectoryWatch.js";
import { guessEntry } from "./ui/fileTree.js";
import { pickDirectoryWatchTarget, readAllFromWatchTarget } from "./ui/fsaWatchTarget.js";
import { decideAnalyzeQueueAction } from "./ui/analyzeQueue.js";
import { decodeSharePayload, parseShareFragment } from "./core/share.js";

type PendingSpecAction = { specName: string; autoCheck: boolean };
type PendingAnalyze = { files: Record<string, string>; entry: string; specAction: PendingSpecAction | null };

export function App() {
  const { state, analyze, runCheck, cancel, reset } = useCheckWorker();
  const [files, setFiles] = useState<Record<string, string>>({});
  const [entry, setEntry] = useState<string>("");
  const [selectedSpec, setSelectedSpec] = useState<string | null>(null);
  const [maxStates, setMaxStates] = useState(DEFAULT_MAX_STATES);
  const [shareLoadError, setShareLoadError] = useState<string | null>(null);
  const [directoryError, setDirectoryError] = useState<string | null>(null);
  const [openingDirectory, setOpeningDirectory] = useState(false);

  const fileNames = Object.keys(files);

  // ウォッチモード・共有URL復元は、Workerの準備(初期化 or キャンセル後の再生成)ができるまで
  // analyzeを待たせる必要があるため、キューを介す。通常の「解析する」ボタンはボタン自体が
  // workerReadyでなければ無効化されているので、キューを使わず直接analyze()を呼べばよい
  const pendingAnalyzeRef = useRef<PendingAnalyze | null>(null);
  const pendingSpecActionRef = useRef<PendingSpecAction | null>(null);
  const selectedSpecRef = useRef(selectedSpec);
  selectedSpecRef.current = selectedSpec;
  const maxStatesRef = useRef(maxStates);
  maxStatesRef.current = maxStates;
  const stateRef = useRef(state);
  stateRef.current = state;

  const flushPendingAnalyze = useCallback(() => {
    const pending = pendingAnalyzeRef.current;
    if (!pending) return;
    pendingAnalyzeRef.current = null;
    setFiles(pending.files);
    setEntry(pending.entry);
    setSelectedSpec(null);
    pendingSpecActionRef.current = pending.specAction;
    analyze(pending.files, pending.entry);
  }, [analyze]);

  // 実行中(analyzing/checking)なら直列化のためcancel()して最新ファイルで再実行、
  // アイドルかつWorker未準備ならworkerReadyのuseEffectに任せる、準備済みなら即analyzeする。
  // 判断ロジック自体はui/analyzeQueue.tsの純関数(decideAnalyzeQueueAction)に切り出してテストしている
  const queueAnalyze = useCallback(
    (pending: PendingAnalyze) => {
      pendingAnalyzeRef.current = pending;
      const decision = decideAnalyzeQueueAction(stateRef.current);
      if (decision === "cancel") {
        // 実行中の解析・検査をキャンセルしてWorkerを再生成する。世代ガード(checkWorkerReducer.ts)
        // により、旧Workerからの遅延メッセージがこの新しいファイルの結果を上書きすることはない
        cancel();
      } else if (decision === "flush-now") {
        flushPendingAnalyze();
      }
      // "wait" の場合はworkerReadyを監視するuseEffectで後から処理する
    },
    [cancel, flushPendingAnalyze],
  );

  // Workerが(再)準備できたタイミングでキュー済みのanalyzeを流し込む
  useEffect(() => {
    if (state.workerReady && pendingAnalyzeRef.current) {
      flushPendingAnalyze();
    }
  }, [state.workerReady, flushPendingAnalyze]);

  // Spec形・ModelDef形のエクスポートが1件なら自動選択する。ウォッチモード・共有URL由来のpendingがあれば、
  // それが解析結果に存在する場合に選択し(specActionのautoCheckがtrueなら自動検査も実行する)
  useEffect(() => {
    if (!state.exports) return;
    let nextSelected: string | null = state.exports.length === 1 ? state.exports[0]!.name : null;

    const pending = pendingSpecActionRef.current;
    if (pending) {
      pendingSpecActionRef.current = null;
      if (state.exports.some((e) => e.name === pending.specName)) {
        nextSelected = pending.specName;
        if (pending.autoCheck) {
          runCheck(pending.specName, maxStatesRef.current);
        }
      }
    }

    if (nextSelected) setSelectedSpec(nextSelected);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 解析結果(exports)が変わった時だけ処理する
  }, [state.exports]);

  const handleWatchChange = useCallback(
    (newFiles: Record<string, string>) => {
      const nextEntry =
        newFiles[entry] !== undefined ? entry : (guessEntry(newFiles) ?? Object.keys(newFiles)[0] ?? "");
      const specAction = selectedSpecRef.current ? { specName: selectedSpecRef.current, autoCheck: true } : null;
      queueAnalyze({ files: newFiles, entry: nextEntry, specAction });
    },
    [entry, queueAnalyze],
  );

  const watch = useDirectoryWatch(handleWatchChange);

  function handleFilesLoaded(newFiles: Record<string, string>) {
    watch.stop();
    pendingAnalyzeRef.current = null;
    pendingSpecActionRef.current = null;
    setShareLoadError(null);
    setFiles(newFiles);
    setEntry(guessEntry(newFiles) ?? Object.keys(newFiles)[0] ?? "");
    setSelectedSpec(null);

    // 解析・検査の実行中に新しいファイルを読み込んだ場合はcancel()で確実に無効化する。
    // reset()だけでは旧Workerが実行中の作業をやめず、後から届く古い結果が新しいファイルに
    // 対して表示されてしまう(世代ガードで守られるのはcancel()した場合のみ)
    if (state.analyzing || state.checking) {
      cancel();
    } else {
      // 前回読み込み分の解析結果・spec選択肢・検査結果・エラー表示が残らないようにクリアする
      reset();
    }
  }

  async function handleOpenDirectory() {
    setOpeningDirectory(true);
    setDirectoryError(null);
    try {
      const picked = await pickDirectoryWatchTarget();
      if (!picked) return; // ユーザーがピッカーをキャンセルした
      const initialFiles = await readAllFromWatchTarget(picked.target);
      handleFilesLoaded(initialFiles);
      await watch.start(picked.name, picked.target);
    } catch (error) {
      const message =
        error instanceof DOMException && error.name === "SecurityError"
          ? "フォルダへのアクセスが拒否されました"
          : `フォルダの読み込みに失敗しました: ${error instanceof Error ? error.message : String(error)}`;
      setDirectoryError(message);
    } finally {
      setOpeningDirectory(false);
    }
  }

  function handleAnalyze() {
    if (!entry) return;
    pendingSpecActionRef.current = null;
    setSelectedSpec(null);
    analyze(files, entry);
  }

  function handleRunCheck() {
    if (!selectedSpec) return;
    runCheck(selectedSpec, maxStates);
  }

  // ページ読み込み時、location.hashに共有URL(#s=...)が含まれていればファイルを復元して自動解析する。
  // 検査の自動実行はしない(specNameが解析結果に存在すれば選択状態にするだけ)。
  // maxStatesが含まれていれば検査設定に反映し(旧URLはundefinedのため現行既定値のまま)、
  // 打ち切り条件込みで反例を再現できるようにする
  useEffect(() => {
    const encoded = parseShareFragment(window.location.hash);
    if (!encoded) return;
    void (async () => {
      const result = await decodeSharePayload(encoded);
      if (!result.ok) {
        setShareLoadError(result.message);
        return;
      }
      const { files: sharedFiles, entry: sharedEntry, specName, maxStates: sharedMaxStates } = result.payload;
      if (sharedMaxStates !== undefined) setMaxStates(sharedMaxStates);
      const specAction = specName ? { specName, autoCheck: false } : null;
      queueAnalyze({ files: sharedFiles, entry: sharedEntry, specAction });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- マウント時に一度だけ実行する
  }, []);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">モデル検査SPA</h1>
      <p className="mt-2 text-sm text-slate-600">
        TypeScriptで書いた仕様(状態・アクション・不変条件)をブラウザ内で検査し、反例を可視化します。
      </p>

      {shareLoadError && (
        <section className="my-6 rounded-xl border border-rose-300 bg-rose-50 p-5" role="alert">
          <h2 className="panel-title text-rose-800">共有URLの読み込みエラー</h2>
          <p className="text-sm whitespace-pre-wrap text-rose-900">{shareLoadError}</p>
        </section>
      )}

      {directoryError && (
        <section className="my-6 rounded-xl border border-rose-300 bg-rose-50 p-5" role="alert">
          <h2 className="panel-title text-rose-800">フォルダの読み込みエラー</h2>
          <p className="text-sm whitespace-pre-wrap text-rose-900">{directoryError}</p>
        </section>
      )}

      <DropZone onFilesLoaded={handleFilesLoaded} />
      <WatchControls
        dirName={watch.dirName}
        onOpenDirectory={() => void handleOpenDirectory()}
        onStop={watch.stop}
        busy={openingDirectory}
      />

      {fileNames.length > 0 && (
        <>
          <EntrySelector fileNames={fileNames} entry={entry} onChange={setEntry} />
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleAnalyze}
            disabled={!state.workerReady || state.analyzing || state.checking}
          >
            {!state.workerReady ? "Workerを初期化中…" : state.analyzing ? "解析中…" : "解析する"}
          </button>
          <ShareControls files={files} entry={entry} specName={selectedSpec} maxStates={maxStates} />
        </>
      )}

      {state.error && <ErrorView error={state.error} />}

      {state.exports && (
        <>
          <SpecPicker exports={state.exports} selected={selectedSpec} onChange={setSelectedSpec} />
          <CheckControls
            maxStates={maxStates}
            onMaxStatesChange={setMaxStates}
            checking={state.checking}
            statesExplored={state.statesExplored}
            onRunCheck={handleRunCheck}
            onCancel={cancel}
            disabled={!selectedSpec || state.checking}
            kind={state.exports.find((e) => e.name === selectedSpec)?.kind ?? null}
          />
        </>
      )}

      {state.result &&
        (state.result.kind === "spec" ? (
          <ResultPanel result={state.result.result} />
        ) : (
          <ModelResultPanel result={state.result.result} />
        ))}
    </main>
  );
}
