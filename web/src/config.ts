/* Runtime configuration, served by our server as /config.js from its
   environment (server/runtime.js) — so one built image runs in any
   environment. See .env.example for the variables. */
interface RuntimeConfig {
  apiBaseUrl?: string;
  synapseClientId?: string;
  synapseRedirectUri?: string;
  synapseScope?: string;
}
declare global {
  interface Window { __SAGEBRAIN_CONFIG__?: RuntimeConfig }
}
const rc: RuntimeConfig = window.__SAGEBRAIN_CONFIG__ ?? {};

/** Sage Brain API base: serves POST /ask, POST /query and GET /{ask,query}/{job_id}.
    Required — there is deliberately no default (deployed API hosts change between stacks). */
export const API_BASE_URL = (rc.apiBaseUrl || "").replace(/\/+$/, "");

export const SYNAPSE = {
  /** signin.synapse.org is Synapse's OIDC authorize/consent page. */
  authorizeUrl: "https://signin.synapse.org",
  userinfoUrl: "https://repo-prod.prod.sagebase.org/auth/v1/oauth2/userinfo",
  userProfileUrl: "https://repo-prod.prod.sagebase.org/repo/v1/userProfile",
  clientId: rc.synapseClientId || "",
  /** Must match a redirect URI registered on the OAuth client exactly. */
  redirectUri: rc.synapseRedirectUri || `${window.location.origin}/`,
  scope: rc.synapseScope || "openid",
};

/** Our server-side code exchange (server/oauth.js). */
export const TOKEN_EXCHANGE_PATH = "/api/oauth/token";
