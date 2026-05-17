import { createServer } from "node:http";
import { handleRequest } from "./routes.js";
import { handleCliRequest } from "./cliRoutes.js";
import { getOrCreateDemoSession } from "./sessionStore.js";
import { handleStaticRequest } from "./staticServer.js";

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001;
const FRONTEND_DIST_DIR = process.env.FRONTEND_DIST_DIR;

// Seed demo session on startup
getOrCreateDemoSession();

const server = createServer((req, res) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "content-type",
    });
    res.end();
    return;
  }

  const start = Date.now();
  res.on("finish", () => {
    const isSSE = res.getHeader("content-type") === "text/event-stream";
    if (!isSSE) {
      console.log(`${req.method} ${req.url} → ${res.statusCode} (${Date.now() - start}ms)`);
    }
  });

  if (
    !handleCliRequest(req, res) &&
    !handleRequest(req, res) &&
    !(FRONTEND_DIST_DIR && handleStaticRequest(req, res, FRONTEND_DIST_DIR))
  ) {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  }
});

server.listen(PORT, () => {
  console.log(`Blackboard backend running on http://localhost:${PORT}`);
  if (FRONTEND_DIST_DIR) {
    console.log(`Blackboard frontend served from ${FRONTEND_DIST_DIR}`);
  }
});
