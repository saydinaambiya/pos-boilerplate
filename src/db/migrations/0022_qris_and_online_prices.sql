ALTER TYPE "public"."payment_method" ADD VALUE 'QRIS';--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD COLUMN "is_qris" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "source_bank" text;--> statement-breakpoint
ALTER TABLE "online_order_items" ADD COLUMN "store_price" bigint;--> statement-breakpoint
CREATE UNIQUE INDEX "bank_accounts_one_qris_key" ON "bank_accounts" USING btree ("is_qris") WHERE "bank_accounts"."is_qris";