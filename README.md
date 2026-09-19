# repository-template

An [Archetect](https://archetect.github.io/) archetype for reproducible,
agent-friendly repositories.

This repository also publishes a commit-pinned, generic GitHub release action.
It is maintained independently from the Archetect render tree; see
[`docs/release-action.md`](docs/release-action.md).

## Templates

- `base` provides mise, hk, CI, a dev container, and repository guidance without
  selecting an application language.
- `deno` adds a typed Deno library, tests, JSR publish validation, and optional
  semantic-release automation.
- `shared` is rendered directly into every generated repository.
- `deno-release` is rendered only when a Deno repository enables
  `semantic_release`.

## Setup

Install [mise](https://mise.jdx.dev/), then bootstrap this repository:

```sh
mise trust --yes
mise install --yes
```

## Generate a repository

The archetype requires `template`, `project_name`, `author`, and `license`.
`semantic_release` is a Deno-only boolean and defaults to `false`. The generated
repository is written to `<destination>/<normalized-project-name>`.

Render the local checkout without prompts:

```sh
mise run generate -- /tmp --headless -a template=base -a project_name=example -a 'author=Example Author <author@example.com>' -a license=MIT
```

For Deno with release automation:

```sh
mise run generate -- /tmp --headless -a template=deno -a project_name=example -a 'author=Example Author <author@example.com>' -a license=Apache-2.0 -a semantic_release=true
```

Running `mise run generate -- /tmp` without `--headless` prompts for answers.
The generation path invokes Archetect directly; Deno is used only by this
repository's maintenance checks and generation regression tests.

Render an immutable GitHub revision with Archetect as the caller's only mise
tool dependency:

```sh
mise exec github:archetect/archetect@3.4.3 -- archetect render 'https://github.com/atty303/repository-template.git#<commit>' /tmp --headless -a template=deno -a project_name=example -a 'author=Example Author <author@example.com>' -a license=Apache-2.0 -a semantic_release=true
```

Archetect does not initialize Git or execute external commands. Initialize the
generated repository separately when needed:

```sh
git -C /tmp/example init --initial-branch=main
```

## Maintain the archetype

Use the standard validation entrypoints:

```sh
mise run check
mise run fix
mise run test
```

Edit common generated files under `shared/`. They are rendered directly, so no
synchronization step or duplicated copy exists under `base/` or `deno/`.

`mise run test` generates and validates these representative combinations:

- base with MIT
- base with Apache-2.0
- Deno with MIT and no release automation
- Deno with Apache-2.0 and semantic-release enabled
