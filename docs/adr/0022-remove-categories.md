# ADR-0022: Remove product categories in favour of brands

- Status: Accepted
- Date: 2026-09-28
- Requirements: PRD FR-PRD-01, FR-PRD-04, FR-CAT-02, FR-POS-01, FR-RPT-01; BRD BR-28, Q-11

## Context

Since products gained a brand (ADR-0021), the store no longer uses
categories. Users asked to remove them everywhere. Categories were
required on every product and drove the POS filter chips, a product-list
filter, the stock pages and the "by category" report.

## Decision

- **Data.** Migration `0019_drop_categories` drops `products.category_id`
  (with its foreign key and index) and the `categories` table. Existing
  category names are not kept, since nothing reads them any more.
- **Brand takes over.** The POS chips filter by brand, listing brands that
  have products. The report and its CSV group sales by the product's
  current brand; products without one share a "No brand" row. The stock
  pages show the brand where they showed the category.
- **Permission.** `category:manage` becomes `brand:manage`. The migration
  moves existing grants over, so roles that managed categories keep
  managing brands.
- **Audit history.** The `category.*` audit actions and the `category`
  entity stay in the registry with their labels, so earlier log entries
  still read correctly. Nothing writes them any more.

## Consequences

- Creating a product needs only a brand, motif and size; there is no
  category to set up first.
- Reports cannot show historical categories. Sales before this change are
  grouped by today's brand, like the product report groups by today's
  product.
