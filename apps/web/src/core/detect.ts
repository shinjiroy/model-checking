/**
 * モジュールのエクスポートの中から、検査対象になりうる形の値を判定する。
 * DSL側の型(`Spec<S>`/`ModelDef`)をそのままimportせず構造的に判定することで、
 * バンドル後の(型情報を失った)実行時オブジェクトに対しても機械的に判定できるようにしている。
 *
 * - Spec形(状態機械): `defineSpec`が返す、`init`と`actions`を持つオブジェクト
 * - ModelDef形(データモデル・権限): `defineModel`が返す、`sorts`と`assertions`を持つオブジェクト
 */

export type ExportKind = "spec" | "model";

export type DetectedExport = {
  name: string;
  kind: ExportKind;
};

export function isSpecLike(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return "init" in record && typeof record.actions === "object" && record.actions !== null;
}

export function isModelDefLike(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return Array.isArray(record.sorts) && typeof record.assertions === "object" && record.assertions !== null;
}

/** モジュールのエクスポートから、Spec形・ModelDef形の値の一覧を種別付きで返す */
export function detectExports(moduleExports: Record<string, unknown>): DetectedExport[] {
  const result: DetectedExport[] = [];
  for (const [name, value] of Object.entries(moduleExports)) {
    if (isSpecLike(value)) result.push({ name, kind: "spec" });
    else if (isModelDefLike(value)) result.push({ name, kind: "model" });
  }
  return result;
}
