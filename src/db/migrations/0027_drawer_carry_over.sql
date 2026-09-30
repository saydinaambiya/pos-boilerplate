CREATE TYPE "public"."shift_kind" AS ENUM('DRAWER', 'SALES');--> statement-breakpoint
ALTER TABLE "shifts" ADD COLUMN "kind" "shift_kind";--> statement-breakpoint
ALTER TABLE "shifts" ADD COLUMN "carried_cash" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "shifts" ADD COLUMN "carried_from_shift_id" uuid;--> statement-breakpoint
ALTER TABLE "cash_deposits" ADD COLUMN "shift_id" uuid;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_carried_from_shift_id_shifts_id_fk" FOREIGN KEY ("carried_from_shift_id") REFERENCES "public"."shifts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_deposits" ADD CONSTRAINT "cash_deposits_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "shifts_carried_from_shift_id_key" ON "shifts" USING btree ("carried_from_shift_id");--> statement-breakpoint
CREATE INDEX "shifts_kind_closed_at_idx" ON "shifts" USING btree ("kind","closed_at");--> statement-breakpoint
CREATE INDEX "cash_deposits_shift_id_idx" ON "cash_deposits" USING btree ("shift_id");--> statement-breakpoint
UPDATE "shifts" SET "kind" = CASE WHEN "roles"."is_system" OR EXISTS (SELECT 1 FROM "role_permissions" WHERE "role_permissions"."role_id" = "users"."role_id" AND "role_permissions"."permission" = 'page:pos') THEN 'DRAWER' ELSE 'SALES' END::"shift_kind" FROM "users" INNER JOIN "roles" ON "roles"."id" = "users"."role_id" WHERE "users"."id" = "shifts"."user_id" AND "shifts"."closed_at" IS NULL;