# Contributing to CS:GO Inventory Tracker

Thanks for your interest in contributing!

## Code of Conduct

This project follows the [Contributor Covenant](./CODE_OF_CONDUCT.md). By
participating, you're expected to uphold it. Report unacceptable behavior to
**finallyjay@gmail.com**.

## Getting started

```bash
git clone https://github.com/finallyjay/csgo-inventory-tracker.git
cd csgo-inventory-tracker
pnpm install
cp .env.example .env
pnpm dev          # http://localhost:3000
```

This project uses Node 24 (see `.nvmrc`) and pnpm 11. At minimum you'll need a
Steam Web API key (`STEAM_API_KEY` in `.env` — see `.env.example` for the full
list of variables and what they do) to exercise the Steam OpenID login flow
locally.

## Project layout

See `CLAUDE.md` for an architecture overview (auth/whitelist, the inventory
valuation pipeline, SQLite migrations, dates/timezones, etc.) — it's kept up
to date and is the best starting point before making a non-trivial change.

## Making a change

1. **Open an issue first** for anything non-trivial, so we can agree on the
   approach before you invest time.
2. Create a branch off `main` for the issue, e.g. `git checkout -b fix/123-short-description`.
3. Keep changes focused — one logical change per pull request.
4. Match the existing style: TypeScript strict, Next.js App Router
   conventions, Tailwind design tokens (avoid hardcoded `bg-white/N` etc. —
   see `CLAUDE.md`).
5. **Test your change**:
   - `pnpm test` — Vitest suite (`pnpm exec vitest run test/<file>.test.ts` to
     run a single file)
   - `pnpm test:coverage` — same, with a coverage report
   - `pnpm lint` — oxlint + typecheck (`pnpm typecheck` alone runs
     `next typegen` + `tsc --noEmit`)
   - `pnpm format` — oxfmt, auto-formats; `pnpm format:check` verifies without
     writing
   - `pnpm build` — production build, to confirm nothing breaks at build time

Pre-commit hooks (Husky + lint-staged) run oxfmt and oxlint automatically on
staged files.

All of the above (`pnpm lint`, `pnpm test:coverage`, `pnpm build`) run
automatically on every pull request via GitHub Actions (`.github/workflows/ci.yml`)
and must pass before a PR can be merged.

## Commit messages

This repo follows [Conventional Commits](https://www.conventionalcommits.org/):
`type(scope): summary`, e.g. `fix(auth): harden OpenID callback nonce
validation` or `feat(inventory): add sticker breakdown to item detail`. Common
types are `feat`, `fix`, `chore`, `docs`, and `refactor`.

## Security

Steam API keys, session secrets, and cron secrets are sensitive. Never log
them, never expose them to client JS, and keep all handling of them
server-side (see the "Environment variables" section of `CLAUDE.md`). If you
find a vulnerability, please follow [SECURITY.md](./SECURITY.md) instead of
opening a public issue.

## Pull requests

- Fill out the pull request template.
- Reference the issue your PR addresses (e.g. "Closes #123").
- Make sure `pnpm lint`, `pnpm test:coverage`, and `pnpm build` all pass.
- All changes go through issue → branch → PR → merge — never commit directly
  to `main`.
- Be patient and kind in review — this is a small, friendly project.

Not affiliated with Valve Corporation.
