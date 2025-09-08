# repository-template

My personal repository template. Use it via [cargo-generate](https://cargo-generate.github.io/cargo-generate/index.html).

## Usage

If you run it via mise, you don’t need to install cargo-generate:

```bash
mise exec github:cargo-generate/cargo-generate -- cargo-generate generate atty303/repository-template
```

## Policy

### base

- Manage project-specific development tools using [mise](https://mise.jdx.dev/).
- Manage Git Hooks with [hk](https://hk.jdx.dev/). Run linters through mise.
- Use devcontainer to unify local and CDE (Codespaces, ONA) environments.
  The container only depends on mise, so the local environment is nearly
  identical if mise is available.
