import {
  pgTable, serial, text, integer, doublePrecision,
  timestamp, boolean, pgEnum, uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// Status chuẩn hóa dạng slug (không dấu) — nguồn sự thật duy nhất.
// Map từ chuỗi tiếng Việt trong Excel sang slug nằm ở lib/status.ts
export const statusEnum = pgEnum("status", [
  "chuan_bi",      // Chuẩn bị
  "dang_thi_cong", // Đang thi công
  "hoan_thanh",    // Hoàn thành
  "nghiem_thu",    // Đã nghiệm thu
  "tre",           // Đang trễ
]);

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
  name: text("name").notNull(),
  description: text("description"),
});

export const sheetTypes = pgTable("sheet_types", {
  id: serial("id").primaryKey(),
  towerId: integer("tower_id").references(() => towers.id),
  code: text("code").notNull(),       // OGTĐ, OGHL, OGCH, ODNN Zone 1...
  name: text("name").notNull(),
  responsible: text("responsible"),   // Mr. Thừa, Mr. Hải...
}, (t) => ({
  uniqTowerCode: uniqueIndex("uniq_sheet_tower_code").on(t.towerId, t.code),
}));

// Nhóm công việc theo tầng (group header): A1, H1, OGCH1...
export const workPackages = pgTable("work_packages", {
  id: serial("id").primaryKey(),
  sheetTypeId: integer("sheet_type_id").references(() => sheetTypes.id),
  code: text("code").notNull(),       // A1, H1...
  seqNo: text("seq_no"),              // STT gốc: "1"
  floorLabel: text("floor_label"),    // 1F, 9F...
  name: text("name").notNull(),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  durationDays: integer("duration_days"),
  status: statusEnum("status").default("chuan_bi"),
  progress: doublePrecision("progress").default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  uniqSheetCode: uniqueIndex("uniq_wp_sheet_code").on(t.sheetTypeId, t.code),
}));

// Task con: A1,01 / A1,02...
export const tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
  packageId: integer("package_id").references(() => workPackages.id),
  code: text("code").notNull(),       // A1,01
  seqNo: text("seq_no"),              // 1.01
  name: text("name").notNull(),
  note: text("note"),
  status: statusEnum("status").default("chuan_bi"),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  durationDays: integer("duration_days"),
  progressPercent: doublePrecision("progress_percent").default(0),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => ({
  uniqPkgCode: uniqueIndex("uniq_task_pkg_code").on(t.packageId, t.code),
}));

// Chi tiết theo dimension (kích thước/căn hộ) — ma trận task × dimension
export const progressDimensions = pgTable("progress_dimensions", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id").references(() => tasks.id),
  dimensionLabel: text("dimension_label").notNull(),
  installed: boolean("installed").default(false),
  value: doublePrecision("value"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const taskHistory = pgTable("task_history", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id").references(() => tasks.id),
  oldProgress: doublePrecision("old_progress"),
  newProgress: doublePrecision("new_progress"),
  status: text("status"),
  note: text("note"),
  changedBy: text("changed_by"),
  changedAt: timestamp("changed_at").defaultNow(),
});

// Relations
export const projectsRelations = relations(projects, ({ many }) => ({
  towers: many(towers),
}));
export const towersRelations = relations(towers, ({ one, many }) => ({
  project: one(projects, { fields: [towers.projectId], references: [projects.id] }),
  sheetTypes: many(sheetTypes),
}));
export const sheetTypesRelations = relations(sheetTypes, ({ one, many }) => ({
  tower: one(towers, { fields: [sheetTypes.towerId], references: [towers.id] }),
  workPackages: many(workPackages),
}));
export const workPackagesRelations = relations(workPackages, ({ one, many }) => ({
  sheetType: one(sheetTypes, { fields: [workPackages.sheetTypeId], references: [sheetTypes.id] }),
  tasks: many(tasks),
}));
export const tasksRelations = relations(tasks, ({ one, many }) => ({
  workPackage: one(workPackages, { fields: [tasks.packageId], references: [workPackages.id] }),
  dimensions: many(progressDimensions),
  history: many(taskHistory),
}));
export const progressDimensionsRelations = relations(progressDimensions, ({ one }) => ({
  task: one(tasks, { fields: [progressDimensions.taskId], references: [tasks.id] }),
}));
