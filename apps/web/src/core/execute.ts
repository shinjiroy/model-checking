/**
 * バンドル済みIIFEコードを実行し、モジュールのエクスポートを取り出す。
 *
 * `new Function(code + "; return globalName;")` という形で実行することで、
 * バンドルが`var globalName = (() => {...})()`のように宣言する値を
 * (グローバルスコープを汚さずに)関数のローカル変数として受け取り、そのまま返す。
 */

export type ExecuteResult =
  | { ok: true; moduleExports: Record<string, unknown> }
  | { ok: false; error: unknown };

/**
 * `new Function(body)` はV8内部でソースを `function anonymous(\n) {\n` + body + `\n}` として
 * 合成する(このプリアンブルは常に2行)ため、body内で投げられた例外のスタックトレース上の
 * 行番号は実ソース(bodyの1行目を1とする行番号)より必ずこの分だけ大きくなる。
 * errormap.tsはこの値を差し引いてからinline source mapを引く。
 * ラッパの構造(この2行のプリアンブル)を変えたら、この値も合わせて変更すること
 */
export const FUNCTION_WRAPPER_LINE_OFFSET = 2;

export function executeBundle(code: string, globalName: string): ExecuteResult {
  try {
    // eslint-disable-next-line no-new-func -- Worker内のサンドボックスで仕様コードを実行するための意図的な使用
    const run = new Function(`${code}\n;return ${globalName};`) as () => unknown;
    const moduleExports = run();
    if (moduleExports === null || typeof moduleExports !== "object") {
      return { ok: true, moduleExports: {} };
    }
    return { ok: true, moduleExports: moduleExports as Record<string, unknown> };
  } catch (error) {
    return { ok: false, error };
  }
}
