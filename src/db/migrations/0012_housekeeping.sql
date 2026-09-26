CREATE TABLE "archive_batches" (
	"id" uuid PRIMARY KEY NOT NULL,
	"month" text NOT NULL,
	"row_counts" jsonb NOT NULL,
	"checksums" jsonb NOT NULL,
	"exported_at" timestamp with time zone NOT NULL,
	"exported_by" uuid NOT NULL,
	"archived_at" timestamp with time zone,
	"archived_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stock_movements" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD COLUMN "archive_batch_id" uuid;--> statement-breakpoint
ALTER TABLE "archive_batches" ADD CONSTRAINT "archive_batches_exported_by_users_id_fk" FOREIGN KEY ("exported_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_batches" ADD CONSTRAINT "archive_batches_archived_by_users_id_fk" FOREIGN KEY ("archived_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "archive_batches_month_key" ON "archive_batches" USING btree ("month");