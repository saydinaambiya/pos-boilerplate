CREATE TYPE "public"."product_category" AS ENUM('MAIN', 'ACCESSORY');--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "category" "product_category" DEFAULT 'MAIN' NOT NULL;--> statement-breakpoint
ALTER TABLE "sale_items" ADD COLUMN "weight_g" integer;--> statement-breakpoint
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_weight_positive" CHECK ("sale_items"."weight_g" IS NULL OR "sale_items"."weight_g" > 0);