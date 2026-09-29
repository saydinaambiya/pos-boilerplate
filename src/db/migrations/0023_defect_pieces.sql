DROP INDEX "product_variants_piece_size_key";--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN "is_defect" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "defect_size_prices" jsonb;--> statement-breakpoint
CREATE UNIQUE INDEX "product_variants_piece_size_key" ON "product_variants" USING btree ("parent_id","size","is_defect") WHERE "product_variants"."parent_id" IS NOT NULL;