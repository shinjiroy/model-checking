/**
 * 非同期処理の「古い結果を破棄する」ためのシンプルな世代管理。
 * `start()` を呼ぶたびに新しい世代のトークンを返す。`isCurrent(token)` でそのトークンが
 * まだ最新かどうかを判定できるため、ポーリングや監視のように `clearInterval` 等では
 * 止められない進行中の非同期処理(例: 監視停止直後に完了する`fetch`/`await`)の結果を
 * 安全に無視できる(呼び出し側は`.then()`の中で`isCurrent`をチェックし、falseなら何もしない)。
 */
export type SessionGuard = {
  /** 新しい世代を開始し、そのトークンを返す */
  start: () => number;
  /** 現在の世代を無効化する(次にstart()するまで、それ以前のどのトークンも古くなる) */
  invalidate: () => void;
  /** トークンが現在も最新の世代かどうか */
  isCurrent: (token: number) => boolean;
};

export function createSessionGuard(): SessionGuard {
  let current = 0;

  return {
    start: () => {
      current += 1;
      return current;
    },
    invalidate: () => {
      current += 1;
    },
    isCurrent: (token: number) => token === current,
  };
}
