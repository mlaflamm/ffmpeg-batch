FROM node:10-alpine

RUN apk add --no-cache bash ffmpeg

ENV PORT 3000
EXPOSE 3000
WORKDIR /usr/src/app
COPY . .
RUN npm install && npm run build

ENV DEBUG=ffmpeg-batch:* DEBUG_COLORS=true

CMD ["node", "dist/server.js"]
