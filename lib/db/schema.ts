// lib/db/schema.ts
import { pgTable, serial, text, integer, date, boolean, real, timestamp } from "drizzle-orm/pg-core";

export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  contractor: text("contractor"),
  startDate: date("start_date"),
  endDate: date("end_date"),
  status: text("status").default("In Progress"),
});

export const towers = pgTable("towers", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id),
  name: text("name").notNull(),
});

export const floors = pgTable("floors", {
  id: serial("id").primaryKey(),
  towerId: integer("tower_id").references(() => towers.id),
  floorNumber: text("floor_number").notNull(),
});

export const workPackages = pgTable("work_packages", {
  id: serial("id").primaryKey(),
  floorId: integer("floor_id").references(() => floors.id),
  code: text("code"),
  description: text("description"),
  sheetType: text("sheet_type"),
});

export const tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
  packageId: integer("package_id").references(() => workPackages.id),
  name: text("name").notNull(),
  startDate: date("start_date"),
  endDate: date("end_date"),
  progressPercent: real("progress_percent").default(0),
  status: text("status").default("Chuẩn bị"),
  assignedTo: integer("assigned_to"),
  remarks: text("remarks"),
});

export const progressDimensions = pgTable("progress_dimensions", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id").references(() => tasks.id),
  dimensionCode: text("dimension_code"),
  completed: boolean("completed").default(false),
  progressValue: real("progress_value"),
});

export const taskHistory = pgTable("task_history", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id").references(() => tasks.id),
  progressPercent: real("progress_percent"),
  status: text("status"),
  updatedBy: integer("updated_by"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const materials = pgTable("materials", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id").references(() => tasks.id),
  name: text("name"),
  quantityPlanned: real("quantity_planned"),
  quantityUsed: real("quantity_used"),
  unit: text("unit"),
  status: text("status"),
});

export type Project = typeof projects.$inferSelect;
export type Task = typeof tasks.$inferSelect;