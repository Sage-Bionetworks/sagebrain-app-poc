// Synapse OAuth code exchange — the only part of the login that needs a server.
//
// Synapse OAuth clients are confidential: there is no PKCE, and
// POST /auth/v1/oauth2/token requires HTTP Basic auth with the client secret.
// The browser therefore sends the authorization code here, and this handler
// trades it for an access token. The secret never reaches the browser bundle.
//
// Used by both the Vite dev/preview server (vite.config.ts) and the production
// server (server/index.js).

const SYNAPSE_TOKEN_URL = "https://repo-prod.prod.sagebase.org/auth/v1/oauth2/token";
const MAX_BODY_BYTES = 8 * 1024;

/** @param {Record<string, string | undefined>} env */
export function oauthConfigFromEnv(env) {
  return {
    clientId: env.SYNAPSE_CLIENT_ID || "",
    clientSecret: env.SYNAPSE_CLIENT_SECRET || "",
    redirectUri: env.SYNAPSE_REDIRECT_URI || "",
  };
}

/**
 * Connect-style handler for POST /api/oauth/token with a JSON body
 * { code, redirect_uri }. Responds { access_token, expires_in } or { error }.
 *
 * @param {{ clientId: string, clientSecret: string, redirectUri: string }} config
 */
export function createTokenHandler(config) {
  return async function tokenHandler(req, res) {
    if (req.method !== "POST") return send(res, 405, { error: "Method not allowed" });
    if (!config.clientId || !config.clientSecret) {
      return send(res, 500, {
        error: "OAuth is not configured on the server: set SYNAPSE_CLIENT_ID and SYNAPSE_CLIENT_SECRET.",
      });
    }

    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch {
      return send(res, 400, { error: "Expected a JSON body" });
    }
    const code = typeof body?.code === "string" ? body.code : "";
    if (!code) return send(res, 400, { error: "Missing 'code'" });

    // The redirect_uri sent here must equal the one used on the authorize
    // request. Prefer the configured value; fall back to the browser's only
    // when none is configured (local dev on the default http://localhost:5173/).
    const redirectUri = config.redirectUri || (typeof body.redirect_uri === "string" ? body.redirect_uri : "");
    if (!redirectUri) return send(res, 400, { error: "Missing 'redirect_uri'" });

    let upstream;
    try {
      upstream = await fetch(SYNAPSE_TOKEN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: "Basic " + Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64"),
        },
        body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri }),
      });
    } catch (e) {
      console.error("synapse token exchange failed:", e?.message || e);
      return send(res, 502, { error: "Could not reach Synapse to complete sign-in" });
    }

    const text = await upstream.text();
    let data = {};
    try { data = JSON.parse(text); } catch { /* non-JSON error page */ }
    if (!upstream.ok || !data.access_token) {
      // Synapse puts the reason in error_description or reason; never echo credentials.
      const reason = data.error_description || data.reason || data.error || `HTTP ${upstream.status}`;
      console.warn("synapse token exchange rejected:", upstream.status, reason);
      return send(res, upstream.status >= 500 ? 502 : 400, { error: `Synapse rejected the sign-in: ${reason}` });
    }

    // Only hand the browser what it needs. The refresh token stays unused.
    return send(res, 200, { access_token: data.access_token, expires_in: data.expires_in });
  };
}

function send(res, status, obj) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", chunk => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) { reject(new Error("body too large")); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}
