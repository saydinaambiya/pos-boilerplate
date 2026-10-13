ALTER TABLE "sale_items" ADD COLUMN "brand_snapshot" text;--> statement-breakpoint
UPDATE "sale_items" SET "brand_snapshot" = "brands"."name"
FROM "product_variants", "products", "brands"
WHERE "product_variants"."id" = "sale_items"."variant_id"
  AND "products"."id" = "product_variants"."product_id"
  AND "brands"."id" = "products"."brand_id"
  AND ("sale_items"."details_snapshot" = "brands"."name"
    OR "sale_items"."details_snapshot" LIKE replace(replace(replace("brands"."name", '\', '\\'), '%', '\%'), '_', '\_') || ' · %');
