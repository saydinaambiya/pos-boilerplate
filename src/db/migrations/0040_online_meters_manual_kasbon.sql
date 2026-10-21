ALTER TABLE "kasbons" ALTER COLUMN "sale_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "kasbons" ADD COLUMN "opened_on" date;--> statement-breakpoint
ALTER TABLE "kasbons" ADD COLUMN "reference" text;--> statement-breakpoint
ALTER TABLE "kasbons" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "kasbons" ADD COLUMN "created_by" uuid;--> statement-breakpoint
ALTER TABLE "online_order_items" ADD COLUMN "length_cm" integer;--> statement-breakpoint
ALTER TABLE "kasbons" ADD CONSTRAINT "kasbons_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kasbons" ADD CONSTRAINT "kasbons_sale_or_manual" CHECK ("kasbons"."sale_id" IS NOT NULL OR ("kasbons"."opened_on" IS NOT NULL AND "kasbons"."created_by" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "online_order_items" ADD CONSTRAINT "online_order_items_length_positive" CHECK ("online_order_items"."length_cm" IS NULL OR "online_order_items"."length_cm" > 0);