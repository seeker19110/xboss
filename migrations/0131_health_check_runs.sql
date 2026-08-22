-- Migration 0131: Lưu lịch sử kiểm tra trạng thái hoạt động (health check) — API và
-- không-API (cron, email, Telegram, push, đồng bộ Google Sheet, lưu trữ...). Dùng cho
-- cron 2 lần/ngày (/api/cron/health-check) và nút kiểm tra thủ công (Admin, /tech).
CREATE TABLE IF NOT EXISTS health_check_runs (
  id BIGSERIAL PRIMARY KEY,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  has_issues BOOLEAN NOT NULL,
  fail_count INTEGER NOT NULL DEFAULT 0,
  warn_count INTEGER NOT NULL DEFAULT 0,
  results JSONB NOT NULL,
  notified BOOLEAN NOT NULL DEFAULT false,
  triggered_by TEXT NOT NULL DEFAULT 'cron'
);

CREATE INDEX IF NOT EXISTS idx_health_check_runs_checked_at ON health_check_runs(checked_at DESC);
