CREATE TABLE "audit_purges" (
	"id" uuid PRIMARY KEY NOT NULL,
	"from_date" date NOT NULL,
	"to_date" date NOT NULL,
	"row_count" integer NOT NULL,
	"checksum" text NOT NULL,
	"exported_at" timestamp with time zone NOT NULL,
	"exported_by" uuid NOT NULL,
	"purged_at" timestamp with time zone,
	"purged_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_purges" ADD CONSTRAINT "audit_purges_exported_by_users_id_fk" FOREIGN KEY ("exported_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_purges" ADD CONSTRAINT "audit_purges_purged_by_users_id_fk" FOREIGN KEY ("purged_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;