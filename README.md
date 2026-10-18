# ffmpeg-batch

A tool that watches directories and queues FFmpeg video conversions.

`scale.sh` produces a 960-pixel-wide MP4 with CRF 21, copies the audio, and clears
the title. AV1 is supported as an input format when FFmpeg includes an AV1 decoder.

## Local development

Use Node 24 (`nvm use`) and install Bash and FFmpeg with `ffprobe`. Tests also
require the libaom-av1 encoder to generate AV1 fixtures.

```bash
npm ci
npm run build
npm test
npm start
```

Tests generate short MP4, MOV, WMV, and AV1 fixtures locally under `.temp/`;
no sample media downloads are required.

## Docker

The image uses `node:24-trixie-slim` and Debian FFmpeg with AV1 decoding support.

```bash
docker build --platform linux/amd64 -t ffmpeg-batch:local .
```

See the [operations guide](docs/operations.md) for full image checks, CI and GHCR
setup, release promotion, deployment, interrupted-job recovery, and rollback.
