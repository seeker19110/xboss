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
  sort_order INTEGER DEFAULT 0,
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
  sort_order INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (package_id, code)
);

CREATE TABLE IF NOT EXISTS progress_dimensions (
  id SERIAL PRIMARY KEY,
  task_id INTEGER REFERENCES tasks(id),
  dimension_label TEXT NOT NULL,
  installed INTEGER DEFAULT 0,
  value DOUBLE PRECISION,
  sort_order INTEGER DEFAULT 0,
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

CREATE TABLE IF NOT EXISTS task_photos (
  id SERIAL PRIMARY KEY,
  task_id INTEGER REFERENCES tasks(id),
  file_name TEXT NOT NULL,
  original_name TEXT,
  mime_type TEXT,
  size_bytes INTEGER,
  caption TEXT,
  uploaded_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS task_comments (
  id SERIAL PRIMARY KEY,
  task_id INTEGER REFERENCES tasks(id),
  user_id INTEGER REFERENCES users(id),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  endpoint TEXT UNIQUE NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
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
  sort_order INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Lịch sử nhập/xuất vật tư: mọi thay đổi qty_used đều ghi 1 giao dịch
-- (delta ± , số sau thay đổi, ai ghi, lúc nào) — truy vết được khi số liệu lệch.
CREATE TABLE IF NOT EXISTS material_transactions (
  id SERIAL PRIMARY KEY,
  material_id INTEGER REFERENCES materials(id),
  delta DOUBLE PRECISION NOT NULL,
  qty_after DOUBLE PRECISION NOT NULL,
  note TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Baseline kế hoạch: snapshot ngày BĐ/KT + % của mọi task tại một thời điểm,
-- để S-curve so được kế hoạch gốc vs kế hoạch đã điều chỉnh vs thực tế.
CREATE TABLE IF NOT EXISTS baselines (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  note TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS baseline_tasks (
  id SERIAL PRIMARY KEY,
  baseline_id INTEGER REFERENCES baselines(id) ON DELETE CASCADE,
  task_id INTEGER REFERENCES tasks(id),
  start_date DATE,
  end_date DATE,
  progress_percent DOUBLE PRECISION DEFAULT 0,
  UNIQUE (baseline_id, task_id)
);

-- Biên bản nghiệm thu / tài liệu đính kèm task (PDF hoặc ảnh) — file trong data/uploads/.
CREATE TABLE IF NOT EXISTS task_documents (
  id SERIAL PRIMARY KEY,
  task_id INTEGER REFERENCES tasks(id),
  file_name TEXT NOT NULL,
  original_name TEXT,
  mime_type TEXT,
  size_bytes INTEGER,
  caption TEXT,
  uploaded_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migration nhẹ (idempotent) cho DB đã tồn tại.
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS material_id INTEGER REFERENCES materials(id);
-- Dedup thông báo vật tư: UNIQUE(user,task,type) không áp dụng được khi task_id NULL
-- (Postgres coi NULL khác nhau) → cần unique index riêng theo material_id.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_notif_material ON notifications(user_id, material_id, type) WHERE material_id IS NOT NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assigned_to INTEGER REFERENCES users(id);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS delay_reason TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS delay_note TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS boq_code TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS drawing_url TEXT;
ALTER TABLE work_packages ADD COLUMN IF NOT EXISTS boq_code TEXT;
ALTER TABLE work_packages ADD COLUMN IF NOT EXISTS drawing_url TEXT;

ALTER TABLE materials ADD COLUMN IF NOT EXISTS boq_code TEXT;

-- sort_order: thứ tự hiển thị hàng/cột (tách khỏi id để chèn ở bất kỳ vị trí).
ALTER TABLE work_packages ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
ALTER TABLE materials ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
ALTER TABLE progress_dimensions ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
-- Seed sort_order cho dữ liệu cũ (id là thứ tự gốc khi import Excel).
UPDATE work_packages SET sort_order = id WHERE sort_order = 0;
UPDATE tasks SET sort_order = id WHERE sort_order = 0;
UPDATE materials SET sort_order = id WHERE sort_order = 0;

-- Sheet tracking động: slug URL lưu trong DB (đổi tên/đường dẫn, tạo sheet mới).
ALTER TABLE sheet_types ADD COLUMN IF NOT EXISTS slug TEXT;
-- Backfill slug cho 5 sheet gốc theo mapping cũ trong lib/sheets.ts.
UPDATE sheet_types SET slug = CASE code
  WHEN 'OGTĐ' THEN 'ogtd' WHEN 'OGHL' THEN 'oghl' WHEN 'OGCH' THEN 'ogch'
  WHEN 'ODNN Zone 1' THEN 'odnn1' WHEN 'ODNN Zone 2' THEN 'odnn2' END
 WHERE slug IS NULL;
UPDATE sheet_types SET slug = 'sheet-' || id WHERE slug IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_sheet_slug ON sheet_types(slug);
UPDATE progress_dimensions SET sort_order = id WHERE sort_order = 0;

-- Phân công theo hệ: 1 user quản lý cả sheet; nhóm/task kế thừa tự động
-- cho đến khi gán thủ công (assigned_manual = TRUE).
ALTER TABLE sheet_types ADD COLUMN IF NOT EXISTS manager_id INTEGER REFERENCES users(id);
ALTER TABLE work_packages ADD COLUMN IF NOT EXISTS assigned_to INTEGER REFERENCES users(id);
ALTER TABLE work_packages ADD COLUMN IF NOT EXISTS assigned_manual BOOLEAN NOT NULL DEFAULT FALSE;
-- tasks.assigned_manual: backfill 1 lần — task đã gán trước đây coi là gán thủ công
-- (DO block để UPDATE chỉ chạy đúng lúc thêm cột, không lặp lại mỗi lần boot).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name = 'tasks' AND column_name = 'assigned_manual') THEN
    ALTER TABLE tasks ADD COLUMN assigned_manual BOOLEAN NOT NULL DEFAULT FALSE;
    UPDATE tasks SET assigned_manual = TRUE WHERE assigned_to IS NOT NULL;
  END IF;
END $$;

-- BOQCODE duy nhất (NULL = chưa gán, không tính trùng).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_tasks_boq ON tasks(boq_code) WHERE boq_code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_wp_boq ON work_packages(boq_code) WHERE boq_code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_materials_boq ON materials(boq_code) WHERE boq_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_materials_sheet ON materials(sheet_type_id);
CREATE INDEX IF NOT EXISTS idx_photos_task ON task_photos(task_id);
CREATE INDEX IF NOT EXISTS idx_comments_task ON task_comments(task_id);
CREATE INDEX IF NOT EXISTS idx_mat_trans ON material_transactions(material_id);

CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_tasks_package ON tasks(package_id);
CREATE INDEX IF NOT EXISTS idx_tasks_end ON tasks(end_date);
CREATE INDEX IF NOT EXISTS idx_wp_sheet ON work_packages(sheet_type_id);
CREATE INDEX IF NOT EXISTS idx_dims_task ON progress_dimensions(task_id);
CREATE INDEX IF NOT EXISTS idx_history_task ON task_history(task_id);
CREATE INDEX IF NOT EXISTS idx_baseline_tasks ON baseline_tasks(baseline_id);
CREATE INDEX IF NOT EXISTS idx_documents_task ON task_documents(task_id);

-- Audit log phân công: ai gán ai vào hệ/nhóm/task, lúc nào.
CREATE TABLE IF NOT EXISTS assignment_log (
  id SERIAL PRIMARY KEY,
  level TEXT NOT NULL,       -- 'sheet' | 'package' | 'task'
  target_id INTEGER NOT NULL,
  target_label TEXT,
  prev_user_id INTEGER REFERENCES users(id),
  new_user_id INTEGER REFERENCES users(id),
  changed_by INTEGER REFERENCES users(id),
  is_manual BOOLEAN,
  changed_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_asgn_log_target ON assignment_log(level, target_id);
CREATE INDEX IF NOT EXISTS idx_asgn_log_changed ON assignment_log(changed_at DESC);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS heatmap_title TEXT;
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
