-- 0009_inspection_requests.sql — M3 tiếp: phiếu yêu cầu nghiệm thu (YCNT) gửi TVGS.
-- Xem docs/nang-cap/M03-qaqc.md § Chia PR mục 3. Hồ sơ chất lượng tổng hợp/xuất tầng
-- + T&C dùng bảng/cột đã có từ 0008_qaqc.sql (doc_category, checklist category='tc').

CREATE TABLE IF NOT EXISTS inspection_requests (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE, -- YCNT-0001
  scheduled_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent'
    CHECK (status IN ('sent', 'confirmed', 'passed', 'failed', 'cancelled')),
  note TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inspection_request_tasks (
  request_id INTEGER NOT NULL REFERENCES inspection_requests(id) ON DELETE CASCADE,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  PRIMARY KEY (request_id, task_id)
);

CREATE INDEX IF NOT EXISTS idx_inspection_requests_status ON inspection_requests(status);
CREATE INDEX IF NOT EXISTS idx_insreq_tasks_task ON inspection_request_tasks(task_id);
