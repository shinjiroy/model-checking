import { describe, expect, test } from "vitest";
import * as esbuild from "esbuild";
import { bundleSpec, type EsbuildLike } from "../src/core/bundle.js";
import { executeBundle } from "../src/core/execute.js";
import { mapExecutionError } from "../src/core/errormap.js";
import { loadSpecSources } from "./helpers/specSources.js";

const nodeEsbuild = esbuild as unknown as EsbuildLike;
const specSources = loadSpecSources();

async function bundleAndRun(source: string) {
  const files = { "main.ts": source };
  const bundled = await bundleSpec(nodeEsbuild, files, "main.ts", specSources);
  if (!bundled.ok) throw new Error(`bundle failed: ${JSON.stringify(bundled.errors)}`);
  const executed = executeBundle(bundled.code, "__specModule__");
  return { bundled, executed };
}

describe("受け入れ基準2の裏付け: 実行時エラーの位置特定", () => {
  test("(a) 状態にMapを入れた仕様はcanonical.tsの日本語TypeErrorになり、元ソース位置(spec-source内)に解決される", async () => {
    const { bundled, executed } = await bundleAndRun(`
      import { defineSpec, check } from "@model-checking/spec";

      const spec = defineSpec({
        init: { m: new Map() },
        actions: { noop: { then: (s: unknown) => s } },
        accepting: () => true,
      });

      export const result = check(spec);
    `);

    expect(executed.ok).toBe(false);
    if (executed.ok) return;

    const error = executed.error as Error;
    expect(error).toBeInstanceOf(TypeError);
    expect(error.message).toContain("状態にプレーンオブジェクト以外が含まれています");
    expect(error.message).toContain("Map");

    const mapped = mapExecutionError(error, bundled.ok ? bundled.code : "");
    expect(mapped.location).not.toBeNull();
    // packages/spec/src/canonical.ts の `throw new TypeError(` 行(仮想namespace内)へ解決される
    expect(mapped.location!.file).toBe("canonical.ts");
    expect(mapped.location!.line).toBe(18);
    expect(mapped.location!.column).toBe(15);
  });

  test("(b) then内でs.charged++する仕様はstrictモードのTypeErrorになり、元ソース位置(main.ts)に解決される", async () => {
    const { bundled, executed } = await bundleAndRun(`
      import { defineSpec, check } from "@model-checking/spec";

      const spec = defineSpec({
        init: { charged: 0 },
        actions: {
          bump: {
            then: (s: { charged: number }) => {
              s.charged++;
              return s;
            },
          },
        },
        accepting: () => true,
      });

      export const result = check(spec);
    `);

    expect(executed.ok).toBe(false);
    if (executed.ok) return;

    const error = executed.error as Error;
    expect(error).toBeInstanceOf(TypeError);
    expect(error.message).toContain("read only property");

    const mapped = mapExecutionError(error, bundled.ok ? bundled.code : "");
    expect(mapped.location).not.toBeNull();
    expect(mapped.location!.file).toBe("main.ts");
    expect(mapped.location!.line).toBe(9); // `s.charged++;` の行
  });
});

describe("errormap: フォールバック", () => {
  test("stackを持たないエラーはlocation: nullでメッセージのみ返す", () => {
    const mapped = mapExecutionError("plain string error", "");
    expect(mapped).toEqual({ message: "plain string error", location: null });
  });

  test("source mapが存在しないコードはlocation: nullにフォールバックする", () => {
    const error = new Error("boom");
    const mapped = mapExecutionError(error, "// no sourcemap here");
    expect(mapped.message).toBe("boom");
    expect(mapped.location).toBeNull();
  });
});
