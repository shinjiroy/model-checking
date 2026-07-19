import { describe, expect, test } from "vitest";
import * as esbuild from "esbuild";
import { bundleSpec, type EsbuildLike } from "../src/core/bundle.js";
import { executeBundle } from "../src/core/execute.js";
import { loadSpecSources } from "./helpers/specSources.js";

// vitestはnode環境で動くため、テストではブラウザ用のesbuild-wasmではなくnode向けのネイティブesbuildを注入する。
// 両者はAPI互換なので、バンドルロジック(bundle.ts)はnodeで高速にテストできる。
const nodeEsbuild = esbuild as unknown as EsbuildLike;
const specSources = loadSpecSources();

describe("bundleSpec: 正常系", () => {
  test("単一ファイルの仕様をIIFEにバンドルできる", async () => {
    const result = await bundleSpec(
      nodeEsbuild,
      {
        "main.ts": `
          import { defineSpec } from "@model-checking/spec";
          export const spec = defineSpec({
            init: { n: 0 },
            actions: { inc: { then: (s: { n: number }) => ({ ...s, n: s.n + 1 }) } },
          });
        `,
      },
      "main.ts",
      specSources,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.code).toContain("__specModule__");

    const executed = executeBundle(result.code, "__specModule__");
    expect(executed.ok).toBe(true);
    if (!executed.ok) return;
    expect(executed.moduleExports.spec).toBeDefined();
  });

  test("相対パスの複数ファイルを解決してバンドルできる", async () => {
    const result = await bundleSpec(
      nodeEsbuild,
      {
        "main.ts": `
          import { defineSpec } from "@model-checking/spec";
          import { init } from "./state.js";
          export const spec = defineSpec({ init, actions: {} });
        `,
        "state.ts": `export const init = { n: 0 };`,
      },
      "main.ts",
      specSources,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const executed = executeBundle(result.code, "__specModule__");
    expect(executed.ok).toBe(true);
    if (!executed.ok) return;
    expect((executed.moduleExports.spec as { init: { n: number } }).init).toEqual({ n: 0 });
  });
});

describe("bundleSpec: 構文エラー", () => {
  test("構文エラーの位置(file/line/column)を返す", async () => {
    const result = await bundleSpec(
      nodeEsbuild,
      {
        "main.ts": `
          export const broken = {
        `,
      },
      "main.ts",
      specSources,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.length).toBeGreaterThan(0);
    const [error] = result.errors;
    expect(error!.file).toBe("main.ts");
    expect(error!.line).toBeGreaterThan(0);
    expect(error!.column).toBeGreaterThanOrEqual(0);
  });
});

describe("bundleSpec: 外部ライブラリのインポート拒否", () => {
  test("npmパッケージのインポートは理由付きで拒否される", async () => {
    const result = await bundleSpec(
      nodeEsbuild,
      {
        // 未使用のimportはesbuildのTS未使用importの除去によりresolveされないため、値として使う
        "main.ts": `import { debounce } from "lodash";\nexport const used = debounce;`,
      },
      "main.ts",
      specSources,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]!.message).toContain("外部ライブラリをインポートできません");
    expect(result.errors[0]!.message).toContain("@model-checking/spec");
  });
});

describe("bundleSpec: @model-checking/spec のエイリアス解決", () => {
  test("defineSpec/check/canonicalKeyの参照を含む実際のspecソースを解決できる", async () => {
    const result = await bundleSpec(
      nodeEsbuild,
      {
        "main.ts": `
          import { defineSpec, check } from "@model-checking/spec";
          const spec = defineSpec({
            init: { n: 0 },
            actions: { inc: { when: (s: { n: number }) => s.n < 2, then: (s: { n: number }) => ({ ...s, n: s.n + 1 }) } },
            accepting: () => true,
          });
          export const result = check(spec);
        `,
      },
      "main.ts",
      specSources,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const executed = executeBundle(result.code, "__specModule__");
    expect(executed.ok).toBe(true);
    if (!executed.ok) return;
    expect(executed.moduleExports.result).toMatchObject({ ok: true });
  });
});

describe("bundleSpec: ファイルが見つからない相対インポート", () => {
  test("存在しない相対パスはエラーになる", async () => {
    const result = await bundleSpec(
      nodeEsbuild,
      {
        "main.ts": `import { x } from "./missing.js";\nexport const used = x;`,
      },
      "main.ts",
      specSources,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]!.message).toContain("見つかりません");
  });
});

describe("bundleSpec: 仕様フォルダのルートを脱出する相対インポート", () => {
  test("トップレベルファイルから ../ で脱出しようとするとエラーになる", async () => {
    const result = await bundleSpec(
      nodeEsbuild,
      {
        "main.ts": `import { x } from "../secret.ts";\nexport const used = x;`,
      },
      "main.ts",
      specSources,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]!.message).toContain("仕様フォルダの外は参照できません");
  });

  test("サブディレクトリから複数階層 ../ を重ねて脱出しようとしてもエラーになる", async () => {
    const result = await bundleSpec(
      nodeEsbuild,
      {
        "sub/main.ts": `import { x } from "../../secret.ts";\nexport const used = x;`,
      },
      "sub/main.ts",
      specSources,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]!.message).toContain("仕様フォルダの外は参照できません");
  });

  test("ルート内に留まる ../ (兄弟ディレクトリの参照)は許可される", async () => {
    const result = await bundleSpec(
      nodeEsbuild,
      {
        "sub/main.ts": `import { x } from "../shared.ts";\nexport const used = x;`,
        "shared.ts": `export const x = 42;`,
      },
      "sub/main.ts",
      specSources,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const executed = executeBundle(result.code, "__specModule__");
    expect(executed.ok).toBe(true);
    if (!executed.ok) return;
    expect(executed.moduleExports.used).toBe(42);
  });
});

describe("bundleSpec: index.tsx解決", () => {
  test("拡張子省略のディレクトリimportはindex.tsxも候補にする", async () => {
    const result = await bundleSpec(
      nodeEsbuild,
      {
        "main.ts": `import { value } from "./ui";\nexport const used = value;`,
        "ui/index.tsx": `export const value = 42;`,
      },
      "main.ts",
      specSources,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const executed = executeBundle(result.code, "__specModule__");
    expect(executed.ok).toBe(true);
    if (!executed.ok) return;
    expect(executed.moduleExports.used).toBe(42);
  });
});
