# ── Stage 1: build the React/Vite app ──────────────────────────
FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Injected at build time so the compiled JS bundle calls a relative
# "/api" path instead of a hardcoded localhost URL. The reverse-proxy
# nginx container forwards "/api/*" to the backend — see nginx/nginx.conf.
ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

RUN npm run build

# ── Stage 2: serve the built static files ──────────────────────
FROM nginx:1.27-alpine

# SPA routing config — see client/nginx.conf. Needed so refreshing on a
# route like /execution doesn't 404 (falls back to index.html).
COPY nginx.conf /etc/nginx/conf.d/default.conf

COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80