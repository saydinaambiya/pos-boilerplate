CREATE TYPE "public"."purchase_pay_method" AS ENUM('CASH', 'TRANSFER');--> statement-breakpoint
CREATE TYPE "public"."purchase_status" AS ENUM('OPEN', 'PARTIALLY_PAID', 'SETTLED');--> statement-breakpoint
CREATE TABLE "purchase_payments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"purchase_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"paid_on" date NOT NULL,
	"method" "purchase_pay_method" NOT NULL,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_payments_amount_positive" CHECK ("purchase_payments"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "purchases" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_name" text NOT NULL,
	"invoice_no" text NOT NULL,
	"total" bigint NOT NULL,
	"paid_total" bigint DEFAULT 0 NOT NULL,
	"balance" bigint NOT NULL,
	"status" "purchase_status" DEFAULT 'OPEN' NOT NULL,
	"order_date" date NOT NULL,
	"due_date" date,
	"note" text,
	"created_by" uuid,
	"archived_at" timestamp with time zone,
	"archive_batch_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchases_amounts_consistent" CHECK ("purchases"."balance" = "purchases"."total" - "purchases"."paid_total" AND "purchases"."balance" >= 0),
	CONSTRAINT "purchases_due_after_order" CHECK ("purchases"."due_date" IS NULL OR "purchases"."due_date" >= "purchases"."order_date")
);
--> statement-breakpoint
ALTER TABLE "purchase_payments" ADD CONSTRAINT "purchase_payments_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_payments" ADD CONSTRAINT "purchase_payments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "purchase_payments_purchase_id_idx" ON "purchase_payments" USING btree ("purchase_id","paid_on");--> statement-breakpoint
CREATE UNIQUE INDEX "purchases_company_invoice_key" ON "purchases" USING btree (lower("company_name"),"invoice_no");--> statement-breakpoint
CREATE INDEX "purchases_status_order_date_idx" ON "purchases" USING btree ("status","order_date");--> statement-breakpoint
CREATE INDEX "purchases_due_date_idx" ON "purchases" USING btree ("due_date");