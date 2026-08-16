# Repository Guidelines

## Architecture and Ownership

This repository is one Archetect archetype. `archetype.yaml` defines the
engine and templating contract; `archetype.lua` owns prompts, validation,
derived answers, and render order.

Generated-project files have three owners:

- `shared/` is rendered into every project and is the only source of common
  generated files.
- `base/` and `deno/` contain files specific to their selected variant.
- `deno-release/` is an overlay rendered only when a Deno project enables
  semantic release.

Do not copy shared files into a variant or add synchronization machinery.
Root files such as `.github/workflows/ci.yml`, `mise.toml`, and `hk.pkl`
maintain this archetype; edit their generated-project counterparts under the
appropriate render directory instead.

## Generation Invariants

Keep the public interface native to `archetect render`; do not add a wrapper,
compatibility alias, catalog, or external command execution. Normal generation
must require only the Archetect binary and Git when fetching a remote source.
Deno is a development and regression-test dependency, not a generation
dependency. Git initialization remains a separate caller-owned operation.

Preserve the answer contract in `archetype.lua`:

- `template`, `project_name`, `author`, and `license` are required.
- Normalize only base project names to kebab-case and reject an empty result.
- Preserve a validated Deno project name exactly; it is 2–58 lowercase
  letters, digits, or hyphens and cannot start with a hyphen.
- Prompt for `semantic_release` only for Deno and default it to `false`.

Render `shared/`, then the selected variant, then `deno-release/` when enabled.
Keep undefined ATL variables in strict mode. Use ATL raw blocks where generated
files must retain foreign template expressions such as GitHub `${{ ... }}` or
hk `{{files}}`.

## Development Workflow

Bootstrap the pinned development tools with `mise trust --yes` and
`mise install --yes`. Use these repository entrypoints:

- `mise run generate -- DESTINATION [ARCHETECT_ARGS...]` delegates directly to
  `archetect render .`.
- `mise run check [-- PATHS...]` runs non-mutating formatting, lint, manifest,
  and Archetect interface checks.
- `mise run fix [-- PATHS...]` safely applies available formatting and lint
  fixes without staging changes.
- `mise run test` runs all reproducible checks and generation E2E tests.

Agents should use fix-first feedback during development. When hk MCP is
available, inspect the project and plan, then call `start_safe_fix` without a
preliminary check or diff. Otherwise, call `mise run fix` directly. On a
successful fix with no remaining diagnostics, continue without inspecting the
diff. Inspect logs and the diff only when autofix fails, leaves diagnostics,
reports a parser warning, or may have applied a partial change; after manual
repairs, run fix again instead of switching to check. Use `mise run check` or
`start_safe_check` only when explicitly asked for non-mutating verification or
when fix cannot be used diagnostically. Never bypass a safe refusal with an
unrestricted MCP tool or direct `hk` invocation. Run `mise run test` once as
the final verification.

Treat `mise.toml` as the tool-version source and update committed lockfiles
through mise rather than by hand. Treat `hk.pkl` as the source of truth for
fast checks and Git hooks. Do not introduce a Lua formatter solely for
`archetype.lua`; Pkl and YAML checks remain validation-only unless the tool
configuration explicitly changes.

## Template and Code Style

Follow `.editorconfig`: UTF-8, LF endings, two-space indentation, a 120-column
general limit, and an 80-column Markdown limit. Use Deno for TypeScript
formatting and the fixers configured in `hk.pkl`. Use lowercase directory
names, colon-separated mise task namespaces with kebab-case segments, and
conventional TypeScript module names such as `mod.ts`.

When changing common generated behavior, edit `shared/`. Keep variant tooling,
README content, and source under its variant; keep release-only workflow,
configuration, and scripts under `deno-release/`. Review both raw template
source and rendered output when changing ATL syntax or whitespace control.

## Testing Expectations

`mise run check` must keep `archetect interface . --json --explore` at complete
coverage. `mise run test` renders four full projects: base with each license,
Deno without release automation, and Deno with release automation. It also
covers preservation of a Deno boundary name.

The E2E test initializes Git explicitly, installs each generated project's
locked tools, and runs that project's `mise run test`. Deno cases retain unit
tests and a JSR publish dry run; the release case also verifies version
preparation without losing JSONC comments or trailing commas. Never perform an
actual publish from repository tests.

When changing answers, render order, overlays, generated tooling, or release
behavior, update `scripts/test_generate.ts` at the observable boundary. Add
runtime tests inside the affected variant and expose them through its
`mise run test` task.

## Change Hygiene

History uses short imperative Conventional Commit subjects, primarily
`chore:`, `feat:`, `refactor:`, and `docs:`. Keep each logical change focused.
For pull requests, identify affected variants and generated outputs and list
the exact validation commands run.
