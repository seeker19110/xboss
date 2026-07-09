-- 0035_handover.sql — M29: Bàn giao & Kết thúc (T&C, as-built, demob). Chạy thử &
-- nghiệm thu hệ thống (commissioning), hạng mục bàn giao CĐT, punch list (tồn tại khi
-- bàn giao), giải thể công trường (demob), bài học kinh nghiệm.
-- Xem docs/nang-cap/M29-ban-giao-ket-thuc.md (đặc tả gốc ghi số 0034 — đã đổi số vì
-- 0031-0034 đã bị M24/M28/M25/M26 chiếm khi rebase lên main mới nhất).
CREATE TABLE IF NOT EXISTS commissioning (                  -- chạy thử & nghiệm thu hệ thống
  id SERIAL PRIMARY KEY, project_id INTEGER REFERENCES projects(id),
  code TEXT, system_name TEXT NOT NULL, discipline_id INTEGER REFERENCES disciplines(id),
  checklist JSONB,                                           -- các bước T&C (pattern qc_checklists)
  result TEXT NOT NULL DEFAULT 'draft'
    CHECK (result IN ('draft','testing','passed','failed')),
  tested_at DATE, note TEXT,
  created_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS handover_items (                 -- hạng mục bàn giao
  id SERIAL PRIMARY KEY, project_id INTEGER REFERENCES projects(id),
  title TEXT NOT NULL, discipline_id INTEGER REFERENCES disciplines(id),
  work_package_id INTEGER REFERENCES work_packages(id),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','handed_over','accepted')),
  handover_date DATE, minutes_file TEXT,                     -- biên bản (1 file gọn)
  created_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS punch_list (                     -- tồn tại khi bàn giao
  id SERIAL PRIMARY KEY, project_id INTEGER REFERENCES projects(id),
  handover_item_id INTEGER REFERENCES handover_items(id),
  description TEXT NOT NULL, severity TEXT CHECK (severity IN ('low','medium','high')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','fixing','closed')),
  due_date DATE, assignee INTEGER REFERENCES users(id),
  created_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS demob_items (                    -- giải thể công trường
  id SERIAL PRIMARY KEY, project_id INTEGER REFERENCES projects(id),
  title TEXT NOT NULL, category TEXT,                        -- lán trại/mặt bằng/vật tư dư
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done')),
  note TEXT, created_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS lessons_learned (
  id SERIAL PRIMARY KEY, project_id INTEGER REFERENCES projects(id),
  title TEXT NOT NULL, category TEXT, content TEXT,
  created_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS punch_item_id INTEGER REFERENCES punch_list(id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_notif_punch ON notifications(user_id, type, punch_item_id)
  WHERE punch_item_id IS NOT NULL;
