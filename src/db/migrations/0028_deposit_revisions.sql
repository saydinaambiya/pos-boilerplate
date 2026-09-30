CREATE TYPE "public"."deposit_revision_kind" AS ENUM('EDITED', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "cash_deposit_revisions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"deposit_id" uuid NOT NULL,
	"kind" "deposit_revision_kind" NOT NULL,
	"before" jsonb NOT NULL,
	"after" jsonb,
	"reason" text NOT NULL,
	"actor_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cash_deposit_revisions" ADD CONSTRAINT "cash_deposit_revisions_deposit_id_cash_deposits_id_fk" FOREIGN KEY ("deposit_id") REFERENCES "public"."cash_deposits"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_deposit_revisions" ADD CONSTRAINT "cash_deposit_revisions_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cash_deposit_revisions_deposit_id_idx" ON "cash_deposit_revisions" USING btree ("deposit_id","created_at");