CREATE TYPE "public"."kasbon_status" AS ENUM('OPEN', 'PARTIALLY_PAID', 'SETTLED');--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kasbons" (
	"id" uuid PRIMARY KEY NOT NULL,
	"sale_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"total" bigint NOT NULL,
	"paid_total" bigint DEFAULT 0 NOT NULL,
	"balance" bigint NOT NULL,
	"due_date" date,
	"status" "kasbon_status" DEFAULT 'OPEN' NOT NULL,
	"archived_at" timestamp with time zone,
	"archive_batch_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kasbons_amounts_consistent" CHECK ("kasbons"."balance" = "kasbons"."total" - "kasbons"."paid_total" AND "kasbons"."balance" >= 0)
);
--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "shift_id" uuid;--> statement-breakpoint
ALTER TABLE "kasbons" ADD CONSTRAINT "kasbons_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kasbons" ADD CONSTRAINT "kasbons_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "customers_phone_key" ON "customers" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "customers_name_idx" ON "customers" USING btree (lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "kasbons_sale_id_key" ON "kasbons" USING btree ("sale_id");--> statement-breakpoint
CREATE INDEX "kasbons_customer_id_idx" ON "kasbons" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "kasbons_status_created_at_idx" ON "kasbons" USING btree ("status","created_at");--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_kasbon_id_kasbons_id_fk" FOREIGN KEY ("kasbon_id") REFERENCES "public"."kasbons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payments_kasbon_id_idx" ON "payments" USING btree ("kasbon_id");--> statement-breakpoint
CREATE INDEX "payments_shift_id_idx" ON "payments" USING btree ("shift_id");