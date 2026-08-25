import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";

// The build lands inside the server crate, which embeds it verbatim. It has to
// be there rather than in ui/dist because `cargo publish` only packages files
// under the crate root, and a published crate with no interface in it would
// fail only once someone ran --serve. Assets are content-hashed so they can be
// cached forever; index.html never is.
export default defineConfig({
  plugins: [react(), tailwind()],
  build: {
    outDir: "../crates/server/dist",
    emptyOutDir: true,
    assetsDir: "assets",
  },
  server: {
    port: 5024,
    // `npm run dev` talks to a `filestoai --serve` on the default port.
    proxy: { "/api": "http://127.0.0.1:5023" },
  },
});
