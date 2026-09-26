CREATE TYPE "public"."discount_type" AS ENUM('percent', 'amount');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('CASH', 'TRANSFER', 'MARKETPLACE', 'KASBON');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('SETTLED', 'PENDING', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."sale_status" AS ENUM('COMPLETED', 'COMPLETED_WITH_KASBON', 'VOIDED');--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"user_id" uuid NOT NULL,
	"request_hash" text NOT NULL,
	"response" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_counters" (
	"id" uuid PRIMARY KEY NOT NULL,
	"date" text NOT NULL,
	"last_seq" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_counters_date_unique" UNIQUE("date")
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"sale_id" uuid,
	"kasbon_id" uuid,
	"method" "payment_method" NOT NULL,
	"amount" bigint NOT NULL,
	"bank_account_id" uuid,
	"reference" text,
	"status" "payment_status" DEFAULT 'SETTLED' NOT NULL,
	"provider_payload" jsonb,
	"archived_at" timestamp with time zone,
	"archive_batch_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_amount_positive" CHECK ("payments"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "sale_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"sale_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"name_snapshot" text NOT NULL,
	"variant_snapshot" text,
	"unit_price" bigint NOT NULL,
	"qty" integer NOT NULL,
	"discount_type" "discount_type",
	"discount_value" bigint,
	"discount_amount" bigint DEFAULT 0 NOT NULL,
	"line_total" bigint NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"archive_batch_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sale_items_qty_positive" CHECK ("sale_items"."qty" > 0)
);
--> statement-breakpoint
CREATE TABLE "sales" (
	"id" uuid PRIMARY KEY NOT NULL,
	"invoice_no" text NOT NULL,
	"shift_id" uuid NOT NULL,
	"cashier_id" uuid NOT NULL,
	"customer_id" uuid,
	"status" "sale_status" NOT NULL,
	"subtotal" bigint NOT NULL,
	"item_discount_total" bigint NOT NULL,
	"voucher_id" uuid,
	"voucher_discount" bigint DEFAULT 0 NOT NULL,
	"service_rate_bps" integer NOT NULL,
	"service_amount" bigint NOT NULL,
	"ppn_rate_bps" integer NOT NULL,
	"ppn_amount" bigint NOT NULL,
	"price_includes_tax" boolean NOT NULL,
	"grand_total" bigint NOT NULL,
	"paid_total" bigint NOT NULL,
	"idempotency_key" text NOT NULL,
	"archived_at" timestamp with time zone,
	"archive_batch_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shifts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"opening_cash" bigint NOT NULL,
	"closed_at" timestamp with time zone,
	"expected_cash" bigint,
	"counted_cash" bigint,
	"variance" bigint,
	"note" text,
	"archived_at" timestamp with time zone,
	"archive_batch_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shifts_opening_cash_non_negative" CHECK ("shifts"."opening_cash" >= 0)
);
--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_cashier_id_users_id_fk" FOREIGN KEY ("cashier_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_keys_user_key" ON "idempotency_keys" USING btree ("user_id","key");--> statement-breakpoint
CREATE INDEX "idempotency_keys_expires_at_idx" ON "idempotency_keys" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "payments_sale_id_idx" ON "payments" USING btree ("sale_id");--> statement-breakpoint
CREATE INDEX "payments_method_created_at_idx" ON "payments" USING btree ("method","created_at");--> statement-breakpoint
CREATE INDEX "sale_items_sale_id_idx" ON "sale_items" USING btree ("sale_id","sort_order");--> statement-breakpoint
CREATE INDEX "sale_items_variant_id_idx" ON "sale_items" USING btree ("variant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_invoice_no_key" ON "sales" USING btree ("invoice_no");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_cashier_idempotency_key" ON "sales" USING btree ("cashier_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "sales_shift_id_idx" ON "sales" USING btree ("shift_id");--> statement-breakpoint
CREATE INDEX "sales_created_at_idx" ON "sales" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "sales_status_created_at_idx" ON "sales" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "shifts_one_open_per_user_key" ON "shifts" USING btree ("user_id") WHERE "shifts"."closed_at" IS NULL;--> statement-breakpoint
CREATE INDEX "shifts_user_id_opened_at_idx" ON "shifts" USING btree ("user_id","opened_at");--> statement-breakpoint
CREATE INDEX "shifts_opened_at_idx" ON "shifts" USING btree ("opened_at");