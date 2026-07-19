import { describe, expect, test } from "vitest";
import {
  buildShareUrl,
  decodeSharePayload,
  encodeSharePayload,
  isShareUrlTooLong,
  parseShareFragment,
  type SharePayload,
} from "../src/core/share.js";

describe("share: encode→decodeのラウンドトリップ", () => {
  test("単一ファイルの往復", async () => {
    const payload: SharePayload = {
      version: 1,
      files: { "main.ts": "export const x = 1;" },
      entry: "main.ts",
    };
    const encoded = await encodeSharePayload(payload);
    const result = await decodeSharePayload(encoded);
    expect(result).toEqual({ ok: true, payload });
  });

  test("複数ファイル・specName付きの往復", async () => {
    const payload: SharePayload = {
      version: 1,
      files: {
        "main.ts": "import { defineSpec } from '@model-checking/spec';",
        "sub/util.ts": "export const helper = () => 1;",
      },
      entry: "main.ts",
      specName: "mySpec",
    };
    const encoded = await encodeSharePayload(payload);
    const result = await decodeSharePayload(encoded);
    expect(result).toEqual({ ok: true, payload });
  });

  test("maxStates付きの往復(打ち切り条件込みで反例を再現できるようにする)", async () => {
    const payload: SharePayload = {
      version: 1,
      files: { "main.ts": "export const x = 1;" },
      entry: "main.ts",
      specName: "mySpec",
      maxStates: 250_000,
    };
    const encoded = await encodeSharePayload(payload);
    const result = await decodeSharePayload(encoded);
    expect(result).toEqual({ ok: true, payload });
  });

  test("旧payload(maxStatesフィールドなし)を復元してもmaxStatesはundefined(後方互換)", async () => {
    // version 1 の時点で存在した(maxStates追加前の)形のpayloadを想定
    const encoded = await encodeRawPayload({
      version: 1,
      files: { "main.ts": "export const x = 1;" },
      entry: "main.ts",
    });
    const result = await decodeSharePayload(encoded);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.maxStates).toBeUndefined();
    expect(result.payload).toEqual({
      version: 1,
      files: { "main.ts": "export const x = 1;" },
      entry: "main.ts",
    });
  });

  test("日本語・絵文字を含むソースの往復", async () => {
    const payload: SharePayload = {
      version: 1,
      files: {
        "main.ts": "// 日本語コメント 🎉\nexport const 名前 = 'こんにちは 🚀';",
      },
      entry: "main.ts",
    };
    const encoded = await encodeSharePayload(payload);
    const result = await decodeSharePayload(encoded);
    expect(result).toEqual({ ok: true, payload });
  });

  test("圧縮によりURLが元のJSONより短くなる(繰り返しの多いソースの場合)", async () => {
    const repeated = "export const x = 1;\n".repeat(200);
    const payload: SharePayload = { version: 1, files: { "main.ts": repeated }, entry: "main.ts" };
    const encoded = await encodeSharePayload(payload);
    expect(encoded.length).toBeLessThan(JSON.stringify(payload).length);
  });

  test("base64urlに使えない文字(+ / =)を含まない", async () => {
    const payload: SharePayload = { version: 1, files: { "main.ts": "x".repeat(5000) }, entry: "main.ts" };
    const encoded = await encodeSharePayload(payload);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe("share: 壊れた入力のエラー", () => {
  test("base64として不正な文字列", async () => {
    const result = await decodeSharePayload("これはbase64urlではない!!!");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain("共有URLを読み込めませんでした");
    expect(result.message).toContain("base64");
  });

  test("base64としては妥当だが展開(deflate-raw)に失敗するデータ", async () => {
    // "AAAA" はbase64urlとして妥当だが、deflate-rawとしては不正なバイト列
    const result = await decodeSharePayload("AAAA");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain("展開に失敗しました");
  });

  test("展開はできるがJSONとして不正な文字列", async () => {
    const bytes = new TextEncoder().encode("これはJSONではない{{{");
    const encoded = await compressToBase64Url(bytes);
    const result = await decodeSharePayload(encoded);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain("JSONの解析に失敗しました");
  });

  test("versionが1以外", async () => {
    const encoded = await encodeRawPayload({ version: 2, files: {}, entry: "main.ts" });
    const result = await decodeSharePayload(encoded);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain("対応していないバージョンです");
  });

  test("filesが文字列でないプロパティを含む(型不一致)", async () => {
    const encoded = await encodeRawPayload({ version: 1, files: { "main.ts": 42 }, entry: "main.ts" });
    const result = await decodeSharePayload(encoded);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain("filesの内容が不正です");
  });

  test("filesが配列(オブジェクトでない)", async () => {
    const encoded = await encodeRawPayload({ version: 1, files: ["main.ts"], entry: "main.ts" });
    const result = await decodeSharePayload(encoded);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain("filesの形式が不正です");
  });

  test("entryが欠けている", async () => {
    const encoded = await encodeRawPayload({ version: 1, files: {} });
    const result = await decodeSharePayload(encoded);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain("entryの形式が不正です");
  });

  test("specNameが文字列でない", async () => {
    const encoded = await encodeRawPayload({ version: 1, files: {}, entry: "main.ts", specName: 123 });
    const result = await decodeSharePayload(encoded);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain("specNameの形式が不正です");
  });

  test("maxStatesが数値でない", async () => {
    const encoded = await encodeRawPayload({ version: 1, files: {}, entry: "main.ts", maxStates: "many" });
    const result = await decodeSharePayload(encoded);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain("maxStatesの形式が不正です");
  });

  test("maxStatesが0以下", async () => {
    const encoded = await encodeRawPayload({ version: 1, files: {}, entry: "main.ts", maxStates: 0 });
    const result = await decodeSharePayload(encoded);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain("maxStatesの形式が不正です");
  });

  test("トップレベルがオブジェクトでない(配列)", async () => {
    const encoded = await encodeRawPayload([1, 2, 3]);
    const result = await decodeSharePayload(encoded);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain("データの形式が不正です");
  });

  test("空文字列", async () => {
    const result = await decodeSharePayload("");
    expect(result.ok).toBe(false);
  });
});

describe("share: URL組み立て・フラグメント解析", () => {
  test("buildShareUrlはハッシュに s=<encoded> を付ける", () => {
    const url = buildShareUrl("https://example.com/app/", "abc123");
    expect(url).toBe("https://example.com/app/#s=abc123");
  });

  test("parseShareFragmentは#付き/なしどちらも読める", () => {
    expect(parseShareFragment("#s=abc123")).toBe("abc123");
    expect(parseShareFragment("s=abc123")).toBe("abc123");
  });

  test("s=を含まないハッシュはnull", () => {
    expect(parseShareFragment("#other=xyz")).toBeNull();
    expect(parseShareFragment("")).toBeNull();
    expect(parseShareFragment("#")).toBeNull();
  });

  test("isShareUrlTooLongは閾値を超えた場合にtrue", () => {
    expect(isShareUrlTooLong("a".repeat(32_000))).toBe(false);
    expect(isShareUrlTooLong("a".repeat(32_001))).toBe(true);
  });
});

// --- テストヘルパー: share.tsの内部圧縮ロジックを経由せず、任意のオブジェクトをpayload風にエンコードする ---

async function compressToBase64Url(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const cs = new CompressionStream("deflate-raw");
  const writer = cs.writable.getWriter();
  const readPromise = readAll(cs.readable);
  const writePromise = (async () => {
    await writer.write(bytes);
    await writer.close();
  })();
  const [compressed] = await Promise.all([readPromise, writePromise]);
  return toBase64Url(compressed);
}

async function encodeRawPayload(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  return compressToBase64Url(bytes);
}

async function readAll(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      total += value.length;
    }
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
