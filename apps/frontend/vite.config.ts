import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { blackboardMockProtocolPlugin } from "./mockProtocolServer";

const BACKEND_URL = process.env.VITE_BACKEND_URL ?? "http://localhost:3001";

export default defineConfig({
  plugins: [react(), blackboardMockProtocolPlugin()],
  server: {
    proxy: {
      "/api": {
        target: BACKEND_URL,
        changeOrigin: true,
        // Only proxy when NOT in fixture mode (fixture mode is handled by the mock plugin above)
        bypass(req) {
          const url = new URL(req.url ?? "/", "http://localhost");
          if (url.searchParams.get("transport") === "fixture") return req.url;
          return null; // let proxy handle it
        },
      },
    },
  },
});
