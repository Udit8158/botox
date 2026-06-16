import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Monorepo root, so Vite is allowed to read the symlinked workspace packages
// (@botox/*) which live outside apps/web.
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
    fs: { allow: [repoRoot] },
  },
  // The workspace packages ship raw .ts via their "exports" field; let Vite
  // transpile them as source instead of trying to pre-bundle them.
  optimizeDeps: {
    exclude: ["@botox/shared", "@botox/storage", "@botox/sync-core"],
  },
});
