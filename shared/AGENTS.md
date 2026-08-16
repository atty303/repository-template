# Repository Guidelines

## Development workflow

- Use `mise run check` for non-mutating repository checks.
- Use `mise run fix` for formatter and linter fixes.
- Use `mise run test` for all reproducible tests before completing a change.
- Pass paths after `--` to limit check or fix to selected files.
- Keep tool versions in `mise.toml` and commit the generated `mise.lock`.
- Treat `hk.pkl` as the source of truth for fast checks and Git hooks.

## Agent bootstrap

Run `mise trust --yes` and `mise install --yes` before development. The
project-scoped Codex configuration starts hk's MCP server through mise; restart
Codex after the first install if the server was unavailable during startup.

## Change policy

Keep changes focused, update documentation with public behavior, and use short
Conventional Commit subjects. Do not push, publish, release, or change external
state unless the user explicitly requests it.
