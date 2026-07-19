import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import { bundleSpec, type EsbuildLike } from "../src/core/bundle.js";
import { executeBundle } from "../src/core/execute.js";
import { detectExports } from "../src/core/detect.js";
import { loadSpecSources } from "./helpers/specSources.js";
import type { CheckResult, TraceStep } from "@model-checking/spec";

const nodeEsbuild = esbuild as unknown as EsbuildLike;
const specSources = loadSpecSources();

const paymentRetrySource = readFileSync(
  fileURLToPath(new URL("../../../examples/payment-retry.ts", import.meta.url)),
  "utf-8",
);

describe("受け入れ基準1の裏付け: examples/payment-retry.ts の二重課金反例", () => {
  test("実テキストをバンドル→実行→checkし、5ステップの反例をactor付きで返す", async () => {
    const bundled = await bundleSpec(nodeEsbuild, { "payment-retry.ts": paymentRetrySource }, "payment-retry.ts", specSources);
    expect(bundled.ok).toBe(true);
    if (!bundled.ok) return;

    const executed = executeBundle(bundled.code, "__specModule__");
    expect(executed.ok).toBe(true);
    if (!executed.ok) return;

    const found = detectExports(executed.moduleExports);
    expect(found).toEqual([{ name: "paymentRetrySpec", kind: "spec" }]);

    const spec = executed.moduleExports[found[0]!.name] as Parameters<typeof import("@model-checking/spec").check>[0];
    const { check } = await import("@model-checking/spec");
    const result = check(spec) as CheckResult<{
      clientPhase: string;
      attempt: number;
      inFlight: number[];
      responses: number[];
      charged: number;
    }>;

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.violation).toEqual({ kind: "invariant", name: "chargedAtMostOnce" });

    // 初期状態 + 5ステップ = trace長6
    expect(result.trace).toHaveLength(6);

    const trace = result.trace as TraceStep<{ charged: number }>[];
    expect(trace[0]!.action).toBeNull();
    expect(trace.at(-1)!.state.charged).toBe(2);

    // docs/trace-visualization.md記載の反例の筋書き通りのactor列
    const actors = trace.slice(1).map((step) => step.actor);
    expect(actors).toEqual(["client", "client", "client", "server", "server"]);

    const actions = trace.slice(1).map((step) => step.action);
    expect(actions).toEqual(["sendRequest", "timeout", "sendRequest", "processRequest", "processRequest"]);
  });
});
