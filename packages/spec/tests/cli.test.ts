import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import { describe, expect, test } from "vitest";
import type { CheckResult } from "../src/checker.js";
import type { ModelCheckResult } from "../src/datamodel/engine.js";
import { parseArgs } from "../src/cli.js";
import { discoverSpecFiles, isSpecFile } from "../src/cli/discover.js";
import type { FileSystemLike } from "../src/cli/discover.js";
import {
  formatCheckResult,
  formatModelResult,
  formatTrace,
} from "../src/cli/format.js";
import { extractTargets, loadSpecFile } from "../src/cli/loadSpecs.js";
import { runCheck } from "../src/cli/run.js";

/** テストでは esbuild のエイリアス先を配布物(dist)ではなくソース(src/index.ts)にする。
 *  esbuild は TypeScript をそのままバンドルできるため、ビルド済み dist に依存せずに検査できる。 */
const specModulePath = fileURLToPath(new URL("../src/index.ts", import.meta.url));
const starterSpec = fileURLToPath(
  new URL("../../../templates/spec-starter/specs/withdraw.ts", import.meta.url),
);
const docPermissionModel = fileURLToPath(
  new URL("../../../examples/doc-permission.ts", import.meta.url),
);

describe("parseArgs", () => {
  test("check サブコマンドと対象・--max-states を解釈する", () => {
    expect(parseArgs(["check", "specs/", "--max-states", "500000"])).toEqual({
      command: "check",
      targets: ["specs/"],
      maxStates: 500000,
    });
  });

  test("--max-states=<数> 形式も解釈する", () => {
    const parsed = parseArgs(["check", "a.ts", "--max-states=10"]);
    expect(parsed).toMatchObject({ command: "check", maxStates: 10 });
  });

  test("引数なし・help はヘルプ扱い", () => {
    expect(parseArgs([])).toEqual({ command: "help" });
    expect(parseArgs(["--help"])).toEqual({ command: "help" });
  });

  test("未知サブコマンド・対象なし・不正な --max-states はエラー", () => {
    expect(parseArgs(["nope"]).command).toBe("error");
    expect(parseArgs(["check"]).command).toBe("error");
    expect(parseArgs(["check", "a.ts", "--max-states", "-1"]).command).toBe("error");
    expect(parseArgs(["check", "a.ts", "--max-states", "abc"]).command).toBe("error");
  });
});

describe("discoverSpecFiles", () => {
  test("テスト/型宣言ファイルは仕様ファイルとして扱わない", () => {
    expect(isSpecFile("order.ts")).toBe(true);
    expect(isSpecFile("order.test.ts")).toBe(false);
    expect(isSpecFile("order.spec.ts")).toBe(false);
    expect(isSpecFile("order.d.ts")).toBe(false);
    expect(isSpecFile("README.md")).toBe(false);
  });

  test("ファイルパスはそのまま返す", () => {
    const fs: FileSystemLike = { statIsDirectory: () => false, readDir: () => [] };
    expect(discoverSpecFiles("specs/order.ts", fs)).toEqual(["specs/order.ts"]);
  });

  test("ディレクトリは再帰的に走査し、node_modules や隠しディレクトリ・テストを除外する", () => {
    const tree: Record<string, string[]> = {
      specs: ["order.ts", "order.test.ts", "sub", "node_modules", ".git"],
      "specs/sub": ["item.ts", "item.d.ts"],
      "specs/node_modules": ["dep.ts"],
    };
    const dirs = new Set(["specs", "specs/sub", "specs/node_modules", "specs/.git"]);
    const fs: FileSystemLike = {
      statIsDirectory: p => dirs.has(p),
      readDir: p => tree[p] ?? [],
    };
    expect(discoverSpecFiles("specs", fs)).toEqual(["specs/order.ts", "specs/sub/item.ts"]);
  });
});

describe("format", () => {
  test("反例なし(全探索)/打ち切りを整形する", () => {
    const ok: CheckResult<unknown> = { ok: true, statesExplored: 9, complete: true };
    expect(formatCheckResult("s", ok)).toContain("✓ s");
    const truncated: CheckResult<unknown> = { ok: true, statesExplored: 100, complete: false };
    expect(formatCheckResult("s", truncated)).toContain("⚠ s");
  });

  test("反例トレースをタイムラインとして整形する", () => {
    const result: CheckResult<unknown> = {
      ok: false,
      violation: { kind: "invariant", name: "inv" },
      statesExplored: 3,
      trace: [
        { action: null, state: { n: 0 } },
        { action: "step", actor: "A", param: 1, state: { n: 1 } },
      ],
    };
    const out = formatCheckResult("s", result);
    expect(out).toContain("✗ s");
    expect(out).toContain("不変条件 inv");
    expect(out).toContain("(初期状態)");
    expect(out).toContain("step [A] param=1");
  });

  test("デッドロックとデータモデル反例を整形する", () => {
    const deadlock: CheckResult<unknown> = {
      ok: false,
      violation: { kind: "deadlock" },
      statesExplored: 1,
      trace: [{ action: null, state: {} }],
    };
    expect(formatTrace(deadlock.ok ? [] : deadlock.trace)).toContain("(初期状態)");
    expect(formatCheckResult("s", deadlock)).toContain("デッドロック");

    const model: ModelCheckResult = {
      ok: false,
      assertion: "a",
      instancesChecked: 5,
      instance: {
        atoms: { User: ["User0"] },
        relations: { owner: [["User0", "Doc0"]] },
      },
    };
    const out = formatModelResult("m", model);
    expect(out).toContain("✗ m");
    expect(out).toContain("assertion a");
    expect(out).toContain("(User0, Doc0)");
  });

  test("制約を満たすインスタンスが0件なら警告する", () => {
    const empty: ModelCheckResult = {
      ok: true,
      instancesChecked: 4,
      complete: true,
      satisfiedInstances: 0,
    };
    expect(formatModelResult("m", empty)).toContain("⚠ m");
  });
});

describe("loadSpecFile(@model-checking/spec の自己解決)", () => {
  test("仕様ファイルから defineSpec の戻り値を取り出す", async () => {
    const loaded = await loadSpecFile(starterSpec, specModulePath, esbuild);
    expect(loaded).toHaveLength(1);
    expect(loaded[0]).toMatchObject({ name: "withdrawSpec", kind: "spec" });
  });

  test("データモデルファイルから defineModel の戻り値を取り出す", async () => {
    const loaded = await loadSpecFile(docPermissionModel, specModulePath, esbuild);
    expect(loaded).toHaveLength(1);
    expect(loaded[0]).toMatchObject({ name: "docPermissionModel", kind: "model" });
  });

  test("extractTargets は Spec と ModelDef を見分ける", () => {
    const targets = extractTargets({
      spec: { init: {}, actions: {} },
      model: { sorts: ["A"], assertions: {}, relations: {}, scope: {} },
      noise: 42,
    });
    expect(targets.map(t => t.kind).sort()).toEqual(["model", "spec"]);
  });
});

describe("runCheck", () => {
  test("反例なしなら終了コード0", async () => {
    const lines: string[] = [];
    const code = await runCheck(
      [starterSpec],
      { esbuild, specModulePath },
      { print: l => lines.push(l) },
    );
    expect(code).toBe(0);
    expect(lines.join("\n")).toContain("✓ withdrawSpec");
  });

  test("反例を検出したら終了コード1", async () => {
    const lines: string[] = [];
    const code = await runCheck(
      [docPermissionModel],
      { esbuild, specModulePath },
      { print: l => lines.push(l) },
    );
    expect(code).toBe(1);
    expect(lines.join("\n")).toContain("✗ docPermissionModel");
  });

  test("対象が見つからなければ終了コード2", async () => {
    const fs: FileSystemLike = { statIsDirectory: () => true, readDir: () => [] };
    const code = await runCheck(
      ["empty"],
      { esbuild, specModulePath, fs },
      { print: () => {} },
    );
    expect(code).toBe(2);
  });
});
