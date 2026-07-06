-- 0024_meetings_risks.sql — M13: biên bản họp + action item theo dõi tự động,
-- sổ rủi ro ma trận 5×5. Xem docs/nang-cap/M13-hop-rui-ro.md.

CREATE TABLE IF NOT EXISTS meetings (
  id SERIAL PRIMARY KEY,
  meeting_date DATE NOT NULL,
  kind TEXT NOT NULL DEFAULT 'weekly' CHECK (kind IN ('weekly','client','subcon','other')),
  title TEXT NOT NULL,
  attendees TEXT,
  content TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_meetings_date ON meetings(meeting_date);

CREATE TABLE IF NOT EXISTS meeting_actions (
  id SERIAL PRIMARY KEY,
  meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  assignee INTEGER REFERENCES users(id),
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','done','cancelled')),
  task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL, -- liên kết mềm tới task nếu có
  done_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_meeting_actions_meeting ON meeting_actions(meeting_id);
CREATE INDEX IF NOT EXISTS idx_meeting_actions_open ON meeting_actions(status, due_date);

-- Sổ rủi ro: score = probability × impact tính lúc query, không lưu.
CREATE TABLE IF NOT EXISTS risks (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,           -- R-0001
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL CHECK (category IN ('schedule','cost','quality','safety','material','other')),
  probability SMALLINT NOT NULL CHECK (probability BETWEEN 1 AND 5),
  impact SMALLINT NOT NULL CHECK (impact BETWEEN 1 AND 5),
  mitigation TEXT,
  owner INTEGER REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','mitigating','closed')),
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_risks_status ON risks(status);

-- Cảnh báo action sau họp quá hạn (assignee + Admin/PM), dedup theo meeting_action.
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS meeting_action_id INTEGER REFERENCES meeting_actions(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_notif_meeting_action
  ON notifications(user_id, meeting_action_id, type) WHERE meeting_action_id IS NOT NULL;
