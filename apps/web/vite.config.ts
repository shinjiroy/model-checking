import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const monorepoRoot = fileURLToPath(new URL("../..", import.meta.url));

// eslint-disable-next-line import/no-default-export
export default defineConfig({
  // GitHub Pagesのプロジェクトサイトはサブパス(/<repo>/)配下に載るため、
  // 配信元に合わせて base を差し替えられるようにする(未指定はルート配信)。
  // wasm・Worker・アセットはすべて `?url` / Viteのアセット解決経由なので、
  // base を変えるだけで参照先が追随する。
  base: process.env.BASE_PATH ?? "/",
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
