import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const monorepoRoot = fileURLToPath(new URL("../..", import.meta.url));

// eslint-disable-next-line import/no-default-export
export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    fs: {
      // examples/ と packages/spec/src/ をルート外(モノレポルート)から ?raw で読み込むため許可する
      allow: [monorepoRoot],
    },
  },
  worker: {
    format: "es",
  },
});
