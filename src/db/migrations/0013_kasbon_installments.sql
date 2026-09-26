ALTER TABLE "payments" ADD COLUMN "installment_id" uuid;--> statement-breakpoint
CREATE INDEX "payments_installment_id_idx" ON "payments" USING btree ("installment_id");--> statement-breakpoint
UPDATE "payments" SET "installment_id" = "id" WHERE "kasbon_id" IS NOT NULL;
