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
{% if browser_automation then %}

## Browser automation

Use `mise run browser:cli -- --help` for CLI commands. Start with
`mise run browser:cli -- open <url>`, inspect with
`mise run browser:cli -- snapshot`, and finish with
`mise run browser:cli -- close`. A missing browser is installed automatically on
the first `open`; no setup command is needed before normal CLI use.
`mise run browser:install` is available for explicit installation.

For TypeScript scenario tests, follow the
[repository-template scenario guide][scenario-guide].

[scenario-guide]: https://github.com/atty303/repository-template/blob/main/docs/browser-automation.md#add-a-typescript-scenario-later
{% end %}
