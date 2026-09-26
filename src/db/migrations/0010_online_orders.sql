CREATE TYPE "public"."complaint_resolution" AS ENUM('REFUND', 'RESEND', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."online_order_status" AS ENUM('PROCESSING', 'IN_TRANSIT', 'DELIVERED', 'COMPLETED', 'CANCELLED', 'COMPLAINT', 'RETURN_REQUESTED', 'RETURNED');--> statement-breakpoint
CREATE TYPE "public"."return_condition" AS ENUM('GOOD', 'DAMAGED');--> statement-breakpoint
CREATE TABLE "online_order_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"from_status" "online_order_status",
	"to_status" "online_order_status" NOT NULL,
	"note" text,
	"actor_id" uuid NOT NULL,
	"archived_at" timestamp with time zone,
	"archive_batch_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "online_order_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"name_snapshot" text NOT NULL,
	"variant_snapshot" text,
	"qty" integer NOT NULL,
	"unit_price" bigint NOT NULL,
	"line_total" bigint NOT NULL,
	"return_condition" "return_condition",
	"sort_order" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"archive_batch_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "online_order_items_qty_positive" CHECK ("online_order_items"."qty" > 0)
);
--> statement-breakpoint
CREATE TABLE "online_orders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"marketplace_id" uuid NOT NULL,
	"order_code" text NOT NULL,
	"status" "online_order_status" DEFAULT 'PROCESSING' NOT NULL,
	"items_total" bigint NOT NULL,
	"shipping_fee" bigint DEFAULT 0 NOT NULL,
	"note" text,
	"complaint_note" text,
	"resolution" "complaint_resolution",
	"status_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"archived_at" timestamp with time zone,
	"archive_batch_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "online_orders_shipping_fee_non_negative" CHECK ("online_orders"."shipping_fee" >= 0)
);
--> statement-breakpoint
ALTER TABLE "online_order_events" ADD CONSTRAINT "online_order_events_order_id_online_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."online_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "online_order_events" ADD CONSTRAINT "online_order_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "online_order_items" ADD CONSTRAINT "online_order_items_order_id_online_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."online_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "online_order_items" ADD CONSTRAINT "online_order_items_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "online_orders" ADD CONSTRAINT "online_orders_marketplace_id_marketplaces_id_fk" FOREIGN KEY ("marketplace_id") REFERENCES "public"."marketplaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "online_orders" ADD CONSTRAINT "online_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "online_order_events_order_id_idx" ON "online_order_events" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE INDEX "online_order_items_order_id_idx" ON "online_order_items" USING btree ("order_id","sort_order");--> statement-breakpoint
CREATE INDEX "online_order_items_variant_id_idx" ON "online_order_items" USING btree ("variant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "online_orders_marketplace_code_key" ON "online_orders" USING btree ("marketplace_id",upper("order_code"));--> statement-breakpoint
CREATE INDEX "online_orders_status_changed_at_idx" ON "online_orders" USING btree ("status","status_changed_at");--> statement-breakpoint
CREATE INDEX "online_orders_created_at_idx" ON "online_orders" USING btree ("created_at");