# Generic release action

`.github/actions/release` is a bundled JavaScript action for repositories that
want one low-maintenance release path without coupling the release controller to
a language ecosystem. It uses semantic-release for commit analysis, notes, Git
tags, and GitHub Releases. Repository-specific build and registry work stays in
mise tasks.

The action is maintained independently from this repository's Archetect render
tree. It is not currently emitted into generated repositories.

## Caller workflow

Pin the action to a full commit SHA. The caller owns checkout and mise setup, so
it may select any mise version, configure `jdx/mise-action`, or use a fork.

```yaml
name: Release

on:
  push:
    branches:
      - main
  workflow_dispatch:

permissions:
  contents: write

concurrency:
  group: release-${{ github.repository }}
  cancel-in-progress: false

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803 # v6.1.0
        with:
          fetch-depth: 1
          persist-credentials: false

      - name: Setup mise
        uses: jdx/mise-action@3c2e0cf82a5b2e5249f0d3635a4d83d0ae861518 # v4.2.5
        with:
          version: 2026.8.6

      - name: Release
        uses: atty303/repository-template/.github/actions/release@FULL_COMMIT_SHA
        with:
          versioning: calver
          github-token: ${{ github.token }}
        env:
          FNOX_AGE_KEY: ${{ secrets.RELEASE_FNOX_AGE_KEY }}
```

Use `versioning: semver` for libraries and `versioning: calver` for
applications. The action itself does not name or read registry credentials.
`FNOX_AGE_KEY` above is only an example mapping owned by fnox and the caller;
the GitHub secret may have any name. Additional credential variables can be
passed in the same `env` block and are visible only to the caller's mise tasks.

Add `id-token: write` when the registry task uses OIDC, or `packages: write`
when it publishes GitHub Packages. They are not required by the action itself.

The action fetches complete history, tags, and semantic-release notes, so a
shallow checkout is valid. It releases only from the GitHub repository's default
branch. Invocation on any other branch or ref is a successful no-op.

## Required build task

Every caller declares a root mise task named `release:build`. It receives the
version and absolute artifact directory as positional arguments. The same values
are also available as `RELEASE_VERSION` and `RELEASE_ARTIFACT_DIR`.

```toml
[tasks."release:build"]
description = "Build release artifacts"
run = '''
#!/usr/bin/env bash
set -euo pipefail
version="$1"
output_directory="$2"
# Build for "$version" and write direct files into "$output_directory".
'''
```

The action removes `.release/artifacts` before the task runs. The task must
produce at least one direct regular file there. Directories, symbolic links, and
unsafe filenames are rejected. The action computes each file's SHA-256 digest in
memory, uploads exactly those files, and verifies the GitHub-hosted asset state,
size, and server-reported digest before reporting success. It does not create or
require checksum files; only files produced by the caller are uploaded. A
missing or mismatched digest fails the release and enters the normal
ownership-aware rollback path.

The task may modify its working copy to inject the release version, but it must
not create a commit. The release tag intentionally points at the input default
branch commit, not a version-only or generated commit.

## Optional registry task

Declare `release:publish` to publish the already-built files to a registry. The
action detects the task from `mise tasks --json`; there is no action input that
enables registry publishing.

```toml
[tasks."release:publish"]
description = "Publish release artifacts"
run = '''
#!/usr/bin/env bash
set -euo pipefail
version="$1"
artifact_directory="$2"
# Publish "$version" from "$artifact_directory" using fnox or another tool.
'''
```

This task runs after the Git tag exists and before the GitHub Release is
created. It must be idempotent: retrying the same version and content succeeds,
while different content for an existing version fails. Registry resources are
never deleted during rollback.

## mise monorepos

With `monorepo_root = true`, mise exposes root tasks with qualified names:

- `release:build` becomes `//:release:build`.
- `release:publish` becomes `//:release:publish`.
- a child task may be named `//packages/app:release:build`.

Keep declaring the task normally in the root `mise.toml`. The action runs
`mise tasks --json` at the Git top level and accepts only the exact unqualified
name or exact `//:` root name. It executes the discovered name verbatim and
never selects a same-suffix child task. This also works when the checkout path
or initiating development command was inside a package directory.

## Version and release behavior

On the first run without a reachable release tag, the action creates a
lightweight `v0.0.0` on the first-parent initial commit in the runner's working
copy. This neutral bootstrap tag lets the same run analyze the complete commit
history without requiring an elevated credential. It is removed before
semantic-release pushes tags, so it never appears in the remote repository and
has no GitHub Release or artifacts. The first durable tag is the real release
tag on the input default-branch commit.

After the first real release, the selected mode is immutable:

- SemVer uses semantic-release's normal `major.minor.patch` calculation.
- CalVer uses `YYYY.M.COUNTER` in `Asia/Tokyo`. A month's first release has
  counter `0`; later releases increment it. A clock earlier than the latest
  release month fails closed.

CalVer remains inside semantic-release's normal version and tag lifecycle.
Within a month the action maps a relevant change to a patch increment; across a
month boundary it maps one to a minor increment. On the first release or after
skipped months, it creates a lightweight predecessor tag on the previous release
commit in the runner only, so semantic-release computes the exact current month.
That bridge tag is removed before tags are pushed, just like the bootstrap tag.

Each successful GitHub Release contains a hidden mode marker. The action scans
those durable markers before analysis and rejects a switch between SemVer and
CalVer. Existing numeric tags are not guessed to belong to either mode.

Both modes analyze every commit since the latest reachable version tag. `feat`,
`fix`, `perf`, `revert`, and breaking changes trigger releases. `docs`, `test`,
`ci`, `build`, `chore`, and ordinary `refactor` commits do not. Non-Conventional
Commits are warned about and ignored. Release notes come from the official
semantic-release generator and therefore work for direct pushes as well as
merged pull requests.

The action supplies semantic-release's entire configuration itself. A caller's
`.releaserc` or other semantic-release configuration is intentionally ignored,
so the central lifecycle and cleanup contract cannot vary between repositories.

The action performs no changelog or source-tree writeback. Its order is:

1. analyze commits and select the version;
2. run and validate `release:build`;
3. atomically reserve the Git tag through the GitHub API, then let
   semantic-release record its local tag and note;
4. run optional `release:publish`;
5. create the non-draft, non-prerelease GitHub Release and upload artifacts.
6. verify the uploaded asset set, sizes, and GitHub-reported SHA-256 digests.

On failure it removes only the GitHub Release and tags that the current run
established ownership of. Release ownership is confirmed with a unique hidden
marker and exact release ID; tag ownership is journaled around the atomic ref
creation. A semantic-release Git note may remain as retry metadata because a
shared notes ref cannot be deleted safely without ownership of its complete
history. It is ignored while its release tag is absent and reused by a retry of
the same version. If a network failure leaves creation outcome unknown, cleanup
reports the resource instead of deleting it. Existing resources are left
untouched. A post-action cleanup retries rollback after cancellation or a main
action failure. Keep caller release concurrency serialized as shown above.

## Multi-platform builds

The initial controller is one `ubuntu-latest` job. A repository can later make
`release:build` synchronously dispatch a separate matrix workflow, wait for its
completion, download its artifacts into the supplied directory, and return. This
preserves one semantic-release lifecycle and requires no change to the central
action. The dispatched workflow and wait logic remain caller-owned.
