ALTER TYPE "public"."stock_movement_type" ADD VALUE 'CUT';--> statement-breakpoint
DROP INDEX "product_variants_color_name_key";--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN "parent_id" uuid;--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN "size" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "thickness" numeric(6, 2);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "is_roll" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "size_prices" jsonb;--> statement-breakpoint
ALTER TABLE "sale_items" ADD COLUMN "length_cm" integer;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_parent_id_product_variants_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."product_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "product_variants_piece_size_key" ON "product_variants" USING btree ("parent_id","size") WHERE "product_variants"."parent_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "product_variants_color_name_key" ON "product_variants" USING btree ("product_id",lower("attributes" -> 'color' ->> 'name')) WHERE "product_variants"."parent_id" IS NULL;--> statement-breakpoint
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_length_positive" CHECK ("sale_items"."length_cm" IS NULL OR "sale_items"."length_cm" > 0);--> statement-breakpoint
INSERT INTO "role_permissions" ("id", "role_id", "permission") SELECT gen_random_uuid(), "role_id", 'consignment:sell' FROM "role_permissions" WHERE "permission" = 'consignment:take' ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "role_permissions" ("id", "role_id", "permission") SELECT gen_random_uuid(), "role_id", 'pos:after-hours' FROM "role_permissions" WHERE "permission" = 'consignment:take' ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "role_permissions" ("id", "role_id", "permission") SELECT gen_random_uuid(), "role_id", 'consignment:pickup' FROM "role_permissions" WHERE "permission" = 'consignment:manage' ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "role_permissions" ("id", "role_id", "permission") SELECT gen_random_uuid(), "role_id", 'consignment:return' FROM "role_permissions" WHERE "permission" = 'consignment:manage' ON CONFLICT DO NOTHING;--> statement-breakpoint
DELETE FROM "role_permissions" WHERE "permission" IN ('consignment:take', 'consignment:manage');--> statement-breakpoint
INSERT INTO "role_permissions" ("id", "role_id", "permission") SELECT gen_random_uuid(), "role_id", 'page:cutting' FROM "role_permissions" WHERE "permission" = 'stock:adjust' ON CONFLICT DO NOTHING;--> statement-breakpoint
CREATE TEMPORARY TABLE "roll_sizes" ("size" text PRIMARY KEY, "usage_cm" integer NOT NULL, "sort_order" integer NOT NULL);--> statement-breakpoint
INSERT INTO "roll_sizes" VALUES ('93x47', 47, 0), ('100x70', 50, 1), ('50x140', 50, 2), ('100x140', 100, 3);--> statement-breakpoint
UPDATE "product_variants" SET "size" = "products"."size" FROM "products" WHERE "products"."id" = "product_variants"."product_id" AND "products"."size" IS NOT NULL AND NOT "products"."track_stock";--> statement-breakpoint
UPDATE "products" SET "is_roll" = true, "price" = round("products"."price" * 100.0 / "own"."usage_cm"), "cost" = round("products"."cost" * 100.0 / "own"."usage_cm"), "size_prices" = (SELECT jsonb_object_agg("other"."size", CASE WHEN "other"."size" = "products"."size" THEN "products"."price" ELSE round("products"."price" * "other"."usage_cm"::numeric / "own"."usage_cm") END) FROM "roll_sizes" AS "other") FROM "roll_sizes" AS "own" WHERE "own"."size" = "products"."size" AND "products"."track_stock";--> statement-breakpoint
CREATE TEMPORARY TABLE "legacy_rolls" AS SELECT "product_variants"."id" AS "piece_id", gen_random_uuid() AS "roll_id", "product_variants"."product_id", "product_variants"."sku", "product_variants"."attributes", "product_variants"."sort_order", "product_variants"."is_default", "product_variants"."is_active", "products"."size" FROM "product_variants" INNER JOIN "products" ON "products"."id" = "product_variants"."product_id" WHERE "products"."is_roll" AND "product_variants"."parent_id" IS NULL;--> statement-breakpoint
UPDATE "product_variants" SET "sku" = "legacy_rolls"."sku" || '-' || "legacy_rolls"."size", "size" = "legacy_rolls"."size", "is_default" = false, "sort_order" = "roll_sizes"."sort_order" FROM "legacy_rolls" INNER JOIN "roll_sizes" ON "roll_sizes"."size" = "legacy_rolls"."size" WHERE "product_variants"."id" = "legacy_rolls"."piece_id";--> statement-breakpoint
INSERT INTO "product_variants" ("id", "product_id", "sku", "attributes", "sort_order", "is_default", "is_active") SELECT "roll_id", "product_id", "sku", '{}'::jsonb, "sort_order", "is_default", "is_active" FROM "legacy_rolls";--> statement-breakpoint
UPDATE "product_variants" SET "parent_id" = "legacy_rolls"."roll_id" FROM "legacy_rolls" WHERE "product_variants"."id" = "legacy_rolls"."piece_id";--> statement-breakpoint
UPDATE "product_variants" SET "attributes" = "legacy_rolls"."attributes" FROM "legacy_rolls" WHERE "product_variants"."id" = "legacy_rolls"."roll_id";--> statement-breakpoint
INSERT INTO "product_variants" ("id", "product_id", "parent_id", "size", "sku", "attributes", "sort_order", "is_active") SELECT gen_random_uuid(), "legacy_rolls"."product_id", "legacy_rolls"."roll_id", "roll_sizes"."size", "legacy_rolls"."sku" || '-' || "roll_sizes"."size", "legacy_rolls"."attributes", "roll_sizes"."sort_order", "legacy_rolls"."is_active" FROM "legacy_rolls" CROSS JOIN "roll_sizes" WHERE "roll_sizes"."size" <> "legacy_rolls"."size";--> statement-breakpoint
DROP TABLE "legacy_rolls";--> statement-breakpoint
DROP TABLE "roll_sizes";
