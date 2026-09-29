CREATE TYPE "public"."expense_category" AS ENUM('MEAL', 'FUEL', 'DONATION', 'OTHER');--> statement-breakpoint
CREATE TABLE "cash_expenses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"shift_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"recipient_id" uuid,
	"category" "expense_category" NOT NULL,
	"amount" bigint NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cash_expenses_amount_positive" CHECK ("cash_expenses"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "cash_expenses" ADD CONSTRAINT "cash_expenses_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_expenses" ADD CONSTRAINT "cash_expenses_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_expenses" ADD CONSTRAINT "cash_expenses_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cash_expenses_shift_id_idx" ON "cash_expenses" USING btree ("shift_id");--> statement-breakpoint
CREATE INDEX "cash_expenses_created_at_idx" ON "cash_expenses" USING btree ("created_at");--> statement-breakpoint
DELETE FROM "role_permissions" WHERE "permission" IN ('product:view-cost', 'report:view-profit');
