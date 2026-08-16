# {{ project_slug }}

## Setup

Install [mise](https://mise.jdx.dev/), then bootstrap the repository:

```sh
mise trust --yes
mise install --yes
```

If Codex was already running, restart it after the first install so the
project-local hk MCP server can start.

## Development

```sh
mise run check
mise run fix
mise run test
```

Pass selected files after `--`, for example `mise run check -- src/mod.ts`.

{% if semantic_release then %}## Releases

Before the first release, create `@atty303/{{ project_slug }}` on JSR and link
this GitHub repository in the package settings. The publishing identity must be
allowed to publish within the `@atty303` scope. See
[Publishing from GitHub Actions](https://jsr.io/docs/publishing-packages#publishing-from-github-actions).

Push Conventional Commits to `main`. After the repository tests pass,
semantic-release updates `deno.jsonc`, creates the GitHub release, and publishes
the package to JSR using GitHub Actions OIDC.

{% end %}## License

{{ license }}
