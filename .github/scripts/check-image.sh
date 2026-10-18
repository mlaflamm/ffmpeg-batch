#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."
image=${1:?Usage: check-image.sh IMAGE}
revision=${GITHUB_SHA:-$(git rev-parse HEAD)}

docker build --pull --platform linux/amd64 \
  --label "org.opencontainers.image.revision=$revision" --tag "$image" .

docker run --rm --network none \
  -e JOBS_DIR=.test/jobs -e WATCH_ENABLED=false -e WATCH_DIR=.test/watch -e DEBUG= \
  --mount "type=bind,src=$PWD/test,dst=/usr/src/app/test,readonly" \
  --mount "type=bind,src=$PWD/.env.test,dst=/usr/src/app/.env.test,readonly" \
  "$image" npm test

container_id=
cleanup() {
  if [[ -n "$container_id" ]]; then
    docker logs "$container_id"
    docker rm -f "$container_id" > /dev/null
  fi
}
trap cleanup EXIT

container_id=$(docker run -d --network none \
  -e NODE_ENV=production -e WATCH_ENABLED=false -e WATCH_DIR=/tmp/watch \
  -e JOBS_DIR=/tmp/jobs -e DEBUG= "$image")

docker exec -i "$container_id" node <<'JS'
const assert = require('node:assert/strict');

(async () => {
  const base = 'http://127.0.0.1:3000';
  let response;
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      response = await fetch(base + '/api/jobs', { signal: AbortSignal.timeout(1000) });
      if (response.ok) break;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  assert(response?.ok, 'Job API did not become ready');
  assert.deepEqual(await response.json(), []);
  const page = await fetch(base, { signal: AbortSignal.timeout(3000) });
  assert.equal(page.status, 200);
  assert.match(await page.text(), /<html/i);
  const socket = await fetch(base + '/socket.io/?EIO=3&transport=polling', {
    signal: AbortSignal.timeout(3000),
  });
  assert.equal(socket.status, 200);
  assert.match(await socket.text(), /"sid"/);
  console.log('Image startup, job API, web interface and Socket.IO handshake passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
JS
