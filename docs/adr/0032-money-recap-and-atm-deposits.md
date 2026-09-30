# ADR-0032: Money recap and ATM deposits

- Status: Accepted
- Date: 2026-09-30
- Requirements: PRD FR-SHF-02/03, FR-RPT-06..08, FR-EXP-02, FR-HK-01; BRD BR-18, Q-32..Q-37
- Amends: [ADR-0014](./0014-sales-reports.md) (recap layout), [ADR-0015](./0015-housekeeping.md) (retention minimum), [ADR-0027](./0027-sales-only-and-staff-expenses.md) (recap balance)

## Context

The owner reads the recap to see how much money came in on a day or in a
month, and where it went: into a bank account (transfer, QRIS) or into the
cash drawer. Cash is later paid in at an ATM, which sometimes rejects
notes, so part of the cash stays behind. The old recap listed a dozen
sales tables for a date range. It did not tell cash from bank money and
had no record of deposits. Only admins should read the recap.

## Decision

- **One day or one month.** `/reports?day=YYYY-MM-DD` or
  `?month=YYYY-MM`, today by default. A Daily/Monthly switch, previous and
  next links, a date picker or a month dropdown replace the date range and
  presets. A future day or month falls back to the current one, and a
  month stops at today.
- **One drawer, carried over.** The store has one cash drawer. A shift
  opened by someone with the cashier (`page:pos`) is a `DRAWER` shift;
  one opened by a salesperson without it is a `SALES` shift, whose cash
  is recorded in the Sales menu and never enters the drawer.
  - A new drawer shift starts with the leftover of the last closed drawer
    shift (`carried_cash`, `carried_from_shift_id`): its counted cash less
    deposits taken after it closed. The cashier still enters a float,
    which is added on top. Each shift is carried once (unique index), and
    the open form shows the amount.
  - Expected cash is the leftover plus the float, cash sales and cash
    store credit installments, less expenses and deposits taken while the
    shift was open.
  - Opening, closing and depositing take a transaction-scoped advisory
    lock on the drawer, so a deposit never lands on a shift that is
    closing.
  - Shifts from before this change have no kind. They carry nothing over
    and stay out of the drawer balance, which would otherwise count every
    cash total ever counted as still in the drawer. Migration 0027 gives
    the shifts open at deployment their kind.
- **Money in** is the settled payments of non-voided sales by sale time,
  cash store credit installments when they were taken (as the shift counts
  them), and transfer or QRIS installments once approved:
  - To bank accounts: transfer and QRIS, also listed per account.
  - To the drawer: cash taken at the cashier.
  - Salespeople's cash gets a line of its own and counts in the total.
  - Marketplace orders get their own line. They are paid out by the
    marketplace, so they are not part of the total.
- **The drawer balance is the physical cash.** It is the balance before
  the period, plus the float added, cash in and the count variance at
  close, minus staff expenses and ATM deposits, for drawer shifts only. It
  equals what the next drawer shift carries over. The balance before the
  period is computed from all earlier rows, so it needs no stored running
  total. A month adds one row per day with activity, and each row links
  to that day.
- **Deposits** (`cash_deposits`) hold the store day, the bank account, the
  amount the ATM accepted, a note, the recorder and the drawer shift the
  cash left: the open one (the longest open if several), or else the last
  closed one if no later shift carried it yet. Whether it was taken after its shift
  closed is stored as `after_close` under the drawer lock, never inferred
  from timestamps: the app and the database keep different clocks, and a
  deposit may wait on the lock while the shift closes. Rejected notes are not
  recorded: they stay in the drawer. Recording needs `cash:deposit` and an
  active account, and the day cannot be in the future.
- **Corrections keep a history.** Cancelling and recording again would
  look like two deposits, so a wrong deposit is edited in place (date,
  account, amount, note) with a required reason. Cancelling stays for a
  deposit that never happened, also with a reason. Each change adds a
  `cash_deposit_revisions` row (kind, before, after, reason, actor, time),
  shown as the deposit's history, and an audit entry. Once the deposit is
  settled (its shift closed while it counted, or a later shift carried the
  leftover it lowered), its amount is final: it cannot be changed or
  cancelled, while the date, account and note still can.
- **Simple first.** Only the money-in and drawer cards show at first. The
  sales totals and the tables per method, expense kind, product, variant,
  brand, employee, voucher and tax fold under "More details", with their
  CSV files. The per-day sales table is gone from the page but stays in
  the CSV.
- **Access.** `page:reports`, `report:view` and `cash:deposit` go to the
  Owner and the seeded Admin role. Migration 0026 grants them to an
  existing role named Admin, since CI never runs `db:seed`.
- **Menu.** Pengeluaran moves directly under Kasir.
- **Housekeeping** may archive a month once it ended at least one month
  ago. The setting's minimum drops from 3 to 1.

## Consequences

- The first drawer shift after deployment carries nothing over, since
  older shifts have no kind; the cashier enters the whole drawer as float.
- Two drawer shifts open at once share one drawer, so only the first to
  open after a close carries its leftover, and deposits come off the
  longest open one. The existing warning about other open shifts stays.
- A voided sale or a late-approved installment changes the balance of
  every later day, because the balance is recomputed on each view.
- The per-day query scans the period, and the balance before it adds three
  sums over all earlier rows. Housekeeping never deletes rows, so the
  earlier sums keep counting archived months.
- Cancelling a deposit returns its success message through the shared
  result dialog. The action does not revalidate, because that would swap
  the row before the dialog opens; `ConfirmAction` refreshes the page.
