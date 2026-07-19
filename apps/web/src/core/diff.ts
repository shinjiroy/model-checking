/**
 * 状態スナップショット間のdiff計算。トレースのステップ再生UIで、
 * 「直前ステップから何が変わったか」を追加/変更/削除に分類して示すために使う。
 *
 * 配列の要素はインデックス対応(prev[i] vs next[i])ではなく、共通プレフィックス・共通サフィックスを
 * 揃えたうえで中間だけを比較する(先頭一致・末尾一致をそれぞれ前方/後方から検出する)。
 * こうすることでFIFOの先頭取り出し([1,2] → [2])のような「全要素が1つずつズレる」変更が
 * 「各要素が変更された」というノイズにならず、実際に増減した要素だけが added/removed になる。
 * 中間区間の要素数が一致する場合は位置ペアごとに再帰的に比較し(added/removedではなくchanged等になりうる)、
 * 要素数が異なる場合はその差分だけをadded/removedとして報告する。
 *
 * pathのインデックス表記は、削除(removed)は変更前配列でのインデックス、追加(added)は変更後配列での
 * インデックスを指す(中間区間で要素数が変わると、削除側と追加側で同じ数値が別の要素を指すことがある)。
 */

export type DiffEntry = {
  path: string;
  kind: "added" | "removed" | "changed";
  before?: unknown;
  after?: unknown;
};

export function diff(prev: unknown, next: unknown): DiffEntry[] {
  const entries: DiffEntry[] = [];
  walk("", prev, next, entries);
  return entries;
}

function walk(path: string, prev: unknown, next: unknown, out: DiffEntry[]): void {
  if (Object.is(prev, next)) return;

  if (isPlainRecord(prev) && isPlainRecord(next)) {
    const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
    for (const key of keys) {
      const childPath = path ? `${path}.${key}` : key;
      const hasPrev = Object.prototype.hasOwnProperty.call(prev, key);
      const hasNext = Object.prototype.hasOwnProperty.call(next, key);
      if (!hasPrev) out.push({ path: childPath, kind: "added", after: next[key] });
      else if (!hasNext) out.push({ path: childPath, kind: "removed", before: prev[key] });
      else walk(childPath, prev[key], next[key], out);
    }
    return;
  }

  if (Array.isArray(prev) && Array.isArray(next)) {
    walkArray(path, prev, next, out);
    return;
  }

  out.push({ path: path || "(root)", kind: "changed", before: prev, after: next });
}

function walkArray(path: string, prev: unknown[], next: unknown[], out: DiffEntry[]): void {
  const minLen = Math.min(prev.length, next.length);

  let prefix = 0;
  while (prefix < minLen && deepEqual(prev[prefix], next[prefix])) prefix++;

  let suffix = 0;
  while (suffix < minLen - prefix && deepEqual(prev[prev.length - 1 - suffix], next[next.length - 1 - suffix])) {
    suffix++;
  }

  const prevMiddleStart = prefix;
  const prevMiddleEnd = prev.length - suffix;
  const nextMiddleStart = prefix;
  const nextMiddleEnd = next.length - suffix;
  const prevMiddleLen = prevMiddleEnd - prevMiddleStart;
  const nextMiddleLen = nextMiddleEnd - nextMiddleStart;
  const pairLen = Math.min(prevMiddleLen, nextMiddleLen);

  // 中間区間のうち両側に存在する位置は再帰的に比較する(prefix直後から始まるため、
  // prev側・next側で同じインデックス値になる)
  for (let k = 0; k < pairLen; k++) {
    const index = prefix + k;
    walk(`${path}[${index}]`, prev[prevMiddleStart + k], next[nextMiddleStart + k], out);
  }

  // prevの方が中間区間が長い分は削除(変更前配列でのインデックス)
  for (let k = pairLen; k < prevMiddleLen; k++) {
    const index = prevMiddleStart + k;
    out.push({ path: `${path}[${index}]`, kind: "removed", before: prev[index] });
  }

  // nextの方が中間区間が長い分は追加(変更後配列でのインデックス)
  for (let k = pairLen; k < nextMiddleLen; k++) {
    const index = nextMiddleStart + k;
    out.push({ path: `${path}[${index}]`, kind: "added", after: next[index] });
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** 配列の共通プレフィックス/サフィックスを検出するための厳密な構造的等価性判定 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;

  if (isPlainRecord(a) && isPlainRecord(b)) {
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((key) => Object.prototype.hasOwnProperty.call(b, key) && deepEqual(a[key], b[key]));
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((value, index) => deepEqual(value, b[index]));
  }

  return false;
}
