// DB layer dùng node:sqlite (có sẵn trong Node 22.5+/24) — không cần cài thêm,
// không cần build native, chạy hoàn toàn offline. File DB: ./xboss.db
import { DatabaseSync } from "node:sqlite";
import path from "node:path";

const DB_PATH = process.env.XBOSS_DB ?? path.join(process.cwd(), "xboss.db");

const g = globalThis as unknown as { __xbossDb?: DatabaseSync };

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'engineer',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  code TEXT UNIQUE,
  investor TEXT,
  contractor TEXT,
  start_date TEXT,
  end_date TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS towers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER REFERENCES projects(id),
  name TEXT NOT NULL,
  description TEXT
);

CREATE TABLE IF NOT EXISTS sheet_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tower_id INTEGER REFERENCES towers(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  responsible TEXT,
  UNIQUE (tower_id, code)
);

CREATE TABLE IF NOT EXISTS work_packages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sheet_type_id INTEGER REFERENCES sheet_types(id),
  code TEXT NOT NULL,
  seq_no TEXT,
  floor_label TEXT,
  name TEXT NOT NULL,
  start_date TEXT,
  end_date TEXT,
  duration_days INTEGER,
  status TEXT DEFAULT 'chuan_bi',
  progress REAL DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (sheet_type_id, code)
);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  package_id INTEGER REFERENCES work_packages(id),
  code TEXT NOT NULL,
  seq_no TEXT,
  name TEXT NOT NULL,
  note TEXT,
  status TEXT DEFAULT 'chuan_bi',
  start_date TEXT,
  end_date TEXT,
  duration_days INTEGER,
  progress_percent REAL DEFAULT 0,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (package_id, code)
);

CREATE TABLE IF NOT EXISTS progress_dimensions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER REFERENCES tasks(id),
  dimension_label TEXT NOT NULL,
  installed INTEGER DEFAULT 0,
  value REAL,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS task_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER REFERENCES tasks(id),
  old_progress REAL,
  new_progress REAL,
  status TEXT,
  note TEXT,
  changed_by TEXT,
  changed_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tasks_package ON tasks(package_id);
CREATE INDEX IF NOT EXISTS idx_tasks_end ON tasks(end_date);
CREATE INDEX IF NOT EXISTS idx_wp_sheet ON work_packages(sheet_type_id);
`;

export function getDb(): DatabaseSync {
  if (g.__xbossDb) return g.__xbossDb;
  const database = new DatabaseSync(DB_PATH);
  database.exec(SCHEMA);
  g.__xbossDb = database;
  return database;
}

export const db = getDb();

// Helper nhỏ gọn cho query.
export const query = <T = Record<string, unknown>>(sql: string, ...params: unknown[]): T[] =>
  db.prepare(sql).all(...(params as never[])) as T[];

export const queryOne = <T = Record<string, unknown>>(sql: string, ...params: unknown[]): T | undefined =>
  db.prepare(sql).get(...(params as never[])) as T | undefined;

export const run = (sql: string, ...params: unknown[]) =>
  db.prepare(sql).run(...(params as never[]));

// Hôm nay dạng ISO (YYYY-MM-DD) để so sánh chuỗi ngày.
export const todayISO = () => new Date().toISOString().slice(0, 10);
