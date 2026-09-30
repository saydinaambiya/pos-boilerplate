# Architecture Decision Records

Each record captures one significant decision, its context and consequences,
following [Michael Nygard's format](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions).
Records are immutable once accepted; a new record supersedes an old one.

| ADR                                                    | Title                                              | Status          |
| ------------------------------------------------------ | -------------------------------------------------- | --------------- |
| [0001](./0001-stack-and-architecture.md)               | Stack and monolith architecture                    | Accepted        |
| [0002](./0002-http-query-method.md)                    | Serving HTTP QUERY from the proxy                  | Accepted        |
| [0003](./0003-theming-and-csp.md)                      | Theming without client script under CSP            | Accepted        |
| [0004](./0004-tag-based-release.md)                    | Tag-based release and deployment                   | Accepted        |
| [0005](./0005-database-access.md)                      | Database access, migrations and tests              | Accepted        |
| [0006](./0006-authentication-and-sessions.md)          | Authentication, sessions and authorization         | Accepted        |
| [0007](./0007-settings-storage.md)                     | Owner settings storage and caching                 | Accepted        |
| [0008](./0008-colour-variant-model.md)                 | Colour variant model and enabling variants         | Accepted        |
| [0009](./0009-sale-calculation.md)                     | Sale calculation, rounding and inclusive tax       | Accepted        |
| [0010](./0010-invoices-print-and-pdf.md)               | Invoice printing, PDF and signed download links    | Accepted        |
| [0011](./0011-generic-approvals.md)                    | Generic approval engine                            | Accepted        |
| [0012](./0012-store-credit.md)                         | Store credit, installments and the cash drawer     | Accepted        |
| [0013](./0013-online-orders.md)                        | Manual marketplace orders and their stock          | Accepted        |
| [0014](./0014-sales-reports.md)                        | Sales reports, cost snapshots and CSV export       | Amended by 0032 |
| [0015](./0015-housekeeping.md)                         | Monthly housekeeping by export and mark            | Amended by 0032 |
| [0016](./0016-database-capacity.md)                    | Database capacity monitoring                       | Accepted        |
| [0017](./0017-custom-form-controls.md)                 | Custom form controls after the v1.0 review         | Accepted        |
| [0018](./0018-dialogs-and-auto-filters.md)             | Dialogs instead of single-form pages; auto filters | Accepted        |
| [0019](./0019-devices-hours-and-loading.md)            | Device limit, store hours, buyer name and loading  | Accepted        |
| [0020](./0020-field-sales-consignments.md)             | Field sales consignments                           | Accepted        |
| [0021](./0021-product-details.md)                      | Product brand, motif and size                      | Amended by 0023 |
| [0022](./0022-remove-categories.md)                    | Remove product categories in favour of brands      | Accepted        |
| [0023](./0023-roll-stock.md)                           | Rolls cut into pieces                              | Accepted        |
| [0024](./0024-consignment-roles.md)                    | Store staff record salespeople's goods             | Accepted        |
| [0025](./0025-qris-and-marketplace-prices.md)          | QRIS payments and marketplace prices               | Accepted        |
| [0026](./0026-listed-motifs-colours-and-defects.md)    | Listed motifs and colours, and defect pieces       | Accepted        |
| [0027](./0027-sales-only-and-staff-expenses.md)        | Sales results only, and daily staff expenses       | Amended by 0032 |
| [0028](./0028-home-for-every-role.md)                  | A home page for every role                         | Accepted        |
| [0029](./0029-sales-without-the-cashier.md)            | Salespeople keep a shift but not the cashier       | Amended by 0033 |
| [0030](./0030-devices-in-a-modal.md)                   | Devices list in a modal over the current page      | Accepted        |
| [0031](./0031-functions-next-to-the-database.md)       | Run functions in the database's region             | Accepted        |
| [0032](./0032-money-recap-and-atm-deposits.md)         | Money recap and ATM deposits                       | Accepted        |
| [0033](./0033-sales-split-payment-and-store-credit.md) | Split payments and store credit for salespeople    | Accepted        |
