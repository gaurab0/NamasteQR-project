FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
EXPOSE 10000
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma

COPY --from=docker.io/tailscale/tailscale:stable /usr/local/bin/tailscaled /opt/ts/tailscaled
COPY --from=docker.io/tailscale/tailscale:stable /usr/local/bin/tailscale /opt/ts/tailscale
RUN mkdir -p /var/run/tailscale /var/cache/tailscale /var/lib/tailscale
COPY start.sh /opt/ts/start.sh
RUN sed -i 's/\r$//' /opt/ts/start.sh && chmod +x /opt/ts/start.sh
CMD ["/opt/ts/start.sh"]
