import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    assetsDir: "static",
    chunkSizeWarningLimit: 1000,
  },
  server: {
    fs: {
      allow: [".."],
    },
  },
});
