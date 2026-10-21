# ADR-0052: Online orders by the meter, old store credit entered by hand

- Status: Accepted
- Date: 2026-10-21
- Requirements: PRD FR-ONL-10, FR-KSB-08; BRD Q-58, Q-59
- Amends: [ADR-0046](./0046-rolls-carried-by-the-meter.md) (marketplace
  orders took pieces only), [ADR-0012](./0012-store-credit.md) (every
  store credit came from a sale)

## Context

The cashier sells a roll by the meter as a custom cut (FR-ROL-04), and
salespeople carry rolls by the meter (ADR-0046). Marketplace orders could
only take whole pieces, but customers also buy rolls by the meter online.

Store credit could only start at checkout. The store kept older credit in a
paper book before it used the app. Those balances could not be collected
through the app.

## Decision

### Rolls by the meter on online orders

- **The roll is offered in the search.** Next to its pieces, each colour's
  roll shows as "Meteran" with its price per meter and the length left. Goods
  sold by the kg still stay at the POS (ADR-0045).
- **Length and price per meter.** A roll line takes a length in meters
  ("2,5") and the marketplace price per meter. The user chose price per
  meter, like at the cashier. The store price per meter shows beside it.
- **Stored like a POS cut.** `online_order_items.length_cm` holds the
  length, per unit of `qty` (always 1 from the form). `unit_price`,
  `store_price` and `unit_cost` are for that length, priced with `cutPrice`.
  Reports keep summing `unit_cost × qty`.
- **Stock in cm.** Saving takes `qty × length_cm` off the roll under the
  normal stock rules. Cancelling or a return puts it back. A damaged return
  writes it off. A short roll is reported in meters.

### Old store credit entered by hand

- **No sale.** `kasbons.sale_id` becomes nullable. A credit entered by hand
  stores `opened_on` (the store date it was given), an optional `reference`
  (old note number), an optional `description` and `created_by`. A check
  requires either a sale or `opened_on` + `created_by`.
- **Amount still owed.** The form asks for what is still unpaid, not the
  original total. Earlier payments stay in the paper book.
- **Ages from its own date.** Aging, the list order and the dashboard
  buckets use `opened_on` when it is set. It cannot be in the future. A due
  date cannot be before it.
- **Paid like any other.** Installments follow FR-KSB-03..05. Cash
  installments count in the shift's expected cash.
- **Not a sale.** It adds nothing to sales, the shift's credit given or the
  report's credit given, which all join through the sale.
- **New permission `kasbon:record-old`.** Entering credit without a sale
  creates a receivable without goods leaving through the app. The user chose
  a separate permission. Only the Owner holds it by default.
- **Shown as "Kas bon lama".** The list and detail show the old note number
  in the invoice column, or "Kas bon lama", and link to no sale. The detail
  shows the credit date, the description and who entered it.
- **Dialog over the list.** "Tambah kas bon lama" on `/kasbon` opens a
  dialog (`?new=1`, ADR-0018) and goes to the new credit after saving.

## Consequences

- Migration `0040` adds the nullable columns and checks. Existing rows keep
  their sale and are unchanged.
- Housekeeping archives store credit through its sale (FR-HK-05). Credit
  entered by hand stays live, even when settled.
- An approval request for a credit without a reference shows "—" as its
  invoice number.
