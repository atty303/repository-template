# repository-template

A [cargo-generate](https://cargo-generate.github.io/cargo-generate/) collection
for reproducible, agent-friendly repositories.

## Templates

- `base` provides mise, hk, CI, a dev container, and repository guidance without
  selecting an application language.
- `deno` adds a typed Deno library, tests, JSR publish validation, and an
  optional semantic-release workflow.
- `shared` is the source of truth for files copied into both templates.

## Setup

Install [mise](https://mise.jdx.dev/), then bootstrap this repository:

```sh
mise trust --yes
mise install --yes
```

## Generate without prompts

Agents and automation should use the explicit generation interface:

```sh
mise run generate -- --name example --template base --license MIT --destination /tmp
```

```sh
mise run generate -- --name example --template deno --license Apache-2.0 --destination /tmp --semantic-release
```

`--semantic-release` is valid only for the Deno template. Without it, release
configuration and release-only tasks are not generated.

For a human-guided cargo-generate session, run `mise run generate:interactive`.

## Maintain the templates

Use the standard validation entrypoints:

```sh
mise run check
mise run fix
mise run test
```

Edit common generated files under `shared/`, then materialize them into both
templates with `mise run sync`. `mise run sync:check` fails when a template has
drifted from the shared source.

`mise run test` generates and validates these representative combinations:

- base with MIT
- base with Apache-2.0
- Deno with MIT and no release automation
- Deno with Apache-2.0 and semantic-release enabled
