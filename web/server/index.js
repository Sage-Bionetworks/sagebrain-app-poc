// Production server: serves the built app from dist/ and the OAuth token
// exchange at POST /api/oauth/token. No dependencies beyond Node >= 22.
//
//   npm run build && npm start      # reads .env if present, PORT defaults to 8080
//
// Routes: POST /api/oauth/token, GET /config.js (runtime config), GET /healthz,
// everything else is dist/ with an SPA fallback to index.html.

import { existsSync, createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createTokenHandler, oauthConfigFromEnv } from "./oauth.js";
import { createConfigHandler, healthHandler, publicConfigFromEnv } from "./runtime.js";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
if (existsSync(join(root, ".env"))) process.loadEnvFile(join(root, ".env"));

const DIST = join(root, "dist");
const PORT = Number(process.env.PORT || 8080);
const tokenHandler = createTokenHandler(oauthConfigFromEnv(process.env));
const configHandler = createConfigHandler(publicConfigFromEnv(process.env));

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css",
  ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon",
  ".json": "application/json", ".woff2": "font/woff2", ".map": "application/json",
};

function serveFile(res, path) {
  res.statusCode = 200;
  res.setHeader("Content-Type", MIME[extname(path)] || "application/octet-stream");
  // hashed assets are immutable; index.html must always be revalidated
  res.setHeader("Cache-Control", path.includes(`${sep}assets${sep}`) ? "public, max-age=31536000, immutable" : "no-cache");
  createReadStream(path).pipe(res);
}

const server = createServer((req, res) => {
  const url = new URL(req.url || "/", "http://localhost");
  if (url.pathname === "/api/oauth/token") return void tokenHandler(req, res);
  if (url.pathname === "/config.js") return configHandler(req, res);
  if (url.pathname === "/healthz") return healthHandler(req, res);

  // static files, confined to dist/; anything else falls back to the SPA shell
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); } catch { pathname = "/"; } // malformed %-escape
  const candidate = normalize(join(DIST, pathname));
  if (candidate.startsWith(DIST + sep) && existsSync(candidate) && statSync(candidate).isFile()) {
    return serveFile(res, candidate);
  }
  serveFile(res, join(DIST, "index.html"));
});
server.listen(PORT, () => console.log(`Sage Brain app on http://localhost:${PORT}`));
// ECS sends SIGTERM on task stop; finish in-flight requests, then exit
process.on("SIGTERM", () => server.close(() => process.exit(0)));
