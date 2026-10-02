ALTER TABLE "products" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
UPDATE "products" SET "deleted_at" = "updated_at" WHERE "is_active" = false;--> statement-breakpoint
UPDATE "product_variants" SET "sku" = "sku" || '~' || right("id"::text, 12), "is_active" = false
WHERE "product_id" IN (SELECT "id" FROM "products" WHERE "deleted_at" IS NOT NULL);
