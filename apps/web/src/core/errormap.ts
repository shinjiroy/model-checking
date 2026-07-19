/**
 * 実行時エラー(プレーンオブジェクト違反・frozen状態への破壊的変更などのTypeError)の
 * スタックトレース先頭のユーザーフレームを、バンドルに埋め込まれたinlineソースマップ
 * (source-map-js)で元ファイル・行・列へ解決する。解決できない場合はメッセージのみへフォールバックする。
 */
import { SourceMapConsumer, type RawSourceMap } from "source-map-js";
import { SPEC_NAMESPACE, USER_NAMESPACE } from "./bundle.js";
import { FUNCTION_WRAPPER_LINE_OFFSET } from "./execute.js";

export type MappedLocation = {
  file: string;
  line: number;
  column: number;
};

export type MappedError = {
  message: string;
  location: MappedLocation | null;
};

const SOURCE_MAPPING_URL_MARKER = "//# sourceMappingURL=data:application/json";

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

/** バンドルコードの末尾に埋め込まれたinline source mapを取り出す */
export function extractInlineSourceMap(code: string): RawSourceMap | null {
  const idx = code.lastIndexOf(SOURCE_MAPPING_URL_MARKER);
  if (idx === -1) return null;
  const base64Match = code.slice(idx).match(/base64,([A-Za-z0-9+/=]+)/);
  if (!base64Match) return null;
  try {
    return JSON.parse(decodeBase64(base64Match[1]!)) as RawSourceMap;
  } catch {
    return null;
  }
}

function decodeBase64(base64: string): string {
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder("utf-8").decode(bytes);
}

/** V8のスタックトレース1行から末尾の `line:column` を取り出す */
function parseStackFrame(line: string): { line: number; column: number } | null {
  const match = line.match(/(\d+):(\d+)\)?\s*$/);
  if (!match) return null;
  return { line: Number(match[1]), column: Number(match[2]) };
}

/** stack先頭(エラーメッセージ行を除く)の最初のフレームを取り出す */
function firstFrame(stack: string): { line: number; column: number } | null {
  const lines = stack.split("\n").slice(1);
  for (const line of lines) {
    const frame = parseStackFrame(line);
    if (frame) return frame;
  }
  return null;
}

function normalizeSourceName(source: string): string {
  const withoutSlash = source.startsWith("/") ? source.slice(1) : source;
  for (const namespace of [USER_NAMESPACE, SPEC_NAMESPACE]) {
    const prefix = `${namespace}:`;
    if (withoutSlash.startsWith(prefix)) return withoutSlash.slice(prefix.length);
  }
  return withoutSlash;
}

/**
 * 実行時エラーをバンドルコードのinline source mapを使って元ソース位置へマッピングする。
 * error.stackが無い/マップできない場合はlocation: nullでメッセージのみ返す。
 */
export function mapExecutionError(error: unknown, bundledCode: string): MappedError {
  const message = errorMessage(error);
  const stack = error instanceof Error ? error.stack : undefined;
  if (!stack) return { message, location: null };

  const rawMap = extractInlineSourceMap(bundledCode);
  if (!rawMap) return { message, location: null };

  const frame = firstFrame(stack);
  if (!frame) return { message, location: null };

  try {
    const consumer = new SourceMapConsumer(rawMap);
    // executeBundle は new Function(body) でコードを実行するため、V8が報告する行番号は
    // execute.ts の FUNCTION_WRAPPER_LINE_OFFSET 分だけbody(=バンドル済みコード)の実際の行より大きい。
    // sourcemapを引く前に差し引く(列はこのプリアンブルが改行で終わるためズレない)
    const generatedLine = Math.max(1, frame.line - FUNCTION_WRAPPER_LINE_OFFSET);
    const position = consumer.originalPositionFor({ line: generatedLine, column: Math.max(0, frame.column - 1) });
    if (position.source == null || position.line == null) {
      return { message, location: null };
    }
    return {
      message,
      location: {
        file: normalizeSourceName(position.source),
        line: position.line,
        column: (position.column ?? 0) + 1,
      },
    };
  } catch {
    return { message, location: null };
  }
}
