# Repository Guidelines

## Project Structure & Module Organization

This repository is a `cargo-generate` template collection. The root
`cargo-generate.toml` selects a subtemplate, while `cargo-generate-mod.rhai`
contains shared generation helpers. `base/` and `deno/` are independent sibling
templates; the latter includes TypeScript source under `deno/src/`, release
configuration, and its own workflow. Files in `shared/` are copied into both
generated projects. Root-level `.mise.toml`, `hk.pkl`, and
`.github/workflows/build.yaml` configure maintenance and validate both
subtemplates.

## Build, Test, and Development Commands

- `mise install` installs the pinned template-development tools.
- `mise run generate` launches `cargo-generate` against this checkout for an
  interactive local smoke test.
- `mise run update-mod` copies the root Rhai helper into each subtemplate after
  shared generator logic changes.
- `mise exec bun npm:markdownlint-cli2 -- markdownlint-cli2 <files>` checks
  edited Markdown using the configured linter.

The root currently has no `mise run check` or `mise run test` task, and its full
`hk check` configuration does not load. Until that is repaired, use the
file-type-specific commands from `hk.pkl` and generate both `base` and `deno`.

## Coding Style & Naming Conventions

Follow `.editorconfig`: UTF-8, LF line endings, two-space indentation, and a
120-column limit (80 for Markdown). Use Deno for TypeScript formatting and the
formatters configured in `hk.pkl` where a `fix` command exists. Pkl and YAML
steps validate only; format Rhai to match existing code and `.editorconfig`.
Use lowercase directory names, kebab-case mise task names such as `update-mod`,
and conventional TypeScript module names such as `mod.ts`. Put common generated
files in `shared/`; update root `cargo-generate-mod.rhai` before copied variants.

## Testing Guidelines

There is no repository-level unit-test suite. Treat successful generation and
checks of both subtemplates as the required regression test. When adding
runtime behavior to a generated project, add focused tests in that subtemplate
and expose them through its `mise run test` task so its workflow can discover
them.

## Commit & Pull Request Guidelines

History uses short Conventional Commit subjects, primarily `chore:`, `feat:`,
`refactor:`, and `docs:`. Keep each commit focused and imperative. Pull requests
should identify affected subtemplates, explain generated-output changes, link
relevant issues, and list the exact validation commands run. Include screenshots
only when a change affects rendered or interactive output.
