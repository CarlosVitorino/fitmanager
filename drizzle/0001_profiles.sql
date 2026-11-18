CREATE TABLE "benchmark" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" text NOT NULL,
	"member_id" text NOT NULL,
	"exercise" text NOT NULL,
	"value" double precision NOT NULL,
	"unit" text NOT NULL,
	"recorded_on" date NOT NULL,
	"note" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "body_measurement" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" text NOT NULL,
	"member_id" text NOT NULL,
	"measured_on" date NOT NULL,
	"weight_kg" double precision,
	"body_fat_pct" double precision,
	"waist_cm" double precision,
	"hips_cm" double precision,
	"chest_cm" double precision,
	"arm_cm" double precision,
	"thigh_cm" double precision,
	"resting_hr" integer,
	"note" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fitness_profile" (
	"studio_id" text NOT NULL,
	"user_id" text NOT NULL,
	"goals" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"goal_notes" text,
	"target_date" date,
	"experience" text,
	"training_notes" text,
	"clearance" text DEFAULT 'unknown' NOT NULL,
	"injuries" text,
	"medical" text,
	"share_goals" boolean DEFAULT true NOT NULL,
	"share_background" boolean DEFAULT true NOT NULL,
	"share_health" boolean DEFAULT false NOT NULL,
	"share_measurements" boolean DEFAULT true NOT NULL,
	"share_benchmarks" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
ALTER TABLE "member_note" ADD COLUMN "category" text DEFAULT 'general' NOT NULL;--> statement-breakpoint
ALTER TABLE "member_note" ADD COLUMN "pinned" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "member_profile" ADD COLUMN "date_of_birth" date;--> statement-breakpoint
ALTER TABLE "member_profile" ADD COLUMN "gender" text;--> statement-breakpoint
ALTER TABLE "member_profile" ADD COLUMN "address_line" text;--> statement-breakpoint
ALTER TABLE "member_profile" ADD COLUMN "city" text;--> statement-breakpoint
ALTER TABLE "member_profile" ADD COLUMN "postal_code" text;--> statement-breakpoint
ALTER TABLE "member_profile" ADD COLUMN "country" text;--> statement-breakpoint
ALTER TABLE "member_profile" ADD COLUMN "emergency_name" text;--> statement-breakpoint
ALTER TABLE "member_profile" ADD COLUMN "emergency_phone" text;--> statement-breakpoint
ALTER TABLE "benchmark" ADD CONSTRAINT "benchmark_studio_id_organization_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "benchmark" ADD CONSTRAINT "benchmark_member_id_user_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "benchmark" ADD CONSTRAINT "benchmark_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "body_measurement" ADD CONSTRAINT "body_measurement_studio_id_organization_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "body_measurement" ADD CONSTRAINT "body_measurement_member_id_user_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "body_measurement" ADD CONSTRAINT "body_measurement_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fitness_profile" ADD CONSTRAINT "fitness_profile_studio_id_organization_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fitness_profile" ADD CONSTRAINT "fitness_profile_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fitness_profile" ADD CONSTRAINT "fitness_profile_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "benchmark_studio_id_member_id_exercise_index" ON "benchmark" USING btree ("studio_id","member_id","exercise");--> statement-breakpoint
CREATE INDEX "body_measurement_studio_id_member_id_measured_on_index" ON "body_measurement" USING btree ("studio_id","member_id","measured_on");--> statement-breakpoint
CREATE UNIQUE INDEX "fitness_profile_studio_id_user_id_index" ON "fitness_profile" USING btree ("studio_id","user_id");--> statement-breakpoint
-- Notes are rich text from now on: turn existing plain-text notes into escaped HTML paragraphs.
UPDATE "member_note"
SET "body" = '<p>' || replace(replace(replace(replace("body", '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), E'\n', '<br>') || '</p>'
WHERE "body" NOT LIKE '<p>%';
