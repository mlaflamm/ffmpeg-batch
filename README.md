# ffmpeg-batch

A tool that watch a directory for new video files to scale down. I built this for myself.

#### Docker cheatsheet

##### build docker image

```
docker build -t mlaflamme/ffmpeg-batch .
```

##### publish docker image

```
docker push mlaflamme/ffmpeg-batch
```

##### run interactive shell in running container

```
docker exec -it <container> /bin/bash
```

#### Local development and validation

Use Node 24 (`nvm use`) and install Bash and FFmpeg with `ffprobe`. The FFmpeg
build must support software AV1 decoding and the libaom-av1 encoder used to
generate test fixtures. The Debian-based Docker image includes these tools.

```
npm ci
npm run build
npm test
```

Tests generate short MP4, MOV, WMV, and AV1 fixtures locally under `.temp/`;
no sample media downloads are required.

`.npmrc` enables `legacy-peer-deps` because `routing-controllers` declares a
`class-transformer` peer version range that excludes the installed version.

The image uses `node:24-trixie-slim` and Debian FFmpeg with AV1 input decoding.
`scale.sh` produces a 960-pixel-wide MP4 with CRF 21, copies the audio, and clears
the title.

#### Interrupted conversions

Keep job data in a persistent `/config` mapping and preserve media paths when
recreating the container. On restart, jobs left in progress become eligible for
retry after their job file has been inactive for more than one minute. Discovery
can take another job poll interval (`JOBS_POLL_INTERVAL`, default `5m`). Conversion
scripts restart the conversion from the beginning and overwrite partial output;
they do not resume at the previous frame. Keep the input available until the job
completes. Recovery is covered by a regression test using a stale job and partial
output.
