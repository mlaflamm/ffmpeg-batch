#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."
mkdir -p .test
sandbox=$(mktemp -d "$PWD/.test/promotion.XXXXXX")
trap 'rm -rf "$sandbox"' EXIT

# Record registry operations without accessing Docker or publishing an image.
cat > "$sandbox/docker" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$CALL_LOG"
case "$*" in
  'buildx imagetools inspect '*)
    if [[ "$4" == *@* ]]; then
      printf '%s\n' "$SOURCE_DIGEST"
    else
      printf '%s\n' "$TARGET_DIGEST"
    fi
    ;;
  'buildx imagetools create '*) ;;
  *) echo "Unexpected Docker operation: $*" >&2; exit 1 ;;
esac
MOCK
chmod +x "$sandbox/docker"
export PATH="$sandbox:$PATH"
export CALL_LOG="$sandbox/calls" GITHUB_STEP_SUMMARY="$sandbox/summary"
export IMAGE_NAME=ghcr.io/mlaflamm/ffmpeg-batch
export DIGEST=sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
export VERSION=v1.2.3
export SOURCE_DIGEST="$DIGEST" TARGET_DIGEST="$DIGEST"

expect_failure() {
  : > "$CALL_LOG"
  if bash .github/scripts/promote-image.sh > "$sandbox/output" 2>&1; then
    echo "Expected failure: $1" >&2
    exit 1
  fi
  echo "Passed: $1"
}

DIGEST=invalid expect_failure 'invalid digest rejected before registry access'
test ! -s "$CALL_LOG"
VERSION=latest expect_failure 'invalid version rejected before registry access'
test ! -s "$CALL_LOG"
SOURCE_DIGEST=wrong expect_failure 'mismatched source rejected before promotion'
if grep -q '^buildx imagetools create ' "$CALL_LOG"; then
  echo 'Source mismatch must not change tags' >&2
  exit 1
fi
TARGET_DIGEST=wrong expect_failure 'mismatched promoted tag reported as failure'

: > "$CALL_LOG"
bash .github/scripts/promote-image.sh
# Exactly one manifest copy must update both tags from the supplied digest.
grep -Fxq "buildx imagetools create --prefer-index=false --tag $IMAGE_NAME:$VERSION --tag $IMAGE_NAME:latest $IMAGE_NAME@$DIGEST" "$CALL_LOG"
test "$(grep -c '^buildx imagetools create ' "$CALL_LOG")" -eq 1
test "$(grep -c '^buildx imagetools inspect ' "$CALL_LOG")" -eq 3
echo 'Passed: approved digest copied to both tags without rebuilding'
