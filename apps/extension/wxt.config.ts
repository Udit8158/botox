import { defineConfig } from "wxt";
import tailwindcss from "@tailwindcss/vite";

// https://wxt.dev/api/config.html
export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    name: "Botox — Bookmark Sync",
    description:
      "Sync your bookmarks across browsers using your own Google Drive. No vendor database of your data.",
    permissions: ["bookmarks", "storage", "alarms", "identity"],
    host_permissions: ["https://www.googleapis.com/*"],
    // (Settings open in a full tab — set via <meta name="manifest.open_in_tab">
    // in options/index.html, which WXT honors.)
    // Public key pins the extension ID (bikooepehocgalncmfjfijppnnlekjfn) so the
    // OAuth redirect URL stays stable across reinstalls. Safe to commit (public).
    // Matching private key: apps/extension/.secrets/dev-key.pem (gitignored).
    key: "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAjldsX1b63077ryzhlh/qaZXgo/g9D5Bh0CwGTBlr77DyBbuYyPh/Jxs3724Y7ZyMwyVFGdVZmNrFFNU0E2OT2lDhOUqISkgOS8DXkaya047WTgabPQd8n7CsLny5cFFTKhZURWq2PxFzr25oB9z/YrBgi9kUO+wNiHM+zW0aoLnPtb8b4J42ltHyfID9mHwp8750/LiW3pXaqCO5iaLSwzfiDCCIwfK27TnzsuI38TayZT8neaT9+CZDRU7VqyZSiBaS7wkB35N0GJ3Lq75zNNZA8woBlGZy/An3GY/FlV7AYPKy1Qbxl4Fl5arvFdBzhgi0tMkXydqsPHC8MotOWQIDAQAB",
  },
});
