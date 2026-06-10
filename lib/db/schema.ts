import { pgTable, serial, text, integer, decimal, timestamp, boolean, pgEnum } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// Enums
export const statusEnum = pgEnum("status", ["ChuanBi", "DangThiCong", "DaHoanThanh", "DaNghiemThu", "DangTre", "DongLoi"]);

// Projects
export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  code: text("code").unique(),
  investor: text("investor"),
  contractor: text("contractor"),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const towers = pgTable("towers", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id),
  name: text("name").notNull(), // Tháp A, Tháp B...
  description: text("description"),
});

export const sheetTypes = pgTable("sheet_types", {
  id: serial("id").primaryKey(),
  code: text("code").unique().notNull(), // OGTĐ, OGHL, OGCH, ODNN Zone 1...
  name: text("name").notNull(),
  description: text("description"),
});

// Main Work Tracking
export const workPackages = pgTable("work_packages", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id),
  towerId: integer("tower_id").references(() => towers.id),
  sheetTypeId: integer("sheet_type_id").references(() => sheetTypes.id),
  code: text("code").notNull(), // A9, H12, etc.
  name: text("name").notNull(), // Thi công trục đứng ống gió 9F
  floor: text("floor"), // 9F, 12F...
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  days: integer("days"),
  progress: decimal("progress", { precision: 10, scale: 4 }).default("0"),
  status: statusEnum("status").default("ChuanBi"),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Chi tiết tiến độ theo kích thước / vị trí
export const progressDimensions = pgTable("progress_dimensions", {
  id: serial("id").primaryKey(),
  workPackageId: integer("work_package_id").references(() => workPackages.id),
  dimensionCode: text("dimension_code").notNull(), // 1300x700 X3-X4 Y5-Y6
  progress: decimal("progress", { precision: 10, scale: 4 }).default("0"),
  isCompleted: boolean("is_completed").default(false),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const taskHistory = pgTable("task_history", {
  id: serial("id").primaryKey(),
  workPackageId: integer("work_package_id").references(() => workPackages.id),
  oldProgress: decimal("old_progress"),
  newProgress: decimal("new_progress"),
  status: text("status"),
  note: text("note"),
  changedBy: text("changed_by"),
  changedAt: timestamp("changed_at").defaultNow(),
});

// Relations
export const workPackagesRelations = relations(workPackages, ({ one, many }) => ({
  project: one(projects),
  tower: one(towers),
  sheetType: one(sheetTypes),
  dimensions: many(progressDimensions),
  history: many(taskHistory),
}));

export const progressDimensionsRelations = relations(progressDimensions, ({ one }) => ({
  workPackage: one(workPackages),
}));