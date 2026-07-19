/**
 * WatchTargetを1秒間隔でポーリングし、変化があればコールバックを呼ぶReactフック。
 * ポーリングのタイマー(setInterval)自体はここ(UI層)の責務とし、
 * 変更検知そのもの(スナップショット比較)はcore/watch.tsの純関数に委譲する。
 *
 * stop()はclearInterval()するが、すでに開始してしまった1回分のpollWatchTarget()の
 * Promiseはそれ自体を中断できない。そのPromiseが停止後に解決してonChangeを呼んでしまわないよう、
 * core/session.tsのSessionGuardで「このポーリングは今のセッションのものか」を確認してから適用する。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { createSessionGuard } from "../core/session.js";
import { pollWatchTarget, toSnapshot, type WatchSnapshot, type WatchTarget } from "../core/watch.js";

const POLL_INTERVAL_MS = 1000;

export function useDirectoryWatch(onChange: (files: Record<string, string>) => void): {
  dirName: string | null;
  start: (name: string, target: WatchTarget) => Promise<void>;
  stop: () => void;
} {
  const [dirName, setDirName] = useState<string | null>(null);
  const targetRef = useRef<WatchTarget | null>(null);
  const snapshotRef = useRef<WatchSnapshot>({});
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollingRef = useRef(false);
  const sessionGuardRef = useRef(createSessionGuard());
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const stop = useCallback(() => {
    sessionGuardRef.current.invalidate(); // 進行中のポーリングの結果を無効化する
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    targetRef.current = null;
    setDirName(null);
  }, []);

  const start = useCallback(async (name: string, target: WatchTarget) => {
    if (intervalRef.current !== null) clearInterval(intervalRef.current);

    const session = sessionGuardRef.current.start();
    targetRef.current = target;
    // 初期スナップショットを取得する(この時点ではonChangeを呼ばない。呼び出し側が
    // フォルダを開いた直後の内容をすでに読み込んで使っているため)
    const initialFiles = await target.listFiles();
    if (!sessionGuardRef.current.isCurrent(session)) return; // 待っている間にstop()された

    snapshotRef.current = toSnapshot(initialFiles);
    setDirName(name);

    intervalRef.current = setInterval(() => {
      if (pollingRef.current) return; // 前回のポーリングがまだ終わっていなければスキップする
      const currentTarget = targetRef.current;
      if (!currentTarget) return;
      pollingRef.current = true;
      void pollWatchTarget(currentTarget, snapshotRef.current)
        .then((result) => {
          if (!sessionGuardRef.current.isCurrent(session)) return; // 停止済みのセッションの結果は破棄する
          if (result.changed) {
            snapshotRef.current = result.snapshot;
            onChangeRef.current(result.files);
          }
        })
        .finally(() => {
          pollingRef.current = false;
        });
    }, POLL_INTERVAL_MS);
  }, []);

  useEffect(() => () => stop(), [stop]);

  return { dirName, start, stop };
}
