ALTER TABLE "shifts" ADD COLUMN "opening_note" text;--> statement-breakpoint
ALTER TABLE "shifts" ADD COLUMN "closed_by" uuid;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;