# M73 — Nền Tảng Siêu Tính Toán Không Gian, Hàng Đợi Tác Vụ Kỹ Thuật Phân Tán & Sổ Cái Merkle Bất Biến (Quantum Foundation Core)

| Thuộc tính       | Giá trị                               |
| ---------------- | ------------------------------------- |
| Issue / Goal     | GOAL-2026-M73-QUANTUM-FOUNDATION-CORE |
| Spec owner       | Seeker / Chief Engineering Architect  |
| State            | **Approved for implementation**       |
| Người/ngày duyệt | Seeker / 2026-08-19                   |
| Cập nhật         | 2026-08-19                            |

> **Nguyên tắc bất biến:** Không làm chậm HTTP request loop; các tác vụ tính toán hình học nặng và sinh tài liệu kỹ thuật lớn phải đưa vào hàng đợi nền phân tán có độ bền cao; mọi bằng chứng nghiệm thu và sự kiện tiến độ được đóng dấu cây băm Merkle bất biến có khả năng xác thực không thể chối bỏ (Mathematical Non-repudiation).

---

## 1. Problem, vai trò và bằng chứng

### 1.1 Pain points theo vai trò

- **Giám đốc Dự án (PM) & Kiểm toán viên**: Cần bằng chứng toán học chứng minh dữ liệu tiến độ và hồ sơ nghiệm thu BBNT không bị can thiệp lùi ngày hoặc sửa đổi sau khi đã ký duyệt.
- **Kỹ sư Trưởng MEPF & Thiết kế**: Khi xử lý các mô hình phân đoạn Spool LOD 400 lớn và phân tích giao cắt không gian (Spatial Mesh Intersection), việc tính toán trực tiếp trong API request gây timeout ($> 30\text{s}$) hoặc làm treo ứng dụng.
- **Kỹ sư Hiện trường & QS**: Cần theo dõi tiến độ thực thi các tác vụ nền nặng (như bóc tách BOM hàng loạt, xuất PDF hồ sơ hoàn công nghìn trang) qua thanh tiến trình thời gian thực.

---

## 2. Outcome, metric và guardrail

- **Tốc độ tính toán không gian (Spatial Compute Throughput)**: Xử lý giao cắt đùn khối 3D và Voxel Clash check đạt $\ge 50,000$ phần tử/giây với bộ đệm Spatial Cache.
- **Độ tin cậy hàng đợi (Task Queue Reliability)**: Không mất tác vụ khi restart server; tự động phục hồi tác vụ kẹt quá hạn (Stale lease reclamation); chống chạy trùng nhờ PostgreSQL Advisory Locks.
- **Thời gian xác thực Merkle Proof (Verification Latency)**: Xác thực tính toàn vẹn của 1 bản ghi bất kỳ trong cây $100,000$ sự kiện trong $< 2\text{ms}$.
- **Guardrail an toàn**: Mọi thao tác truy vấn đều nằm dưới sự bảo vệ của RLS strict theo `project_id`.

---

## 3. Data Contract và DDL (Migration 0107)

File `migrations/0107_spatial_queue_merkle_ledger.sql`:

```sql
-- Migration: 0107_spatial_queue_merkle_ledger.sql
-- Mục đích: Hàng đợi tác vụ kỹ thuật phân tán, Sổ cái băm Merkle bất biến, và Bộ đệm tính toán không gian

CREATE TABLE IF NOT EXISTS engineering_async_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_type VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  priority INT NOT NULL DEFAULT 0,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  progress_percent NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
  worker_id VARCHAR(128),
  lease_expires_at TIMESTAMPTZ,
  retry_count INT NOT NULL DEFAULT 0,
  max_retries INT NOT NULL DEFAULT 3,
  result JSONB,
  error_message TEXT,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS engineering_merkle_roots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  batch_code VARCHAR(128) NOT NULL,
  merkle_root VARCHAR(64) NOT NULL,
  leaf_count INT NOT NULL,
  start_timestamp TIMESTAMPTZ NOT NULL,
  end_timestamp TIMESTAMPTZ NOT NULL,
  previous_root VARCHAR(64),
  signature_token VARCHAR(256) NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_merkle_roots_project_batch UNIQUE (project_id, batch_code)
);

CREATE TABLE IF NOT EXISTS engineering_spatial_compute_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  cache_key VARCHAR(128) NOT NULL,
  algorithm_version VARCHAR(32) NOT NULL,
  input_hash VARCHAR(64) NOT NULL,
  output_data JSONB NOT NULL,
  hit_count BIGINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_spatial_cache_key UNIQUE (project_id, cache_key)
);

ALTER TABLE engineering_async_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineering_merkle_roots ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineering_spatial_compute_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY rls_engineering_async_tasks ON engineering_async_tasks
  FOR ALL USING (project_id IN (SELECT project_id FROM project_members WHERE user_id = NULLIF(current_setting('app.current_user_id', true), '')::BIGINT));

CREATE POLICY rls_engineering_merkle_roots ON engineering_merkle_roots
  FOR ALL USING (project_id IN (SELECT project_id FROM project_members WHERE user_id = NULLIF(current_setting('app.current_user_id', true), '')::BIGINT));

CREATE POLICY rls_engineering_spatial_compute_cache ON engineering_spatial_compute_cache
  FOR ALL USING (project_id IN (SELECT project_id FROM project_members WHERE user_id = NULLIF(current_setting('app.current_user_id', true), '')::BIGINT));

CREATE INDEX IF NOT EXISTS idx_async_tasks_queue ON engineering_async_tasks(project_id, status, priority DESC, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_merkle_roots_proj ON engineering_merkle_roots(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_spatial_cache_lookup ON engineering_spatial_compute_cache(project_id, cache_key);
```

---

## 4. API Endpoints

| Phương thức | Endpoint                                   | Chức năng                                      | Phân quyền        |
| ----------- | ------------------------------------------ | ---------------------------------------------- | ----------------- |
| `POST`      | `/api/engineering/spatial/compute`         | Thực thi thuật toán hình học & đệm kết quả     | `ENGINEER`        |
| `GET/POST`  | `/api/engineering/queue/tasks`             | Truy vấn & Nạp tác vụ nặng vào hàng đợi nền    | `ENGINEER` / `PM` |
| `POST`      | `/api/engineering/queue/tasks/[id]/cancel` | Hủy tác vụ đang chờ trong hàng đợi             | `PM`              |
| `GET/POST`  | `/api/engineering/ledger/merkle`           | Đóng gói Merkle Tree cho batch sự kiện         | `PM` / `ADMIN`    |
| `POST`      | `/api/engineering/ledger/verify-proof`     | Xác minh toán học Merkle Proof của một bản ghi | `VIEWER`          |

---

## 5. Kế hoạch Kiểm thử & DoD

- [x] Schema migration số `0107` append-only, idempotent.
- [x] Viết unit & integration tests kiểm thử:
  - Spatial compute: Polyline 3D sweep volume, AABB spatial clash indexing, 2D sheet nesting.
  - Task Queue: Enqueue, claim task bằng advisory lock, heartbeat progress %, complete, cancel, lease expiration retry.
  - Merkle Ledger: Xây dựng cây Merkle, tính Root Hash SHA-256, sinh Merkle Proof $\pi$, và hàm verifyProof trả về đúng $100\%$.
- [x] Typecheck 0 lỗi, lint 0 lỗi, 107 migrations hợp lệ, toàn bộ test suite pass 100%.
