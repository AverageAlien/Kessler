import { defineConfig } from "vite";

// Relative asset paths, so the build also works from a subfolder (e.g. a GitHub Pages site)
export default defineConfig({
  base: "./",
});
