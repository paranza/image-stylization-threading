import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  // Relative base so the build works on GitHub Pages under any repository name.
  base: "./",
  build: {
    target: "es2022",
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, "index.html"),
        about: resolve(import.meta.dirname, "about.html"),
      },
    },
  },
  worker: { format: "es" },
});
