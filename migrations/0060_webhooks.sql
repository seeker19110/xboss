-- 0060_webhooks.sql — M49 PR2: Webhook ra ngoài.
-- Cho phép hệ ngoài (Zapier/n8n/hệ nội bộ CĐT...) nhận sự kiện nghiệp vụ quan trọng của
-- XBoss (nghiệm thu task, duyệt VO/IPC, vật tư vượt định mức, yêu cầu nghiệm thu) qua HTTP
-- POST có ký HMAC-SHA256. Fire-and-forget: route nghiệp vụ chỉ INSERT webhook_deliveries,
-- cron /api/cron/deliver-webhooks gửi thật + retry theo backoff. Xem lib/webhooks.ts và
-- docs/nang-cap/M49-api-mo-sso.md (PR2).

CREATE TABLE IF NOT EXISTS webhooks (
  id SERIAL PRIMARY KEY,
  project_id INT REFERENCES projects(id) ON DELETE CASCADE,  -- NULL = mọi dự án
  url TEXT NOT NULL,
  secret TEXT NOT NULL,             -- HMAC-SHA256 ký payload. LỆCH QUY ƯỚC "secret qua env"
                                    -- CÓ CHỦ ĐÍCH: secret per-webhook do XBoss sinh, số lượng
                                    -- động theo cấu hình — không thể là biến môi trường.
  events TEXT[] NOT NULL,           -- whitelist WEBHOOK_EVENTS trong lib/webhooks.ts
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id BIGSERIAL PRIMARY KEY,
  webhook_id INT NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','ok','failed')),
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT,
  next_retry_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_due
  ON webhook_deliveries(next_retry_at) WHERE status = 'pending';

-- Gắn audit trigger (0049) lên bảng webhooks (cấu hình đẩy dữ liệu ra ngoài = nhạy cảm, M43).
-- audit_row_change() đã tồn tại từ 0049; DROP+CREATE cho idempotent.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['webhooks'] LOOP
    IF to_regclass(t) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS audit_%1$s ON %1$s', t);
      EXECUTE format(
        'CREATE TRIGGER audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON %1$s '
        'FOR EACH ROW EXECUTE FUNCTION audit_row_change()', t);
    END IF;
  END LOOP;
END $$;
