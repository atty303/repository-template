# {{project-name}}

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

Pass selected files after `--`, for example `mise run check -- README.md`.

## License

{{license}}
