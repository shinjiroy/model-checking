/**
 * テスト用: packages/spec/src の実ソースを読み込み、bundle.ts に渡す SpecSources を組み立てる。
 * ブラウザ(Worker)側は同じ内容をViteの `?raw` importで取得する(src/worker/specSources.ts)。
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { SpecSources } from "../../src/core/bundle.js";

const specSrcDir = fileURLToPath(new URL("../../../../packages/spec/src/", import.meta.url));

function read(name: string): string {
  return readFileSync(`${specSrcDir}${name}`, "utf-8");
}

export function loadSpecSources(): SpecSources {
  return {
    "index.ts": read("index.ts"),
    "spec.ts": read("spec.ts"),
    "checker.ts": read("checker.ts"),
    "canonical.ts": read("canonical.ts"),
    "datamodel/index.ts": read("datamodel/index.ts"),
    "datamodel/formula.ts": read("datamodel/formula.ts"),
    "datamodel/model.ts": read("datamodel/model.ts"),
    "datamodel/engine.ts": read("datamodel/engine.ts"),
  };
}
