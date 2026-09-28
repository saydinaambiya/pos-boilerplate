CREATE TYPE "public"."consignment_batch_kind" AS ENUM('TAKE', 'SETTLE');--> statement-breakpoint
CREATE TYPE "public"."consignment_item_kind" AS ENUM('TAKE', 'SOLD', 'RETURN');--> statement-breakpoint
CREATE TYPE "public"."consignment_status" AS ENUM('OPEN', 'CLOSED');--> statement-breakpoint
ALTER TYPE "public"."stock_movement_type" ADD VALUE 'CONSIGNMENT_OUT';--> statement-breakpoint
ALTER TYPE "public"."stock_movement_type" ADD VALUE 'CONSIGNMENT_RETURN';--> statement-breakpoint
CREATE TABLE "consignment_batches" (
	"id" uuid PRIMARY KEY NOT NULL,
	"consignment_id" uuid NOT NULL,
	"kind" "consignment_batch_kind" NOT NULL,
	"actor_id" uuid NOT NULL,
	"sale_id" uuid,
	"idempotency_key" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consignment_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"batch_id" uuid NOT NULL,
	"consignment_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"kind" "consignment_item_kind" NOT NULL,
	"qty" integer NOT NULL,
	"name_snapshot" text NOT NULL,
	"variant_snapshot" text,
	"unit_price" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "consignment_items_qty_positive" CHECK ("consignment_items"."qty" > 0)
);
--> statement-breakpoint
CREATE TABLE "consignments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"salesperson_id" uuid NOT NULL,
	"status" "consignment_status" DEFAULT 'OPEN' NOT NULL,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "consignment_id" uuid;--> statement-breakpoint
ALTER TABLE "consignment_batches" ADD CONSTRAINT "consignment_batches_consignment_id_consignments_id_fk" FOREIGN KEY ("consignment_id") REFERENCES "public"."consignments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consignment_batches" ADD CONSTRAINT "consignment_batches_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consignment_batches" ADD CONSTRAINT "consignment_batches_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consignment_items" ADD CONSTRAINT "consignment_items_batch_id_consignment_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."consignment_batches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consignment_items" ADD CONSTRAINT "consignment_items_consignment_id_consignments_id_fk" FOREIGN KEY ("consignment_id") REFERENCES "public"."consignments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consignment_items" ADD CONSTRAINT "consignment_items_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consignments" ADD CONSTRAINT "consignments_salesperson_id_users_id_fk" FOREIGN KEY ("salesperson_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "consignment_batches_actor_idempotency_key" ON "consignment_batches" USING btree ("actor_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "consignment_batches_consignment_id_idx" ON "consignment_batches" USING btree ("consignment_id","created_at");--> statement-breakpoint
CREATE INDEX "consignment_items_consignment_id_idx" ON "consignment_items" USING btree ("consignment_id","variant_id");--> statement-breakpoint
CREATE INDEX "consignment_items_batch_id_idx" ON "consignment_items" USING btree ("batch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "consignments_one_open_per_salesperson_key" ON "consignments" USING btree ("salesperson_id") WHERE "consignments"."status" = 'OPEN';--> statement-breakpoint
CREATE INDEX "consignments_status_updated_at_idx" ON "consignments" USING btree ("status","updated_at");--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_consignment_id_consignments_id_fk" FOREIGN KEY ("consignment_id") REFERENCES "public"."consignments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sales_consignment_id_idx" ON "sales" USING btree ("consignment_id");