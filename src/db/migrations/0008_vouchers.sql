CREATE TYPE "public"."voucher_revision_status" AS ENUM('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."voucher_status" AS ENUM('PENDING_APPROVAL', 'ACTIVE', 'INACTIVE', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."voucher_type" AS ENUM('PERCENT', 'FIXED');--> statement-breakpoint
CREATE TABLE "voucher_revisions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"voucher_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" "voucher_type" NOT NULL,
	"value" bigint NOT NULL,
	"min_purchase" bigint,
	"max_discount" bigint,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"quota" integer,
	"status" "voucher_revision_status" DEFAULT 'PENDING_APPROVAL' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "voucher_revisions_value_positive" CHECK ("voucher_revisions"."value" > 0),
	CONSTRAINT "voucher_revisions_period_order" CHECK ("voucher_revisions"."starts_at" IS NULL OR "voucher_revisions"."ends_at" IS NULL OR "voucher_revisions"."starts_at" < "voucher_revisions"."ends_at")
);
--> statement-breakpoint
CREATE TABLE "vouchers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"status" "voucher_status" DEFAULT 'PENDING_APPROVAL' NOT NULL,
	"active_revision_id" uuid,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vouchers_code_uppercase" CHECK ("vouchers"."code" = upper("vouchers"."code")),
	CONSTRAINT "vouchers_usage_non_negative" CHECK ("vouchers"."usage_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "voucher_revisions" ADD CONSTRAINT "voucher_revisions_voucher_id_vouchers_id_fk" FOREIGN KEY ("voucher_id") REFERENCES "public"."vouchers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voucher_revisions" ADD CONSTRAINT "voucher_revisions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_active_revision_id_voucher_revisions_id_fk" FOREIGN KEY ("active_revision_id") REFERENCES "public"."voucher_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "voucher_revisions_voucher_id_idx" ON "voucher_revisions" USING btree ("voucher_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "vouchers_code_key" ON "vouchers" USING btree ("code");--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_voucher_id_vouchers_id_fk" FOREIGN KEY ("voucher_id") REFERENCES "public"."vouchers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sales_voucher_id_idx" ON "sales" USING btree ("voucher_id");