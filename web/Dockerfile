# Sage Brain web app: static React build + a small Node server
# (OAuth code exchange, runtime /config.js, /healthz). Configured entirely by
# environment variables at runtime — see .env.example — so one image serves
# every environment.

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
ENV NODE_ENV=production PORT=8080
WORKDIR /app
# the server has no npm dependencies: only its code and the built assets
COPY --from=build /app/dist ./dist
COPY server ./server
COPY package.json ./
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
CMD ["node", "server/index.js"]
