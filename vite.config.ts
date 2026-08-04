import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const runtime = globalThis as typeof globalThis & {
  process?: { env?: Record<string, string | undefined> };
};

export default defineConfig({
  base:
    runtime.process?.env?.GITHUB_ACTIONS === "true" ? "/3DShellDesign/" : "/",
  plugins: [react()],
  build: {
    target: "es2022",
    sourcemap: true,
    rolldownOptions: {
      onLog(level, log, handler) {
        const expectedManifoldNodeBranch =
          log.message.includes('Module "node:module" has been externalized') &&
          log.message.includes("manifold-3d/manifold.js");
        const expectedOcctNodeBranch =
          (log.message.includes('Module "path" has been externalized') ||
            log.message.includes('Module "crypto" has been externalized')) &&
          log.message.includes("occt-import-js");
        if (expectedManifoldNodeBranch || expectedOcctNodeBranch) return;
        handler(level, log);
      },
      output: {
        codeSplitting: {
          groups: [
            {
              name: "three-core",
              test: /node_modules[\\/]three[\\/]build[\\/]/,
              maxSize: 450_000,
            },
            {
              name: "three-addons",
              test: /node_modules[\\/]three[\\/]examples[\\/]/,
            },
            {
              name: "react-ui",
              test: /node_modules[\\/](react|react-dom|zustand|lucide-react)[\\/]/,
            },
          ],
        },
      },
    },
  },
  worker: {
    format: "es",
  },
});
