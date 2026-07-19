import { describe, expect, test } from "vitest";
import * as esbuild from "esbuild";
import {
  bundleSpec,
  collectReachableUserFiles,
  pruneUnreachableFiles,
  type EsbuildLike,
} from "../src/core/bundle.js";
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
            done: () => true,
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

describe("collectReachableUserFiles: entryからの到達可能性", () => {
  test("entry単体(importなし)はentryのみ", () => {
    const files = { "main.ts": "export const x = 1;" };
    expect(collectReachableUserFiles(files, "main.ts")).toEqual(new Set(["main.ts"]));
  });

  test("import/export from・副作用import・動的import・サブディレクトリを辿る", () => {
    const files = {
      "main.ts": `
        import { a } from "./a.js";
        export { b } from "./sub/b";
        import "./side-effect";
        const load = () => import("./dyn.ts");
      `,
      "a.ts": "export const a = 1;",
      "sub/b.ts": `import { c } from "../c";\nexport const b = 2;`,
      "c.ts": "export const c = 3;",
      "side-effect.ts": "globalThis.flag = true;",
      "dyn.ts": "export const d = 4;",
      // どこからもimportされないので到達不能
      "unused.ts": "export const never = 0;",
      "README.md": "説明",
    };
    expect(collectReachableUserFiles(files, "main.ts")).toEqual(
      new Set(["main.ts", "a.ts", "sub/b.ts", "c.ts", "side-effect.ts", "dyn.ts"]),
    );
  });

  test("循環importでも無限ループしない", () => {
    const files = {
      "main.ts": `import "./a.js";`,
      "a.ts": `import "./b.js";`,
      "b.ts": `import "./a.js";`,
    };
    expect(collectReachableUserFiles(files, "main.ts")).toEqual(new Set(["main.ts", "a.ts", "b.ts"]));
  });

  test("entryを解決できない場合は空集合", () => {
    expect(collectReachableUserFiles({ "main.ts": "" }, "missing.ts")).toEqual(new Set());
  });

  test("@model-checking/specやnpmパッケージなど非相対importは辿らない", () => {
    const files = {
      "main.ts": `import { defineSpec } from "@model-checking/spec";\nimport foo from "some-npm-pkg";`,
    };
    expect(collectReachableUserFiles(files, "main.ts")).toEqual(new Set(["main.ts"]));
  });
});

describe("pruneUnreachableFiles: 共有ペイロードの絞り込み", () => {
  test("到達不能なファイルを除外する", () => {
    const files = {
      "main.ts": `import { a } from "./a.js";\nexport const x = a;`,
      "a.ts": "export const a = 1;",
      "unused.ts": "export const never = 0;",
    };
    expect(pruneUnreachableFiles(files, "main.ts")).toEqual({
      "main.ts": files["main.ts"],
      "a.ts": files["a.ts"],
    });
  });

  test("entryを解決できない場合はデータを失わず元のfilesを返す", () => {
    const files = { "main.ts": "export const x = 1;", "other.ts": "export const y = 2;" };
    expect(pruneUnreachableFiles(files, "missing.ts")).toBe(files);
  });

  test("絞り込み後もentryからバンドルでき、除外したファイルは結果に影響しない", async () => {
    const files = {
      "main.ts": `import { defineSpec } from "@model-checking/spec";
        import { start } from "./state.js";
        export const spec = defineSpec({
          init: start,
          actions: { inc: { then: (s: { n: number }) => ({ ...s, n: s.n + 1 }) } },
        });`,
      "state.ts": "export const start = { n: 0 };",
      // 共有時に除外されるべき無関係な大きいファイル
      "unused.ts": `export const junk = "${"x".repeat(1000)}";`,
    };
    const pruned = pruneUnreachableFiles(files, "main.ts");
    expect(Object.keys(pruned).sort()).toEqual(["main.ts", "state.ts"]);

    const result = await bundleSpec(nodeEsbuild, pruned, "main.ts", specSources);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const executed = executeBundle(result.code, "__specModule__");
    expect(executed.ok).toBe(true);
    if (!executed.ok) return;
    expect(executed.moduleExports.spec).toBeDefined();
  });
});
