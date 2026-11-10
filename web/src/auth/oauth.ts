/* "Sign in with Synapse" as a third-party OIDC client.

   Patterns follow synapse-web-monorepo:
   - state: a random CSRF token stored before the redirect and compared on the
     callback, then removed (synapse-react-client generateCsrfToken() +
     useDetectSSOCode). signin.synapse.org echoes `state` back unchanged
     (apps/synapse-oauth-signin OAuth2Form.tsx), so hex keeps it URL-safe.
   - authorize params accepted by signin.synapse.org: client_id, redirect_uri,
     response_type=code, scope, claims (JSON), prompt, state.
   - No PKCE: Synapse clients are confidential, so the code is exchanged by our
     server (server/oauth.js), which holds the client secret. */
import { SYNAPSE, TOKEN_EXCHANGE_PATH } from "../config";

const STATE_KEY = "sb_oauth_state";
const TOKEN_KEY = "sb_token";

/* sessionStorage can throw on opaque origins / locked-down browsers; never let
   that take the app down (same guard as the demo). */
export const store = {
  get(k: string): string | null { try { return sessionStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { sessionStorage.setItem(k, v); } catch { /* unavailable */ } },
  remove(k: string) { try { sessionStorage.removeItem(k); } catch { /* unavailable */ } },
};

export const tokenStore = {
  get: () => store.get(TOKEN_KEY),
  set: (t: string) => store.set(TOKEN_KEY, t),
  clear: () => store.remove(TOKEN_KEY),
};

/** 32 random bytes as hex (as synapse-react-client's generateCsrfToken). */
function generateCsrfToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}

/* Claims returned by /oauth2/userinfo. `userid` matters: the API authorizer
   uses it for the team-membership check when the token lacks the `view`
   scope (the OIDC `sub` is pairwise per client and can't be used). */
const CLAIMS = {
  userinfo: { userid: null, user_name: null, given_name: null, family_name: null, email: null },
  id_token: { userid: null },
};

export const oauthConfigured = () => Boolean(SYNAPSE.clientId);

export function startLogin(): void {
  const state = generateCsrfToken();
  store.set(STATE_KEY, state);
  const params = new URLSearchParams({
    response_type: "code",
    client_id: SYNAPSE.clientId,
    redirect_uri: SYNAPSE.redirectUri,
    scope: SYNAPSE.scope,
    claims: JSON.stringify(CLAIMS),
    prompt: "select_account",
    state,
  });
  window.location.assign(`${SYNAPSE.authorizeUrl}/?${params}`);
}

export type Callback =
  | { kind: "code"; code: string; state: string | null }
  | { kind: "error"; message: string };

/** Read (and strip from the address bar) an OAuth callback, if this load is one. */
export function takeCallback(): Callback | null {
  const q = new URLSearchParams(window.location.search);
  const code = q.get("code"), error = q.get("error");
  if (!code && !error) return null;
  const state = q.get("state"), desc = q.get("error_description");
  for (const k of ["code", "state", "error", "error_description"]) q.delete(k);
  const rest = q.toString();
  history.replaceState(null, "", window.location.pathname + (rest ? `?${rest}` : "") + window.location.hash);
  if (error) {
    const message = error === "access_denied"
      ? "Sign-in was cancelled on Synapse."
      : `Synapse sign-in failed: ${desc || error}`;
    return { kind: "error", message };
  }
  return { kind: "code", code: code!, state };
}

/** Validate state, then exchange the code via our server. Returns the access token. */
export async function completeLogin(code: string, state: string | null): Promise<string> {
  const expected = store.get(STATE_KEY);
  store.remove(STATE_KEY);
  if (!expected || !state || expected !== state) {
    throw new Error("Invalid OAuth state — the sign-in may have been tampered with, or started in another tab. Please sign in again.");
  }
  let resp: Response;
  try {
    resp = await fetch(TOKEN_EXCHANGE_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, redirect_uri: SYNAPSE.redirectUri }),
    });
  } catch {
    throw new Error("Could not reach the sign-in server.");
  }
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.access_token) throw new Error(data.error || `Sign-in failed (HTTP ${resp.status}).`);
  return data.access_token as string;
}

export interface SynapseUser {
  userId?: string;
  userName?: string;
  displayName: string;
  email?: string;
}

export class TokenRejected extends Error {}

/** Resolve who the token belongs to. OAuth tokens answer /oauth2/userinfo;
    PATs (no openid scope) answer /userProfile instead. */
export async function fetchUser(token: string): Promise<SynapseUser> {
  const auth = { Authorization: `Bearer ${token}` };
  const info = await fetch(SYNAPSE.userinfoUrl, { headers: auth });
  if (info.ok) {
    const u = await info.json();
    const name = [u.given_name, u.family_name].filter(Boolean).join(" ");
    return { userId: u.userid, userName: u.user_name, email: u.email,
             displayName: name || u.user_name || u.email || "Synapse user" };
  }
  if (info.status === 401) throw new TokenRejected("Your Synapse session has expired.");
  const prof = await fetch(SYNAPSE.userProfileUrl, { headers: auth });
  if (prof.ok) {
    const p = await prof.json();
    const name = [p.firstName, p.lastName].filter(Boolean).join(" ");
    return { userId: p.ownerId, userName: p.userName, displayName: name || p.userName || "Synapse user" };
  }
  if (prof.status === 401 || prof.status === 403) throw new TokenRejected("Synapse did not accept this token.");
  throw new Error(`Could not load your Synapse profile (HTTP ${prof.status}).`);
}
