#!/usr/bin/env bash
set -euo pipefail

image=${IMAGE_NAME:?IMAGE_NAME is required}
digest=${DIGEST:?DIGEST is required}
version=${VERSION:?VERSION is required}

if [[ ! "$digest" =~ ^sha256:[a-f0-9]{64}$ ]]; then
  echo 'DIGEST must be sha256: followed by 64 lowercase hexadecimal characters' >&2
  exit 1
fi
if [[ ! "$version" =~ ^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]]; then
  echo 'VERSION must be a stable vMAJOR.MINOR.PATCH tag' >&2
  exit 1
fi

source="$image@$digest"
actual=$(docker buildx imagetools inspect "$source" --format '{{.Manifest.Digest}}')
if [[ "$actual" != "$digest" ]]; then
  echo 'Source manifest digest does not match the requested digest' >&2
  exit 1
fi

# Preserve a single-platform manifest instead of wrapping it in a new image index.
docker buildx imagetools create --prefer-index=false \
  --tag "$image:$version" --tag "$image:latest" "$source"

for tag in "$version" latest; do
  actual=$(docker buildx imagetools inspect "$image:$tag" --format '{{.Manifest.Digest}}')
  if [[ "$actual" != "$digest" ]]; then
    echo "Digest verification failed for $image:$tag" >&2
    exit 1
  fi
done

{
  echo '### Promoted stable image'
  echo
  echo "Image: \`$source\`"
  echo "Tags: \`$version\`, \`latest\`"
} >> "${GITHUB_STEP_SUMMARY:-/dev/stdout}"
