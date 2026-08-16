# Repository Guidelines

## Development workflow

- Use `mise run check` for explicitly requested non-mutating repository checks.
- Use `mise run fix` for safe formatter and linter fixes without staging
  changes.
- Use `mise run test` for all reproducible tests before completing a change.
- Pass paths after `--` to limit check or fix to selected files.
- Keep tool versions in `mise.toml` and commit the generated `mise.lock`.
- Treat `hk.pkl` as the source of truth for fast checks and Git hooks.

## Agent feedback

Use fix-first feedback during development. With hk MCP, call `inspect_project`
and `plan`, then `start_safe_fix` without a preliminary check or diff. Without
MCP, call `mise run fix` directly. If autofix succeeds with no remaining
diagnostics, continue without reading the diff. Read run output and the diff
only when autofix fails, leaves diagnostics, reports a parser warning, or may
have applied a partial change; repair the issue and run fix again. Use
`start_safe_check` or `mise run check` only when non-mutating verification is
explicitly requested or fix cannot be used diagnostically. Never bypass a safe
refusal with unrestricted MCP execution or a direct `hk` command. Run
`mise run test` once as the final verification.

## Agent bootstrap

Run `mise trust --yes` and `mise install --yes` before development. The
project-scoped Codex configuration starts hk's MCP server through mise; restart
Codex after the first install if the server was unavailable during startup.

## Change policy

Keep changes focused, update documentation with public behavior, and use short
Conventional Commit subjects. Do not push, publish, release, or change external
state unless the user explicitly requests it.
