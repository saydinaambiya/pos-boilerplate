ALTER TABLE "products" DROP CONSTRAINT "products_category_id_categories_id_fk";--> statement-breakpoint
DROP INDEX "products_category_id_idx";--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "category_id";--> statement-breakpoint
DROP TABLE "categories";--> statement-breakpoint
DELETE FROM "role_permissions" AS "old" WHERE "old"."permission" = 'category:manage' AND EXISTS (SELECT 1 FROM "role_permissions" AS "kept" WHERE "kept"."role_id" = "old"."role_id" AND "kept"."permission" = 'brand:manage');--> statement-breakpoint
UPDATE "role_permissions" SET "permission" = 'brand:manage' WHERE "permission" = 'category:manage';
