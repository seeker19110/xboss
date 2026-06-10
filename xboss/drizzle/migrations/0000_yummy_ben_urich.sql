CREATE TYPE "public"."status" AS ENUM('chuan_bi', 'dang_thi_cong', 'hoan_thanh', 'nghiem_thu', 'tre');--> statement-breakpoint
CREATE TABLE "progress_dimensions" (
	"id" serial PRIMARY KEY NOT NULL,
	"task_id" integer,
	"dimension_label" text NOT NULL,
	"installed" boolean DEFAULT false,
	"value" double precision,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"code" text,
	"investor" text,
	"contractor" text,
	"start_date" timestamp,
	"end_date" timestamp,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "projects_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "sheet_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"tower_id" integer,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"responsible" text
);
--> statement-breakpoint
CREATE TABLE "task_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"task_id" integer,
	"old_progress" double precision,
	"new_progress" double precision,
	"status" text,
	"note" text,
	"changed_by" text,
	"changed_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"package_id" integer,
	"code" text NOT NULL,
	"seq_no" text,
	"name" text NOT NULL,
	"note" text,
	"status" "status" DEFAULT 'chuan_bi',
	"start_date" timestamp,
	"end_date" timestamp,
	"duration_days" integer,
	"progress_percent" double precision DEFAULT 0,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "towers" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer,
	"name" text NOT NULL,
	"description" text
);
--> statement-breakpoint
CREATE TABLE "work_packages" (
	"id" serial PRIMARY KEY NOT NULL,
	"sheet_type_id" integer,
	"code" text NOT NULL,
	"seq_no" text,
	"floor_label" text,
	"name" text NOT NULL,
	"start_date" timestamp,
	"end_date" timestamp,
	"duration_days" integer,
	"status" "status" DEFAULT 'chuan_bi',
	"progress" double precision DEFAULT 0,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "progress_dimensions" ADD CONSTRAINT "progress_dimensions_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sheet_types" ADD CONSTRAINT "sheet_types_tower_id_towers_id_fk" FOREIGN KEY ("tower_id") REFERENCES "public"."towers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_history" ADD CONSTRAINT "task_history_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_package_id_work_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."work_packages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "towers" ADD CONSTRAINT "towers_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_packages" ADD CONSTRAINT "work_packages_sheet_type_id_sheet_types_id_fk" FOREIGN KEY ("sheet_type_id") REFERENCES "public"."sheet_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_sheet_tower_code" ON "sheet_types" USING btree ("tower_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_task_pkg_code" ON "tasks" USING btree ("package_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_wp_sheet_code" ON "work_packages" USING btree ("sheet_type_id","code");