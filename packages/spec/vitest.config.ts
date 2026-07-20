import { defaultServerConditions } from "vite";
import { defineConfig } from "vitest/config";

// テストは examples/*.ts を読み込み、examples は "@model-checking/spec" を名前で
// インポートする。モノレポ内ではビルド済みdistではなくソースで解決する
// (package.json の exports のカスタム条件)
const conditions = ["@model-checking/source", ...defaultServerConditions];

export default defineConfig({
  resolve: { conditions },
  ssr: { resolve: { conditions } },
});
