FROM node:24-trixie-slim

LABEL org.opencontainers.image.source="https://github.com/mlaflamm/ffmpeg-batch"

ENV DEBUG=ffmpeg-batch:* JOBS_DIR=/config/jobs JOBS_ENABLED=true WATCH_ENABLED=true
RUN apt-get update \
    && apt-get install -y --no-install-recommends bash ffmpeg \
    && rm -rf /var/lib/apt/lists/*

ENV PORT=3000
EXPOSE 3000
WORKDIR /usr/src/app
COPY package.json package-lock.json .npmrc ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

CMD ["node", "dist/server.js"]
