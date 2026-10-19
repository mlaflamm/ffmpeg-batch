# Operations

Maintainer instructions for image verification, publishing, deployment and
rollback. See the [README](../README.md) for local development and basic builds.

## Image verification

```bash
bash .github/scripts/check-image.sh ffmpeg-batch:local
```

This builds a `linux/amd64` image, runs its full test suite, and checks entrypoint
startup, the job API, web interface and Socket.IO handshake. It uses disposable
container data and does not publish anything.

To open a shell in a running container:

```bash
docker exec -it <container> /bin/bash
```

## Dependency installation

`.npmrc` enables `legacy-peer-deps` because `routing-controllers` declares a
`class-transformer` peer version range that excludes the installed version.

## Continuous integration and image publishing

The **CI** workflow runs on pull requests, pushes to `master`, and manual runs.
It installs Node 24 and FFmpeg, builds the application, runs the full test suite,
and builds and checks a `linux/amd64` image. Pull requests have read-only
repository permissions and do not publish images.

Successful `master` runs publish the checked image to
`ghcr.io/mlaflamm/ffmpeg-batch:edge`. Each run records the published digest and
source commit in its summary. To rebuild with updated base-image packages,
select **Actions → CI → Run workflow** on `master`. Manual runs on other branches
only run checks. Workflows use the built-in `GITHUB_TOKEN`; no registry password
or personal access token is needed.

| Image reference       | Purpose                         | Updated by                  |
| --------------------- | ------------------------------- | --------------------------- |
| `:edge`               | Builds for deployment testing   | Successful CI on `master`   |
| `:vMAJOR.MINOR.PATCH` | Approved stable version         | Manual promotion            |
| `:latest`             | Current approved stable version | Manual promotion            |
| `@sha256:<digest>`    | One exact published image       | Immutable content reference |

Routine builds update only `:edge`. Use the digest from a successful run for a
deployment trial so that later builds cannot change the image being tested.

The promotion workflow uses a GitHub environment named `release`. Restrict its
deployment branches to `master`; optionally configure required reviewers for an
additional approval gate. The workflow also requires an explicit approval
checkbox. Protect `master` with the CI checks appropriate to the repository's
contribution policy.

After approving a tested deployment:

1. Open **Actions → Promote stable image → Run workflow** on `master`.
2. Enter the exact tested `sha256:` digest and a stable version such as `v1.0.0`.
3. Select the approval checkbox and run the workflow. Approve the `release`
   environment deployment if reviewer protection is configured.
4. Check the summary: the version tag and `:latest` must resolve to the supplied
   digest. Promotion copies the registry manifest without rebuilding the image.

Choose a new version tag for each stable release. Registry tag updates are not
atomic across both tags; if promotion fails, inspect their digests and rerun with
the same approved inputs to complete it. The workflow fails if either final tag
has a different digest.

### Public package access

The
[ffmpeg-batch package](https://github.com/users/mlaflamm/packages/container/package/ffmpeg-batch)
must have public visibility to allow anonymous pulls. Visibility is configured
under **Package settings → Change visibility → Public**. Ensure the repository
has access under **Manage Actions access** if publishing reports a package
permission error. See
[GitHub's package access instructions](https://docs.github.com/en/packages/learn-github-packages/configuring-a-packages-access-control-and-visibility).

Verify access without stored registry credentials:

```bash
image='ghcr.io/mlaflamm/ffmpeg-batch@sha256:<published-digest>'
anonymous_config=$(mktemp -d)
docker --config "$anonymous_config" pull "$image"
rm -rf "$anonymous_config"
```

Standard GitHub-hosted runners are free for public repositories, and GHCR
container storage and bandwidth are currently free. See
[Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions)
and [Packages billing](https://docs.github.com/en/billing/concepts/product-billing/github-packages)
for current terms.

## Deployment and rollback

Before changing an installation, record its image digest, port and volume
mappings, environment variables and restart settings. Back up persistent job data
and retain the previous image. Wait for active conversions to finish when possible.

Pull the selected digest and recreate the container with its saved settings.
Keep `/config` and media mappings consistent, set `WATCH_DIR` to the intended
container path, and expose container port 3000 through the saved host port.
Container recreation discards files stored outside persistent mappings.

Check startup, mapped file access and permissions, persisted jobs, AV1
conversion, output playback, the web interface and live logs before approving a
stable release.

Installations can follow the approved stable image at
`ghcr.io/mlaflamm/ffmpeg-batch:latest` or remain pinned to a digest. Recreating a container can interrupt a conversion;
review the recovery behavior below before enabling unattended updates.

To roll back, recreate the container using the recorded previous image digest
and saved configuration. Restore backed-up persistent job data if needed.

## Interrupted conversions

Keep job data in a persistent `/config` mapping and preserve media paths when
recreating the container. On restart, jobs left in progress become eligible for
retry after their job file has been inactive for more than one minute. Discovery
can take another job poll interval (`JOBS_POLL_INTERVAL`, default `5m`). Conversion
scripts restart the conversion from the beginning and overwrite partial output;
they do not resume at the previous frame. Keep the input available until the job
completes. Recovery tests send SIGTERM to the actual server during FFmpeg,
verify no old conversion can continue writing, and restart to playable output.

Allow at least **10 seconds** for container shutdown (`docker stop --time 10`, or
an equivalent configured timeout). Shutdown stops new work and closes HTTP,
sockets, log readers, watcher scans and timers. An active conversion process group
gets five seconds after SIGTERM, then SIGKILL if necessary; the server enforces an
eight-second total deadline and reports cleanup failure through a nonzero exit.
An intentionally interrupted job stays in progress for recovery and is not moved
to the error directory.
