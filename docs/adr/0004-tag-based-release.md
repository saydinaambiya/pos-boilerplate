# ADR-0004: Tag-based release and deployment

- Status: Accepted
- Date: 2026-09-25
- Requirements: PRD §12

## Decision

- Vercel's Git integration is disabled (`vercel.json`), so branch pushes never
  deploy.
- release-please maintains a Release PR on `main`; merging it bumps
  `package.json`, updates `CHANGELOG.md` and creates the `vX.Y.Z` tag.
- `.github/workflows/deploy.yml` deploys tags: `vX.Y.Z` to production and
  `vX.Y.Z-rc.N` to preview/staging. It re-runs CI on the tagged commit and
  refuses tags that do not match `package.json`.
- Because tags created with `GITHUB_TOKEN` do not trigger workflows, the
  release workflow calls the deploy workflow directly. Tags pushed manually
  trigger it through `on.push.tags`.
- Rollback means redeploying the previous tag. Database migrations follow
  expand–contract so that an older tag keeps working (added in Milestone 1).

## Required repository setup

Secrets: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`.
Environments: `staging`, `production` (add required reviewers to production).
