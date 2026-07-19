export { defineSpec } from "./spec.js";
export type { ActionDef, Spec } from "./spec.js";
export { check } from "./checker.js";
export type { CheckOptions, CheckResult, TraceStep, Violation } from "./checker.js";

// データモデル・権限検証(フェーズ3)。詳細はdocs/datamodel-sketch.mdを参照
export {
  defineModel,
  forall,
  exists,
  rel,
  eq,
  neq,
  and,
  or,
  not,
  implies,
  iff,
  checkModel,
  enumerationEngine,
} from "./datamodel/index.js";
export type {
  ModelDef,
  Formula,
  Term,
  Instance,
  ModelCheckResult,
  ModelCheckOptions,
  ModelEngine,
} from "./datamodel/index.js";
