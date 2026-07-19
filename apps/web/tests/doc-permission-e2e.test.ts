import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import { bundleSpec, type EsbuildLike } from "../src/core/bundle.js";
import { executeBundle } from "../src/core/execute.js";
import { detectExports } from "../src/core/detect.js";
import { loadSpecSources } from "./helpers/specSources.js";
import type { ModelCheckResult } from "@model-checking/spec";

const nodeEsbuild = esbuild as unknown as EsbuildLike;
const specSources = loadSpecSources();

const docPermissionSource = readFileSync(
  fileURLToPath(new URL("../../../examples/doc-permission.ts", import.meta.url)),
  "utf-8",
);

describe("M4受け入れ基準の裏付け: examples/doc-permission.ts の権限モデル反例", () => {
  test("実テキストをWorkerと同等のパイプライン(bundle→execute→checkModel)で処理し、反例が出る", async () => {
    const bundled = await bundleSpec(
      nodeEsbuild,
      { "doc-permission.ts": docPermissionSource },
      "doc-permission.ts",
      specSources,
    );
    expect(bundled.ok).toBe(true);
    if (!bundled.ok) return;

    const executed = executeBundle(bundled.code, "__specModule__");
    expect(executed.ok).toBe(true);
    if (!executed.ok) return;

    const found = detectExports(executed.moduleExports);
    expect(found).toEqual([{ name: "docPermissionModel", kind: "model" }]);

    const model = executed.moduleExports[found[0]!.name];
    const { checkModel } = await import("@model-checking/spec");
    const result = checkModel(model as Parameters<typeof checkModel>[0]) as ModelCheckResult;

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.assertion).toBe("onlyOwnerOrAdminCanEdit");

    const { instance } = result;
    expect(instance.atoms.User).toEqual(["User0", "User1"]);
    expect(instance.atoms.Doc).toEqual(["Doc0"]);

    // 反例には「owner でも admin でもないのに sharedWith 経由で canEdit を持つユーザー」が含まれる
    const ownerKeys = new Set(instance.relations.owner!.map((t) => t.join(",")));
    const adminUsers = new Set(instance.relations.admin!.map((t) => t.join(",")));
    const sharedWithKeys = new Set(instance.relations.sharedWith!.map((t) => t.join(",")));

    const offending = instance.relations.canEdit!.find(([u, d]) => {
      const key = `${u},${d}`;
      return !ownerKeys.has(key) && !adminUsers.has(u!) && sharedWithKeys.has(key);
    });
    expect(offending).toBeDefined();
  });
});
