-- 0139_cad_block_libs.sql — M100 PR2: thư viện block chuẩn có version cho bộ lệnh vẽ XBOSS_VE_*.
-- DDL theo M100 §11. Thêm thuần (CREATE TABLE / CREATE INDEX) — đi thẳng production theo DoD.
--
-- Cùng nguyên tắc append-only của rule pack (ADR-0006 nguyên tắc 1): sửa/thêm block = phát hành
-- version MỚI, không sửa version đã phát hành. `version` UNIQUE là chốt cứng cho việc đó, và
-- cũng là khoá idempotency: phát hành lại đúng tệp cũ trả về đúng dòng cũ, khác nội dung thì báo
-- xung đột thay vì lặng lẽ đè (lib/ky-thuat/cad/block-lib.ts).
--
-- Thư viện là tài nguyên TOÀN CỤC (M100 §18 đã chốt: bản đầu toàn cục, thư viện theo dự án để
-- phiên bản sau — §20) nên bảng KHÔNG mang org_id/project_id và không vào RLS; cùng lựa chọn
-- với cad_device_pairings (0135).

CREATE TABLE IF NOT EXISTS cad_block_libs (
  id BIGSERIAL PRIMARY KEY,
  version TEXT NOT NULL UNIQUE,            -- nhãn version thư viện do người phát hành đặt (vd 'b1')
  manifest JSONB NOT NULL,                 -- manifest M100 §11: blocks[] (id/blockName/kind/…)
  storage_key TEXT NOT NULL,               -- tên tệp .dwg do máy chủ sinh (lib/nen/storage.ts)
  dwg_sha256 TEXT NOT NULL,                -- hash tệp .dwg — client kiểm trước khi nhập block vào bản vẽ
  published_by BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Truy vấn chính: "version hiện hành" = dòng mới nhất, và lịch sử phát hành xếp mới → cũ.
CREATE INDEX IF NOT EXISTS idx_cad_block_libs_moi_nhat ON cad_block_libs(id DESC);

-- Audit trigger (0049) — phát hành thư viện là thao tác chuỗi cung ứng nội bộ (M100 §12: mọi
-- máy kỹ sư sẽ tải và nhập block này vào bản vẽ), phải có dấu vết ai phát hành gì lúc nào.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['cad_block_libs'] LOOP
    IF to_regclass(t) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS audit_%1$s ON %1$s', t);
      EXECUTE format(
        'CREATE TRIGGER audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON %1$s '
        'FOR EACH ROW EXECUTE FUNCTION audit_row_change()', t);
    END IF;
  END LOOP;
END $$;
