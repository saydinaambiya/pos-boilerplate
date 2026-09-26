CREATE TYPE "public"."stock_movement_type" AS ENUM('IN', 'SALE', 'ONLINE_SALE', 'RETURN', 'WRITE_OFF', 'ADJUSTMENT', 'VOID');--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"variant_id" uuid NOT NULL,
	"type" "stock_movement_type" NOT NULL,
	"qty_delta" integer NOT NULL,
	"stock_after" integer NOT NULL,
	"reference_type" text,
	"reference_id" text,
	"reason" text,
	"actor_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stock_movements_variant_id_idx" ON "stock_movements" USING btree ("variant_id","id");--> statement-breakpoint
CREATE INDEX "stock_movements_type_created_at_idx" ON "stock_movements" USING btree ("type","created_at");