ALTER TABLE "shifts" ADD COLUMN "handover_to_shift_id" uuid;--> statement-breakpoint
ALTER TABLE "shifts" ADD COLUMN "handover_after_close" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_handover_to_shift_id_shifts_id_fk" FOREIGN KEY ("handover_to_shift_id") REFERENCES "public"."shifts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shifts_handover_to_shift_id_idx" ON "shifts" USING btree ("handover_to_shift_id");