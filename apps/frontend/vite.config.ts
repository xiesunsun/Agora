import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { blackboardMockProtocolPlugin } from "./mockProtocolServer";

export default defineConfig({
  plugins: [react(), blackboardMockProtocolPlugin()],
});
