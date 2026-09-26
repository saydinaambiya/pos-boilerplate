# Contributing

## Workflow

1. Branch from `main` (`feat/…`, `fix/…`).
2. Keep `pnpm check` and `pnpm test:e2e` green.
3. Open a pull request; CI must pass before merge.

## Commits

- [Conventional Commits](https://www.conventionalcommits.org/) are enforced by
  commitlint (`feat:`, `fix:`, `refactor:`, `docs:`, `chore:` …). The type
  drives the next semantic version and the CHANGELOG entry.
- Reference requirement ids where relevant, e.g. `feat(pos): split payment (FR-PAY-02)`.
- **Do not add AI agents as co-authors** (`Co-authored-by:` trailers naming an
  AI tool are rejected by the `no-ai-coauthor` commitlint rule).

## Code standards

- TypeScript strict; no `any`, no non-null assertions.
- Validate every external input with a `.strict()` Zod schema.
- Server Components by default; add `"use client"` only for interactive leaves.
- Colors come from semantic tokens only; user-facing text comes from
  `src/messages/*.json` (both enforced by lint).
- Comments document intent, references and decisions (TSDoc, ADR/requirement
  links). Avoid line comments that restate the code.
- Record significant decisions as a new ADR in `docs/adr/`.
