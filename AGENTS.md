# Repository Guidelines

## Project Structure & Module Organization

This repository is a `cargo-generate` template collection. The root
`cargo-generate.toml` selects the `base` or `deno` subtemplate.
`scripts/generate.ts` provides the non-interactive generation interface, and
`scripts/sync_shared.ts` keeps the committed copies of common files aligned.
`base/` is language-neutral; `deno/` adds TypeScript source, tests, JSR package
metadata, and opt-in release automation. Edit common generated files in
`shared/`, then synchronize them into both subtemplates.

Root-level `mise.toml`, `mise.lock`, `hk.pkl`, and `.github/workflows/ci.yml`
configure maintenance and validate the representative generation matrix.

## Build, Test, and Development Commands

- `mise install --yes` installs the pinned template-development tools and hk
  hooks.
- Generate without prompts using the following interface. The release flag is
  valid only for Deno.

  ```sh
  mise run generate -- --name NAME --template base|deno --license MIT|Apache-2.0 --destination PATH [--semantic-release]
  ```
- `mise run generate:interactive` starts an interactive cargo-generate
  session.
- `mise run sync` copies common files from `shared/` into both subtemplates;
  `mise run sync:check` detects drift without changing files.
- `mise run check`, `mise run fix`, and `mise run test` are the standard
  validation and repair entrypoints. Pass selected paths after `--` to check or
  fix only those files.

## Coding Style & Naming Conventions

Follow `.editorconfig`: UTF-8, LF line endings, two-space indentation, a
120-column general limit, and an 80-column Markdown limit. Use Deno for
TypeScript formatting and the formatters configured in `hk.pkl` where a fix
command exists. Pkl and YAML steps validate only. Use lowercase directory
names, colon-separated mise task namespaces with kebab-case segments, and
conventional TypeScript module names such as `mod.ts`.

Treat `shared/` as the source of truth only for files listed in
`scripts/sync_shared.ts`. Template-specific mise, hk, README, source, and
release files remain under their respective subtemplate.

## Testing Guidelines

`mise run test` includes root static checks, shared-file drift detection,
focused script tests, and non-interactive generation of four representative
projects. Each generated project installs its locked tools and runs its own
`mise run test`; Deno projects also run unit tests and a JSR publish dry run.

When adding runtime behavior to a generated project, add focused tests in that
subtemplate and expose them through its `mise run test` task. Never exercise an
actual publish from repository tests.

## Commit & Pull Request Guidelines

History uses short Conventional Commit subjects, primarily `chore:`, `feat:`,
`refactor:`, and `docs:`. Keep each commit focused and imperative. Pull requests
should identify affected subtemplates, explain generated-output changes, link
relevant issues, and list the exact validation commands run. Include
screenshots only when a change affects rendered or interactive output.
