# Repository Guidelines

## Project Structure & Module Organization

This repository is one Archetect archetype. Root `archetype.yaml` declares the
engine contract and `archetype.lua` collects answers and renders the selected
variant. `shared/` is rendered into every generated repository; `base/` is
language-neutral, `deno/` adds TypeScript source and JSR metadata, and
`deno-release/` is an optional overlay for semantic-release automation.

Root-level `mise.toml`, `mise.lock`, `hk.pkl`, and `.github/workflows/ci.yml`
configure maintenance and validate the representative generation matrix.

## Build, Test, and Development Commands

- `mise install --yes` installs the pinned template-development tools and hk
  hooks.
- Generate without prompts using the native Archetect interface. The
  `semantic_release` answer is valid only for Deno.

  ```sh
  mise run generate -- DESTINATION --headless -a template=base|deno -a project_name=NAME -a 'author=NAME <EMAIL>' -a license=MIT|Apache-2.0 [-a semantic_release=true]
  ```
- Omit `--headless` and answers to use Archetect prompts. Initialize Git in the
  generated repository as a separate operation.
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

Treat `shared/` as the only source of truth for common generated files. Keep
variant-specific mise, hk, README, and source files under `base/` or `deno/`,
and release-only files under `deno-release/`.

## Testing Guidelines

`mise run test` includes root static checks and Archetect-driven generation of
four representative projects. The test initializes Git explicitly, installs
each generated project's locked tools, and runs its `mise run test`; Deno
projects also run unit tests and a JSR publish dry run. Deno is a root testing
dependency, not a requirement for normal Archetect rendering.

When adding runtime behavior to a generated project, add focused tests in that
subtemplate and expose them through its `mise run test` task. Never exercise an
actual publish from repository tests.

## Commit & Pull Request Guidelines

History uses short Conventional Commit subjects, primarily `chore:`, `feat:`,
`refactor:`, and `docs:`. Keep each commit focused and imperative. Pull requests
should identify affected subtemplates, explain generated-output changes, link
relevant issues, and list the exact validation commands run. Include
screenshots only when a change affects rendered or interactive output.
