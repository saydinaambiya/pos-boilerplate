# ADR-0011: Generic approval engine

- Status: Accepted
- Date: 2026-09-26
- Requirements: PRD §3.10, FR-APR-01..05, FR-POS-09, FR-VCH-02..04, FR-KSB-03/04, BR-10, BR-12, BR-13, BR-21

## Context

Voids, vouchers and store-credit payments all need "request → decide"
with the same rules: per-type decide permissions, no self-approval, the
Owner's own requests approved immediately, withdrawal while pending, and no
double decisions.

## Decision

- One `approvals` table: type, target, a JSON snapshot of the request,
  requester, status (`PENDING → APPROVED | REJECTED | CANCELLED`), decider,
  time, note and an integer `version`. A partial unique index allows only
  one pending request per type and target.
- `engine.ts` files requests inside the caller's transaction and knows no
  domain. Each domain passes its own `apply` function, which runs in the
  same transaction when the request is approved (immediately for the Owner).
  `registry.ts` maps types to apply functions for later decisions, so the
  dependency direction stays domain → engine and registry → domain, never a
  cycle.
- Decisions update `WHERE id = ? AND status = 'PENDING' AND version = ?` and
  bump the version: concurrent approvers get "stale" instead of applying
  twice. If the target changed meanwhile, `apply` raises `ApprovalConflict`
  and the whole decision rolls back.
- Decide permissions are separate per type (`approval.void:decide`,
  `approval.voucher:decide`, `approval.kasbon:decide`); requesters never see
  their own requests in the inbox and are refused if they try to decide
  them.
- Pending counts for the viewer's decidable types feed a navigation badge
  and a dashboard card.

## Consequences

- New request types add an enum value, a decide permission, an apply
  function and a registry entry; the inbox and rules come for free.
- Requests show the snapshot taken at request time, so approvers decide on
  exactly what was asked even if the target changes later.
