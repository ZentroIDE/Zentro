# Contributing to Zentro

Zentro is maintained by one person. Responses to issues and pull requests can be slow. Please read this file before opening either.

## Before you start

If this is your first contribution, read in order:

1. [ARCHITECTURE.md](ARCHITECTURE.md) — mental model, where things live, patterns.
2. [docs/EXTENDING.md](docs/EXTENDING.md) — recipes for common changes.
3. [docs/ENGINEERING.md](docs/ENGINEERING.md) — engineering charter (mission, SOLID rules, anti-patterns).

## What is welcome

- Small bug fixes and documentation fixes are welcome without prior discussion.
- Feature work and larger changes need an agreed issue first. Open an issue, explain the problem, and wait for the maintainer to agree before writing code. This keeps effort focused and avoids rejecting large PRs.

## License and CLA

- Zentro core is licensed under GPL-3.0-only.
- Every pull request requires a signed Contributor License Agreement. See [CLA.md](CLA.md). On your first PR a bot comments with a link to the CLA; reply with the sentence it asks for (`I have read the CLA Document and I hereby sign the CLA`) and the check turns green. PRs without a signed CLA will not be merged.

## Security issues

Do not open a public issue for vulnerabilities. See [SECURITY.md](SECURITY.md).

## PR process

1. Branch from `dev`: `git checkout -b feat/<short-name>` or `fix/<short-name>`.
2. Make the smallest coherent change that fully solves the problem. Do not mix refactor with feature work.
3. Add or update tests for non-trivial logic. See [docs/TECH-DEBT.md](docs/TECH-DEBT.md) for areas where tests are missing — adding them is welcome.
4. Run `npm run verify:push` locally. The pre-push hook will run it anyway, but failing earlier saves time.
5. Open a PR into `dev`. CI must be green before review.
6. Squash-merge is the default. Keep the squashed message in Conventional Commits format.

## Commit messages

Conventional Commits — concise, present tense, imperative.

```
<type>(<optional scope>): <short summary>

<optional body explaining WHY, not WHAT>
```

Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `build`, `ci`, `style`.

Examples:

- `feat(query): add cancel-on-tab-close for in-flight queries`
- `fix(result-grid): stop FetchMore loop after tab-switch remount`
- `refactor(driver): extract postgres catalog SQL into its own file`

## Code conventions

- **Go**: small focused interfaces; constructor-injected dependencies; no package-level mutable state except in `internal/core/registry.go`. Run `gofmt` (the pre-commit hook does this via `npm run format`).
- **Frontend**: feature-first; no `any`; derive view state instead of syncing booleans; use design-system primitives from `frontend/src/components/ui/`. Run `prettier` (same hook).
- See [docs/rules/coding-style.md](docs/rules/coding-style.md) for the full list.

## Architectural changes

If your change adds an abstraction, introduces a new dependency direction, or modifies a boundary that guardrails enforce, write a short ADR under [docs/adr/](docs/adr/) **before** writing code. Template at [docs/adr/0000-template.md](docs/adr/0000-template.md).

## Issue reporting

Use the provided templates under [.github/ISSUE_TEMPLATE/](.github/ISSUE_TEMPLATE/):

- **Bug Report** — steps to reproduce, environment, screenshots.
- **Feature Request** — problem statement, proposed approach, alternatives considered.

For security vulnerabilities, do **not** open a public issue. See [SECURITY.md](SECURITY.md).

## Releasing

Maintainers only. See `npm run release` (uses `commit-and-tag-version` + [.versionrc.cjs](.versionrc.cjs)) which bumps both `package.json` and `wails.json` in lockstep via [scripts/wails-version-updater.cjs](scripts/wails-version-updater.cjs).

---

Questions? Open a discussion on GitHub.
