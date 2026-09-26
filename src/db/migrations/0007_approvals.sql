CREATE TYPE "public"."approval_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."approval_type" AS ENUM('VOID', 'VOUCHER', 'KASBON_PAYMENT');--> statement-breakpoint
CREATE TABLE "approvals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"type" "approval_type" NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"requested_by" uuid NOT NULL,
	"status" "approval_status" DEFAULT 'PENDING' NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"note" text,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "approvals_status_type_created_at_idx" ON "approvals" USING btree ("status","type","created_at");--> statement-breakpoint
CREATE INDEX "approvals_requested_by_idx" ON "approvals" USING btree ("requested_by","created_at");--> statement-breakpoint
CREATE INDEX "approvals_target_idx" ON "approvals" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE UNIQUE INDEX "approvals_one_pending_per_target_key" ON "approvals" USING btree ("type","target_id") WHERE "approvals"."status" = 'PENDING';