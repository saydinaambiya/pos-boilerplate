# ADR-0041: Thickness sort and filter, product deletion, ten brands a page

- Status: Accepted
- Date: 2026-10-02
- Requirements: PRD FR-PRD-03, FR-PRD-04, FR-STK-08, FR-ROL-03; BRD Q-47
- Amends: [ADR-0038](./0038-grouped-product-and-stock-lists.md) and [ADR-0040](./0040-brand-first-stock-and-cutting-lists.md) (paging), FR-PRD-03 (products were only deactivated)

## Context

After release 1.6, users asked for three changes. They want to sort and
filter the product and stock lists by thickness. They want to delete a
product, not deactivate it. And the lists paged by 50 rows. With brands
closed, the first page showed only three brand rows, and the fourth brand
was already on the next page.

## Decision

- **Thickness.** The product and stock lists get a "Ketebalan" filter. It
  lists the thicknesses that products which are not deleted use,
  thinnest first. They also get an "Urutkan" select: product name (the
  default), thin to thick, or thick to thin. Sorting applies inside each
  brand, so the brand grouping stays. Products without a thickness come
  last. The stock list gets a thickness column. The filter opens the
  groups like any other filter; the sort alone does not.
- **Delete instead of deactivate.** The product page's status card becomes
  a delete card, with a confirm dialog. The product list loses its status
  filter and status column. Sales, stock movements, consignments and
  online orders still point to the product's variants, so deleting does
  not remove rows. It sets `products.deleted_at`, makes the product and
  its variants inactive, and appends `~` plus the end of each variant's id
  to their SKUs, so the SKU can be used again. Every list, the POS and the
  product page skip deleted products. Old receipts keep the names they
  stored when the sale was made. A deleted product does not count for
  "brand in use"; deleting the brand first clears it from deleted
  products. The audit action is `product.deleted`. The migration treats
  products that were already inactive as deleted.
- **Ten brands a page.** Products, stock and Cut Rolls (which had no
  paging, only a limit of 100 rows) page by brand. A page holds ten brands
  and all their rows. One query picks the page's brands, a second loads
  their rows. A brand never spans two pages.
- **After a delete** the dialog leads back to the product list. The action
  revalidates nothing, since that would render the open product page as a
  404 before the dialog closes. The list renders fresh on the way back.

## Consequences

- A deleted product cannot be restored from the UI.
- A brand with many products makes a long page, since paging no longer
  caps rows.
- Inactive products from before this change disappear from the product
  list.
