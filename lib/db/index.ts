// DB layer dùng PostgreSQL (pg Pool) — cấu hình qua DATABASE_URL.
// Giữ nguyên API helper (query/queryOne/run) như bản SQLite cũ nhưng async;
// placeholder viết dạng `?` và được chuyển tự động sang $1..$n.
import { Pool, types } from "pg";

// DATE (oid 1082) → giữ nguyên chuỗi 'YYYY-MM-DD' (code so sánh ngày dạng chuỗi).
types.setTypeParser(1082, (v) => v);
// BIGINT (COUNT/SUM) và NUMERIC → number để frontend tính toán được.
types.setTypeParser(20, (v) => Number(v));
types.setTypeParser(1700, (v) => parseFloat(v));

const g = globalThis as unknown as { __xbossPool?: Pool; __xbossSchemaReady?: Promise<unknown> };

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'engineer',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS projects (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT UNIQUE,
  investor TEXT,
  contractor TEXT,
  start_date DATE,
  end_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS towers (
  id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id),
  name TEXT NOT NULL,
  description TEXT
);

CREATE TABLE IF NOT EXISTS sheet_types (
  id SERIAL PRIMARY KEY,
  tower_id INTEGER REFERENCES towers(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  responsible TEXT,
  UNIQUE (tower_id, code)
);

CREATE TABLE IF NOT EXISTS work_packages (
  id SERIAL PRIMARY KEY,
  boq_code TEXT,
  sheet_type_id INTEGER REFERENCES sheet_types(id),
  code TEXT NOT NULL,
  seq_no TEXT,
  floor_label TEXT,
  name TEXT NOT NULL,
  drawing_url TEXT,
  start_date DATE,
  end_date DATE,
  duration_days INTEGER,
  status TEXT DEFAULT 'chuan_bi',
  progress DOUBLE PRECISION DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (sheet_type_id, code)
);

CREATE TABLE IF NOT EXISTS tasks (
  id SERIAL PRIMARY KEY,
  boq_code TEXT,
  package_id INTEGER REFERENCES work_packages(id),
  code TEXT NOT NULL,
  seq_no TEXT,
  name TEXT NOT NULL,
  note TEXT,
  drawing_url TEXT,
  status TEXT DEFAULT 'chuan_bi',
  start_date DATE,
  end_date DATE,
  duration_days INTEGER,
  progress_percent DOUBLE PRECISION DEFAULT 0,
  assigned_to INTEGER REFERENCES users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (package_id, code)
);

CREATE TABLE IF NOT EXISTS progress_dimensions (
  id SERIAL PRIMARY KEY,
  task_id INTEGER REFERENCES tasks(id),
  dimension_label TEXT NOT NULL,
  installed INTEGER DEFAULT 0,
  value DOUBLE PRECISION,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS task_history (
  id SERIAL PRIMARY KEY,
  task_id INTEGER REFERENCES tasks(id),
  old_progress DOUBLE PRECISION,
  new_progress DOUBLE PRECISION,
  status TEXT,
  note TEXT,
  changed_by TEXT,
  changed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  task_id INTEGER REFERENCES tasks(id),
  type TEXT NOT NULL DEFAULT 'delayed',
  message TEXT NOT NULL,
  is_read INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, task_id, type)
);

CREATE TABLE IF NOT EXISTS materials (
  id SERIAL PRIMARY KEY,
  sheet_type_id INTEGER REFERENCES sheet_types(id),
  task_id INTEGER REFERENCES tasks(id),
  name TEXT NOT NULL,
  unit TEXT,
  qty_planned DOUBLE PRECISION DEFAULT 0,
  qty_used DOUBLE PRECISION DEFAULT 0,
  status TEXT DEFAULT 'dat_hang',
  note TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migration nhẹ (idempotent) cho DB đã tồn tại.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assigned_to INTEGER REFERENCES users(id);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS boq_code TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS drawing_url TEXT;
ALTER TABLE work_packages ADD COLUMN IF NOT EXISTS boq_code TEXT;
ALTER TABLE work_packages ADD COLUMN IF NOT EXISTS drawing_url TEXT;

-- BOQCODE duy nhất (NULL = chưa gán, không tính trùng).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_tasks_boq ON tasks(boq_code) WHERE boq_code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_wp_boq ON work_packages(boq_code) WHERE boq_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_materials_sheet ON materials(sheet_type_id);

CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_tasks_package ON tasks(package_id);
CREATE INDEX IF NOT EXISTS idx_tasks_end ON tasks(end_date);
CREATE INDEX IF NOT EXISTS idx_wp_sheet ON work_packages(sheet_type_id);
CREATE INDEX IF NOT EXISTS idx_dims_task ON progress_dimensions(task_id);
CREATE INDEX IF NOT EXISTS idx_history_task ON task_history(task_id);
`;

export function getPool(): Pool {
  if (!g.__xbossPool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("Thiếu DATABASE_URL — cấu hình chuỗi kết nối Postgres trong .env.local");
    g.__xbossPool = new Pool({ connectionString: url, max: 10 });
  }
  return g.__xbossPool;
}

// Tự khởi tạo schema 1 lần mỗi process (CREATE TABLE IF NOT EXISTS — idempotent).
function ensureSchema(): Promise<unknown> {
  if (!g.__xbossSchemaReady) {
    g.__xbossSchemaReady = getPool().query(SCHEMA).catch((err) => {
      g.__xbossSchemaReady = undefined; // cho phép thử lại nếu lần đầu lỗi mạng
      throw err;
    });
  }
  return g.__xbossSchemaReady;
}

// Chuyển placeholder `?` → $1..$n (SQL trong codebase không chứa '?' trong literal).
const toPg = (sql: string) => {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
};

export async function query<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T[]> {
  await ensureSchema();
  const r = await getPool().query(toPg(sql), params);
  return r.rows as T[];
}

export async function queryOne<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T | undefined> {
  const rows = await query<T>(sql, ...params);
  return rows[0];
}

export async function run(sql: string, ...params: unknown[]): Promise<{ changes: number }> {
  await ensureSchema();
  const r = await getPool().query(toPg(sql), params);
  return { changes: r.rowCount ?? 0 };
}

// INSERT trả về id (thay cho lastInsertRowid của SQLite).
export async function insertId(sql: string, ...params: unknown[]): Promise<number> {
  await ensureSchema();
  const r = await getPool().query(toPg(sql) + " RETURNING id", params);
  return Number(r.rows[0].id);
}

// Hôm nay dạng ISO (YYYY-MM-DD) để so sánh chuỗi ngày.
export const todayISO = () => new Date().toISOString().slice(0, 10);
