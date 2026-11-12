# Sage Brain web app (React)

React + Vite front end for the Sage Brain knowledge graph, with two tabs:

- **Ask** — natural-language questions to the agent (`POST /ask`), with each
  SPARQL step it runs streamed in as it works. Port of the Streamlit POC (`../app.py`).
- **Guided demo** — the 8-step walkthrough from three data portals to one patient,
  ported from [Sage_Brain `demo-app-updates:demo/index.html`](https://github.com/Sage-Bionetworks/Sage_Brain/tree/demo-app-updates/demo)
  (canned SPARQL via `POST /query`, recorded fallbacks, presenter notes, keyboard nav).

Both sit behind **Sign in with Synapse** (OAuth/OIDC). A personal access token
can be used instead, e.g. before an OAuth client is registered.

## Run locally

Requires Node ≥ 22.12 (`.nvmrc`).

```bash
cd web
cp .env.example .env     # fill in API_BASE_URL, SYNAPSE_CLIENT_ID/SECRET
npm install
npm run dev              # http://localhost:5173
```

The OAuth client must list `http://localhost:5173/` as a redirect URI.

## Docker

```bash
docker build -t sagebrain-web .
docker run -p 8080:8080 --env-file .env -e SYNAPSE_REDIRECT_URI=http://localhost:8080/ sagebrain-web
```

The image holds no environment-specific values. Every setting is a runtime
env var (see `.env.example`), so one image serves every environment:

| Variable | | |
|---|---|---|
| `API_BASE_URL` | required | Unified API base (serves `/ask` and `/query`), e.g. `https://…execute-api…/prod` |
| `SYNAPSE_CLIENT_ID` | for OAuth | Synapse OAuth client |
| `SYNAPSE_CLIENT_SECRET` | for OAuth | **Secret** — inject from Secrets Manager in ECS |
| `SYNAPSE_REDIRECT_URI` | for OAuth | Public URL of the app with a trailing slash; must be registered on the client |
| `SYNAPSE_SCOPE` | optional | Default `openid` |
| `PORT` | optional | Default `8080` |

Routes: `GET /healthz` (load balancer health check), `GET /config.js` (the
public settings above, for the browser), `POST /api/oauth/token`, and the SPA.

## How sign-in works

Modeled on `synapse-web-monorepo`, with one difference: the monorepo's
`synapse-react-client` login components are first-party only (they use
`/auth/v1/login2`/`session2` and cookies on `.synapse.org`). This app is a
*third-party* OIDC client of `signin.synapse.org` instead.

1. **Sign in** creates a random 32-byte hex `state` (like `generateCsrfToken()`),
   stores it in `sessionStorage`, and redirects to `https://signin.synapse.org/`
   with `client_id`, `redirect_uri`, `response_type=code`, `scope`, `claims`, `state`.
2. Synapse redirects back with `?code&state`. The app checks `state` against the
   stored value (like `useDetectSSOCode`), removes it, and strips the URL.
3. Synapse OAuth clients are **confidential**: there's no PKCE, and the token
   endpoint needs the client secret. So the browser posts the code to our server
   (`server/oauth.js`). The server calls `POST /auth/v1/oauth2/token` with Basic
   auth and returns only the access token.
4. The token lives in React context (`AuthContext`, cf. `SynapseContextProvider`)
   and `sessionStorage`. It's sent as `Authorization: Bearer` to the Sage Brain
   API. That API's authorizer accepts OAuth tokens (via the `userinfo` `userid`
   claim) as well as PATs, and checks Sage Brain team membership.

## Layout

```
server/      index.js (production server), oauth.js (code exchange), runtime.js (/config.js, /healthz)
src/auth/    OAuth flow, AuthContext, sign-in screen
src/api/     job client shared by /ask and /query (submit + poll)
src/ask/     Ask tab
src/demo/    guided demo: queries.ts, fallback.ts and renderers.ts are verbatim
             from the original demo (re-verify there before editing); the React
             components around them own state, navigation and run/fallback flow
```
