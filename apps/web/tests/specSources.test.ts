import { describe, expect, test } from "vitest";
import * as esbuild from "esbuild";
import {
  bundleSpec,
  findMissingSpecSources,
  REQUIRED_SPEC_SOURCE_PATHS,
  type EsbuildLike,
} from "../src/core/bundle.js";
import { specSources as workerSpecSources } from "../src/worker/specSources.js";
import { loadSpecSources } from "./helpers/specSources.js";

const nodeEsbuild = esbuild as unknown as EsbuildLike;

describe("SpecSources登録漏れの検出", () => {
  test("worker/specSources.ts はREQUIRED_SPEC_SOURCE_PATHSを全て登録している", () => {
    expect(findMissingSpecSources(workerSpecSources)).toEqual([]);
  });

  test("tests/helpers/specSources.ts(テストヘルパー)もREQUIRED_SPEC_SOURCE_PATHSを全て登録している", () => {
    expect(findMissingSpecSources(loadSpecSources())).toEqual([]);
  });

  test("findMissingSpecSourcesは不足しているキーを返す", () => {
    const incomplete = { "index.ts": "", "spec.ts": "" };
    const missing = findMissingSpecSources(incomplete);
    expect(missing).toEqual(
      REQUIRED_SPEC_SOURCE_PATHS.filter((path) => path !== "index.ts" && path !== "spec.ts"),
    );
    expect(missing.length).toBeGreaterThan(0);
  });

  test("specSourcesが完全に空なら、REQUIRED_SPEC_SOURCE_PATHSの全件が不足として返る", () => {
    expect(findMissingSpecSources({})).toEqual([...REQUIRED_SPEC_SOURCE_PATHS]);
  });

  test("bundleSpecはspecSourcesの登録漏れを検知すると、esbuildを呼ばずに明示的なエラーを返す", async () => {
    const incomplete = { "index.ts": "", "spec.ts": "", "checker.ts": "", "canonical.ts": "" }; // datamodel/*が抜けている
    const result = await bundleSpec(nodeEsbuild, { "main.ts": `export const x = 1;` }, "main.ts", incomplete);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]!.message).toContain("specSourcesに必要なファイルが登録されていません");
    expect(result.errors[0]!.message).toContain("datamodel/formula.ts");
  });
});
