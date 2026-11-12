// Runtime configuration for the browser, read from the server's environment.
//
// The built bundle carries no environment-specific values: index.html loads
// /config.js, which this handler renders from env vars on each request. One
// Docker image therefore runs in any environment, configured by the ECS task
// definition (or .env locally). Only public values are exposed here — the
// client secret is read by server/oauth.js and never sent to the browser.

/** @param {Record<string, string | undefined>} env */
export function publicConfigFromEnv(env) {
  return {
    apiBaseUrl: (env.API_BASE_URL || "").replace(/\/+$/, ""),
    synapseClientId: env.SYNAPSE_CLIENT_ID || "",
    synapseRedirectUri: env.SYNAPSE_REDIRECT_URI || "",
    synapseScope: env.SYNAPSE_SCOPE || "openid",
  };
}

/** GET /config.js -> `window.__SAGEBRAIN_CONFIG__ = {...}` */
export function createConfigHandler(publicConfig) {
  // JSON.stringify + escaping "<" keeps the values from breaking out of the script
  const body = `window.__SAGEBRAIN_CONFIG__ = ${JSON.stringify(publicConfig).replace(/</g, "\\u003c")};\n`;
  return function configHandler(_req, res) {
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/javascript; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end(body);
  };
}

/** GET /healthz for the load balancer target group. */
export function healthHandler(_req, res) {
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/plain");
  res.end("ok");
}
