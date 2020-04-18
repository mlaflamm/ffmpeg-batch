FROM node:10-alpine

ENV DEBUG=ffmpeg-batch:* JOBS_DIR=/config/jobs JOBS_ENABLED=true WATCH_ENABLED=true
RUN apk add --no-cache bash ffmpeg

ENV PORT 3000
EXPOSE 3000
WORKDIR /usr/src/app
COPY . .
RUN npm install && npm run build

CMD ["node", "dist/server.js"]
