CREATE TABLE "cash_deposits" (
	"id" uuid PRIMARY KEY NOT NULL,
	"day" date NOT NULL,
	"bank_account_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"note" text,
	"actor_id" uuid NOT NULL,
	"cancelled_at" timestamp with time zone,
	"cancelled_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cash_deposits_amount_positive" CHECK ("cash_deposits"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "cash_deposits" ADD CONSTRAINT "cash_deposits_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_deposits" ADD CONSTRAINT "cash_deposits_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_deposits" ADD CONSTRAINT "cash_deposits_cancelled_by_id_users_id_fk" FOREIGN KEY ("cancelled_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cash_deposits_day_idx" ON "cash_deposits" USING btree ("day");--> statement-breakpoint
INSERT INTO "role_permissions" ("id", "role_id", "permission") SELECT gen_random_uuid(), "roles"."id", "granted"."permission" FROM "roles" CROSS JOIN (VALUES ('page:reports'), ('report:view'), ('cash:deposit')) AS "granted" ("permission") WHERE lower("roles"."name") = 'admin' ON CONFLICT DO NOTHING;