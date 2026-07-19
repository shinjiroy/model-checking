/**
 * URLフラグメント共有のコーデック。仕様のソース全ファイル(バンドル後ではない)を
 * JSON化→CompressionStreamで圧縮→base64url化して `#s=<payload>` に載せる。
 * サーバーへ送信せず、開いた側でそのまま編集を続けられるようにするための往復変換。
 *
 * CompressionStream/DecompressionStreamはNode 18+・全モダンブラウザに存在するため、
 * 依存ライブラリを追加せずに実装できる(ブラウザ/nodeの両方でvitestからテストできる)。
 */

export type SharePayload = {
  version: 1;
  files: Record<string, string>;
  entry: string;
  specName?: string;
  /** 打ち切り条件込みで反例を再現できるよう、共有時のmaxStatesも載せる。旧URL(このフィールドが
   *  無いもの)はundefinedになり、復元側で現行の既定値にフォールバックする */
  maxStates?: number;
};

export type DecodeShareResult = { ok: true; payload: SharePayload } | { ok: false; message: string };

const COMPRESSION_FORMAT: CompressionFormat = "deflate-raw";
const SHARE_HASH_KEY = "s";

/** URL全体がこの文字数を超える場合、チャット等で切れる可能性がある旨をUI側で警告する目安 */
export const SHARE_URL_LENGTH_WARNING_THRESHOLD = 32_000;

export function isShareUrlTooLong(url: string): boolean {
  return url.length > SHARE_URL_LENGTH_WARNING_THRESHOLD;
}

export async function encodeSharePayload(payload: SharePayload): Promise<string> {
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  const compressed = await compress(bytes);
  return uint8ArrayToBase64Url(compressed);
}

export async function decodeSharePayload(encoded: string): Promise<DecodeShareResult> {
  let compressed: Uint8Array<ArrayBuffer>;
  try {
    compressed = base64UrlToUint8Array(encoded);
  } catch {
    return decodeFailure("base64のデコードに失敗しました");
  }

  let bytes: Uint8Array;
  try {
    bytes = await decompress(compressed);
  } catch {
    return decodeFailure("データの展開に失敗しました");
  }

  let json: string;
  try {
    json = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return decodeFailure("文字列の復元に失敗しました");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return decodeFailure("JSONの解析に失敗しました");
  }

  return validatePayload(parsed);
}

/** 現在のURL(location.href相当)を基準に、共有用フラグメント `#s=<encoded>` を付けたURLを組み立てる */
export function buildShareUrl(currentUrl: string, encoded: string): string {
  const url = new URL(currentUrl);
  url.hash = `${SHARE_HASH_KEY}=${encoded}`;
  return url.toString();
}

/** location.hash(先頭 `#` を含んでいてもいなくてもよい)から共有payloadのエンコード文字列を取り出す */
export function parseShareFragment(hash: string): string | null {
  const trimmed = hash.startsWith("#") ? hash.slice(1) : hash;
  const params = new URLSearchParams(trimmed);
  const value = params.get(SHARE_HASH_KEY);
  return value && value.length > 0 ? value : null;
}

function decodeFailure(reason: string): DecodeShareResult {
  return { ok: false, message: `共有URLを読み込めませんでした: ${reason}` };
}

function validatePayload(value: unknown): DecodeShareResult {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return decodeFailure("データの形式が不正です");
  }
  const record = value as Record<string, unknown>;

  if (record.version !== 1) {
    return decodeFailure("対応していないバージョンです");
  }
  if (typeof record.entry !== "string") {
    return decodeFailure("entryの形式が不正です");
  }
  if (typeof record.files !== "object" || record.files === null || Array.isArray(record.files)) {
    return decodeFailure("filesの形式が不正です");
  }

  const files: Record<string, string> = {};
  for (const [key, fileValue] of Object.entries(record.files as Record<string, unknown>)) {
    if (typeof fileValue !== "string") {
      return decodeFailure("filesの内容が不正です");
    }
    files[key] = fileValue;
  }

  if (record.specName !== undefined && typeof record.specName !== "string") {
    return decodeFailure("specNameの形式が不正です");
  }

  if (
    record.maxStates !== undefined &&
    (typeof record.maxStates !== "number" || !Number.isFinite(record.maxStates) || record.maxStates <= 0)
  ) {
    return decodeFailure("maxStatesの形式が不正です");
  }

  const payload: SharePayload = { version: 1, files, entry: record.entry };
  if (typeof record.specName === "string") payload.specName = record.specName;
  if (typeof record.maxStates === "number") payload.maxStates = record.maxStates;
  return { ok: true, payload };
}

async function readAllChunks(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    // eslint-disable-next-line no-await-in-loop -- ストリームを順に読み切る必要がある
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      total += value.length;
    }
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

async function pumpThroughStream(
  writable: WritableStream<BufferSource>,
  readable: ReadableStream<Uint8Array>,
  bytes: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array> {
  const writer = writable.getWriter();
  // 読み取りは書き込みと並行して開始する(書き込み分を全部バッファせずに流せるようにするため)。
  // Promise.allで両方の完了/失敗を同じ同期区間内で待ち受けることで、
  // 「読み取り側が書き込み完了より先に失敗した場合に誰も拾わないまま拒否される」レースを避ける
  // (readPromise/writePromiseを個別にawaitで後から拾うと、拒否がその前に発生して
  // unhandled rejectionとして報告されることがある)
  const readPromise = readAllChunks(readable);
  const writePromise = (async () => {
    await writer.write(bytes);
    await writer.close();
  })();
  const [result] = await Promise.all([readPromise, writePromise]);
  return result;
}

function compress(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  const stream = new CompressionStream(COMPRESSION_FORMAT);
  return pumpThroughStream(stream.writable, stream.readable, bytes);
}

function decompress(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  const stream = new DecompressionStream(COMPRESSION_FORMAT);
  return pumpThroughStream(stream.writable, stream.readable, bytes);
}

function uint8ArrayToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  const base64 = btoa(binary);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToUint8Array(base64url: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]*$/.test(base64url)) {
    throw new Error("invalid base64url input");
  }
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
