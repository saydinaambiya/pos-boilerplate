ALTER TABLE "sale_items" ADD COLUMN "unit_cost" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "online_order_items" ADD COLUMN "unit_cost" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "sale_items" AS si SET "unit_cost" = coalesce(pv."cost_override", p."cost") FROM "product_variants" pv JOIN "products" p ON p."id" = pv."product_id" WHERE pv."id" = si."variant_id";--> statement-breakpoint
UPDATE "online_order_items" AS oi SET "unit_cost" = coalesce(pv."cost_override", p."cost") FROM "product_variants" pv JOIN "products" p ON p."id" = pv."product_id" WHERE pv."id" = oi."variant_id";
