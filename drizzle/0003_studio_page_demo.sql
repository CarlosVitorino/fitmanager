CREATE TABLE "demo_sandbox" (
	"studio_id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "demo_sandbox_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "studio_page" (
	"studio_id" text PRIMARY KEY NOT NULL,
	"tagline" text,
	"about" text,
	"address" text,
	"phone" text,
	"email" text,
	"website" text,
	"instagram" text,
	"show_schedule" boolean DEFAULT true NOT NULL,
	"show_plans" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
ALTER TABLE "demo_sandbox" ADD CONSTRAINT "demo_sandbox_studio_id_organization_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_page" ADD CONSTRAINT "studio_page_studio_id_organization_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_page" ADD CONSTRAINT "studio_page_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;