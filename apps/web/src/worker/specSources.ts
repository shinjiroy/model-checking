/**
 * `@model-checking/spec` のソースをViteの `?raw` importでテキストとして取り込み、
 * bundle.tsへ渡す仮想モジュールの中身を組み立てる。
 * (テスト側は同じ内容をnode fsで読み込む。tests/helpers/specSources.ts を参照)
 */
import type { SpecSources } from "../core/bundle.js";
import indexSource from "../../../../packages/spec/src/index.ts?raw";
import specSource from "../../../../packages/spec/src/spec.ts?raw";
import checkerSource from "../../../../packages/spec/src/checker.ts?raw";
import canonicalSource from "../../../../packages/spec/src/canonical.ts?raw";
import datamodelIndexSource from "../../../../packages/spec/src/datamodel/index.ts?raw";
import datamodelFormulaSource from "../../../../packages/spec/src/datamodel/formula.ts?raw";
import datamodelModelSource from "../../../../packages/spec/src/datamodel/model.ts?raw";
import datamodelEngineSource from "../../../../packages/spec/src/datamodel/engine.ts?raw";

export const specSources: SpecSources = {
  "index.ts": indexSource,
  "spec.ts": specSource,
  "checker.ts": checkerSource,
  "canonical.ts": canonicalSource,
  "datamodel/index.ts": datamodelIndexSource,
  "datamodel/formula.ts": datamodelFormulaSource,
  "datamodel/model.ts": datamodelModelSource,
  "datamodel/engine.ts": datamodelEngineSource,
};
