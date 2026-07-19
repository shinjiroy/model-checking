import { describe, expect, test } from "vitest";
import * as esbuild from "esbuild";
import { bundleSpec, type EsbuildLike } from "../src/core/bundle.js";
import { executeBundle } from "../src/core/execute.js";
import { detectExports, isModelDefLike, isSpecLike } from "../src/core/detect.js";
import { loadSpecSources } from "./helpers/specSources.js";

const nodeEsbuild = esbuild as unknown as EsbuildLike;
const specSources = loadSpecSources();

async function bundleAndExecute(files: Record<string, string>, entry = "main.ts") {
  const bundled = await bundleSpec(nodeEsbuild, files, entry, specSources);
  if (!bundled.ok) throw new Error(`bundle failed: ${JSON.stringify(bundled.errors)}`);
  return executeBundle(bundled.code, "__specModule__");
}

describe("detectExports: 0件・1件・複数件(Spec形)", () => {
  test("Spec形のエクスポートが0件なら空配列", async () => {
    const executed = await bundleAndExecute({ "main.ts": `export const notASpec = 42;` });
    expect(executed.ok).toBe(true);
    if (!executed.ok) return;
    expect(detectExports(executed.moduleExports)).toEqual([]);
  });

  test("Spec形のエクスポートが1件なら1件返す", async () => {
    const executed = await bundleAndExecute({
      "main.ts": `
        import { defineSpec } from "@model-checking/spec";
        export const mySpec = defineSpec({ init: { n: 0 }, actions: {} });
      `,
    });
    expect(executed.ok).toBe(true);
    if (!executed.ok) return;
    expect(detectExports(executed.moduleExports)).toEqual([{ name: "mySpec", kind: "spec" }]);
  });

  test("Spec形のエクスポートが複数件ならすべて返す", async () => {
    const executed = await bundleAndExecute({
      "main.ts": `
        import { defineSpec } from "@model-checking/spec";
        export const specA = defineSpec({ init: { n: 0 }, actions: {} });
        export const specB = defineSpec({ init: { m: 1 }, actions: {} });
        export const notASpec = "plain string";
      `,
    });
    expect(executed.ok).toBe(true);
    if (!executed.ok) return;
    const names = detectExports(executed.moduleExports).map(e => e.name).sort();
    expect(names).toEqual(["specA", "specB"]);
  });
});

describe("detectExports: ModelDef形の判定", () => {
  test("ModelDef形(sorts+assertions)のエクスポートはkind: 'model'で検出される", async () => {
    const executed = await bundleAndExecute({
      "main.ts": `
        import { defineModel, forall, rel, not } from "@model-checking/spec";
        export const myModel = defineModel({
          sorts: ["User"],
          relations: { admin: ["User"] },
          assertions: { noAdmins: forall("User", u => not(rel("admin", u))) },
          scope: { User: 1 },
        });
      `,
    });
    expect(executed.ok).toBe(true);
    if (!executed.ok) return;
    expect(detectExports(executed.moduleExports)).toEqual([{ name: "myModel", kind: "model" }]);
  });

  test("Spec形とModelDef形が混在するモジュールは、それぞれ正しいkindで検出される", async () => {
    const executed = await bundleAndExecute({
      "main.ts": `
        import { defineSpec, defineModel, forall, rel, not } from "@model-checking/spec";
        export const mySpec = defineSpec({ init: { n: 0 }, actions: {} });
        export const myModel = defineModel({
          sorts: ["User"],
          relations: { admin: ["User"] },
          assertions: { noAdmins: forall("User", u => not(rel("admin", u))) },
          scope: { User: 1 },
        });
      `,
    });
    expect(executed.ok).toBe(true);
    if (!executed.ok) return;
    const found = detectExports(executed.moduleExports).sort((a, b) => a.name.localeCompare(b.name));
    expect(found).toEqual([
      { name: "myModel", kind: "model" },
      { name: "mySpec", kind: "spec" },
    ]);
  });
});

describe("isSpecLike / isModelDefLike", () => {
  test("initとactionsを持つオブジェクトはSpec形と判定する", () => {
    expect(isSpecLike({ init: {}, actions: {} })).toBe(true);
  });

  test("actionsを欠くオブジェクトはSpec形でない", () => {
    expect(isSpecLike({ init: {} })).toBe(false);
  });

  test("null・プリミティブはSpec形でない", () => {
    expect(isSpecLike(null)).toBe(false);
    expect(isSpecLike(42)).toBe(false);
    expect(isSpecLike("spec")).toBe(false);
  });

  test("sortsとassertionsを持つオブジェクトはModelDef形と判定する", () => {
    expect(isModelDefLike({ sorts: ["User"], assertions: {} })).toBe(true);
  });

  test("sortsが配列でない、またはassertionsを欠くオブジェクトはModelDef形でない", () => {
    expect(isModelDefLike({ sorts: "User", assertions: {} })).toBe(false);
    expect(isModelDefLike({ sorts: ["User"] })).toBe(false);
  });

  test("Spec形とModelDef形は判定が排他的(お互いを誤検出しない)", () => {
    expect(isModelDefLike({ init: {}, actions: {} })).toBe(false);
    expect(isSpecLike({ sorts: ["User"], assertions: {} })).toBe(false);
  });
});

describe("executeBundle: 実行時throwの捕捉", () => {
  test("トップレベルで例外を投げるコードはok:falseで捕捉される", async () => {
    const bundled = await bundleSpec(
      nodeEsbuild,
      { "main.ts": `throw new Error("boom");` },
      "main.ts",
      specSources,
    );
    expect(bundled.ok).toBe(true);
    if (!bundled.ok) return;

    const executed = executeBundle(bundled.code, "__specModule__");
    expect(executed.ok).toBe(false);
    if (executed.ok) return;
    expect(executed.error).toBeInstanceOf(Error);
    expect((executed.error as Error).message).toBe("boom");
  });
});
