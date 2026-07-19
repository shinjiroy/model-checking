/**
 * 状態の正規化キー。キー順をソートしたJSON表現で、
 * プロパティの列挙順に依存しない等価性判定に使う。
 */
export function canonicalKey(value: unknown): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "string":
    case "number":
    case "boolean":
      return JSON.stringify(value);
    case "object": {
      if (Array.isArray(value)) {
        return `[${value.map(canonicalKey).join(",")}]`;
      }
      const proto = Object.getPrototypeOf(value);
      if (proto !== Object.prototype && proto !== null) {
        throw new TypeError(
          `状態にプレーンオブジェクト以外が含まれています: ${proto.constructor?.name ?? "unknown"}。` +
            "状態はJSONシリアライズ可能なプレーンオブジェクト・配列・プリミティブに限定してください",
        );
      }
      const entries = Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([k, v]) => `${JSON.stringify(k)}:${canonicalKey(v)}`);
      return `{${entries.join(",")}}`;
    }
    default:
      throw new TypeError(
        `状態に${typeof value}型の値が含まれています。` +
          "状態はJSONシリアライズ可能なプレーンオブジェクト・配列・プリミティブに限定してください",
      );
  }
}
