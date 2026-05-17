import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";

const MIME_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
};

export function handleStaticRequest(
  req: IncomingMessage,
  res: ServerResponse,
  distDir: string,
): boolean {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return false;
  }

  const url = new URL(req.url ?? "/", "http://localhost");
  const pathname = decodeURIComponent(url.pathname);

  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const candidate = safeResolve(distDir, requestedPath);
  const fallback = safeResolve(distDir, "/index.html");

  const filePath = candidate && isFile(candidate)
    ? candidate
    : fallback && !pathname.startsWith("/api/") && !pathname.startsWith("/cli/")
      ? fallback
      : null;

  if (!filePath) {
    return false;
  }

  const mimeType = MIME_TYPES[extname(filePath).toLowerCase()] ?? "application/octet-stream";
  res.writeHead(200, {
    "content-type": mimeType,
    "cache-control": filePath.endsWith("index.html") ? "no-cache" : "public, max-age=31536000, immutable",
  });

  if (req.method === "HEAD") {
    res.end();
    return true;
  }

  createReadStream(filePath).pipe(res);
  return true;
}

function safeResolve(root: string, requestedPath: string): string | null {
  const resolvedRoot = resolve(root);
  const cleanedPath = normalize(requestedPath).replace(/^(\.\.(\/|\\|$))+/, "");
  const candidate = resolve(join(resolvedRoot, cleanedPath.replace(/^[/\\]+/, "")));
  if (candidate !== resolvedRoot && !candidate.startsWith(resolvedRoot + sep)) {
    return null;
  }
  return candidate;
}

function isFile(path: string): boolean {
  return existsSync(path) && statSync(path).isFile();
}
