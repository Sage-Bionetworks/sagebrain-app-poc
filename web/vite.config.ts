import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Connect, type Plugin } from 'vite'
import { createTokenHandler, oauthConfigFromEnv } from './server/oauth.js'
import { createConfigHandler, publicConfigFromEnv } from './server/runtime.js'

/* Mounts the server routes (OAuth code exchange, runtime /config.js) on the
   dev and preview servers, so `npm run dev` is a complete local setup. In
   production the same handlers run in server/index.js. */
function serverRoutes(env: Record<string, string>): Plugin {
  const token = createTokenHandler(oauthConfigFromEnv(env))
  const config = createConfigHandler(publicConfigFromEnv(env))
  const mount = (server: { middlewares: Connect.Server }) => {
    server.middlewares.use('/api/oauth/token', token)
    server.middlewares.use('/config.js', config)
  }
  return { name: 'sagebrain-server-routes', configureServer: mount, configurePreviewServer: mount }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // '' prefix: load every .env variable. Nothing is baked into the bundle —
  // public values reach the browser via /config.js, the secret never does.
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), serverRoutes(env)],
    server: { port: 5173, strictPort: true },
  }
})
