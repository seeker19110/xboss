// V3 (audit 2026-08-24) — Chỉ số hiệu quả nhà thầu phụ dùng cho chấm điểm tín nhiệm
// (M82, engineering_subcon_performance_metrics).
//
// Trước đây route POST /api/engineering/subcon-ai/evaluate nhận thẳng chỉ số từ body
// kèm mặc định "đẹp" (onTimeRate ?? 90, bbntPassRate ?? 95...) — nghĩa là nhà thầu tự
// khai điểm của chính mình. Module này lấy chỉ số từ DỮ LIỆU HỆ THỐNG.
//
// Nguồn thật hiện có: bảng đánh giá định kỳ NTP `subcon_evaluations` (M33) — do PM/BCH
// chấm theo thang 1–5 cho an toàn/chất lượng/tiến độ. Chỉ số nào CHƯA có nguồn dữ liệu
// thật thì trả `null` kèm lý do, TUYỆT ĐỐI không thay bằng số mặc định.
//
// V4 (quyết định nghiệp vụ 2026-09-05): công thức chấm điểm chỉ còn 3 chỉ số
// (`onTimeCompletionRate`, `bbntPassRate`, `hseSafetyScore`). Hai chỉ số `ncrIncidentCount`
// và `costVarianceRate` đã bị BỎ HẲN — chúng chưa từng có bảng nguồn, luôn `null`, làm route
// chấm điểm luôn trả 422. Chúng không còn là "chỉ số thiếu dữ liệu" mà là "chỉ số không dùng
// nữa", nên cũng rời khỏi `thieuDuLieu`.
import { query, queryOne } from "@/lib/db";

export type ChiSoThauPhu = {
  // % công việc đúng hạn (suy từ schedule_score 1–5)
  onTimeCompletionRate: number | null;
  // % nghiệm thu đạt (suy từ quality_score 1–5)
  bbntPassRate: number | null;
  // Điểm an toàn HSE (suy từ safety_score 1–5)
  hseSafetyScore: number | null;
  // Danh sách chỉ số thiếu dữ liệu, kèm lý do (hiển thị nguyên văn cho người dùng).
  thieuDuLieu: { chiSo: string; lyDo: string }[];
  // Số kỳ đánh giá định kỳ đã dùng để tính (0 = chưa có đánh giá nào).
  soKyDanhGia: number;
};

// Thang 1–5 → phần trăm 0–100 (1 = 0%, 5 = 100%).
function thangSangPhanTram(diem: number): number {
  return Number((((diem - 1) / 4) * 100).toFixed(2));
}

/**
 * Tính chỉ số hiệu quả cho một hồ sơ thầu phụ M82 (`engineering_subcon_profiles`).
 * Hồ sơ phải đã gắn `supplier_id` thì mới nối được sang dữ liệu đánh giá định kỳ M33.
 */
export async function tinhChiSoThauPhu(
  projectId: number,
  profileId: string,
): Promise<ChiSoThauPhu | null> {
  const profile = await queryOne<{ supplierId: number | null }>(
    `SELECT supplier_id AS "supplierId"
       FROM engineering_subcon_profiles
      WHERE id = ? AND project_id = ?`,
    profileId,
    projectId,
  );
  if (!profile) return null;

  const thieuDuLieu: { chiSo: string; lyDo: string }[] = [];

  if (profile.supplierId == null) {
    thieuDuLieu.unshift(
      {
        chiSo: "onTimeCompletionRate",
        lyDo: "Hồ sơ chưa gắn nhà cung cấp (supplier_id) nên không lấy được đánh giá định kỳ.",
      },
      {
        chiSo: "bbntPassRate",
        lyDo: "Hồ sơ chưa gắn nhà cung cấp (supplier_id) nên không lấy được đánh giá định kỳ.",
      },
      {
        chiSo: "hseSafetyScore",
        lyDo: "Hồ sơ chưa gắn nhà cung cấp (supplier_id) nên không lấy được đánh giá định kỳ.",
      },
    );
    return {
      onTimeCompletionRate: null,
      bbntPassRate: null,
      hseSafetyScore: null,
      thieuDuLieu,
      soKyDanhGia: 0,
    };
  }

  const rows = await query<{
    soKy: number;
    schedule: number | null;
    quality: number | null;
    safety: number | null;
  }>(
    `SELECT COUNT(*)::int AS "soKy",
            AVG(schedule_score) AS schedule,
            AVG(quality_score) AS quality,
            AVG(safety_score) AS safety
       FROM subcon_evaluations
      WHERE supplier_id = ?`,
    profile.supplierId,
  );
  const agg = rows[0];
  const soKyDanhGia = Number(agg?.soKy ?? 0);

  const doi = (v: number | null | undefined, chiSo: string): number | null => {
    if (v == null) {
      thieuDuLieu.unshift({
        chiSo,
        lyDo: "Chưa có đánh giá định kỳ (subcon_evaluations) cho nhà thầu phụ này.",
      });
      return null;
    }
    return thangSangPhanTram(Number(v));
  };

  return {
    onTimeCompletionRate: doi(agg?.schedule, "onTimeCompletionRate"),
    bbntPassRate: doi(agg?.quality, "bbntPassRate"),
    hseSafetyScore: doi(agg?.safety, "hseSafetyScore"),
    thieuDuLieu,
    soKyDanhGia,
  };
}

/** Chuyên ngành chính của hồ sơ thầu phụ M82 — khớp chú thích cột trong migration 0115. */
export const CHUYEN_NGANH_THAU_PHU = [
  "HVAC",
  "PLUMBING",
  "ELECTRICAL",
  "FIRE_FIGHTING",
  "EXTRA_LOW_VOLTAGE",
  "GENERAL_MEPF",
] as const;
export type ChuyenNganhThauPhu = (typeof CHUYEN_NGANH_THAU_PHU)[number];

export type KetQuaTaoHoSo =
  { ok: true; id: string } | { ok: false; status: 404 | 409 | 422; error: string };

/**
 * Tạo hồ sơ thầu phụ M82 **từ một nhà cung cấp đã có** trong `suppliers`.
 *
 * VÌ SAO bắt buộc `supplierId` (audit 2026-08-25 §3.3): `engineering_subcon_profiles` từng
 * tự giữ `company_name`/`tax_code` với `supplier_id` chỉ là FK tuỳ chọn, nên cùng một nhà
 * thầu phụ có thể tồn tại hai bản ghi lệch tên/lệch mã số thuế giữa bảng này và
 * `subcontractor_profiles` (khoá chính là `supplier_id`) mà không cơ chế nào bắt được.
 * Nay danh tính chỉ có MỘT nguồn: `suppliers`. Tên công ty chép từ đó, không nhận từ client.
 */
export async function taoHoSoThauPhu(
  projectId: number,
  input: { supplierId: number; primaryDiscipline: string; taxCode?: string | null },
): Promise<KetQuaTaoHoSo> {
  const discipline = String(input.primaryDiscipline ?? "").trim();
  if (!CHUYEN_NGANH_THAU_PHU.includes(discipline as ChuyenNganhThauPhu)) {
    return {
      ok: false,
      status: 422,
      error: `Chuyên ngành không hợp lệ (nhận: ${CHUYEN_NGANH_THAU_PHU.join(", ")})`,
    };
  }

  const supplier = await queryOne<{ name: string }>(
    `SELECT name FROM suppliers WHERE id = ?`,
    input.supplierId,
  );
  if (!supplier) return { ok: false, status: 404, error: "Không tìm thấy nhà cung cấp" };

  const trung = await queryOne<{ id: string }>(
    `SELECT id FROM engineering_subcon_profiles WHERE project_id = ? AND supplier_id = ?`,
    projectId,
    input.supplierId,
  );
  if (trung)
    return { ok: false, status: 409, error: "Nhà cung cấp này đã có hồ sơ thầu phụ trong dự án" };

  const row = await queryOne<{ id: string }>(
    `INSERT INTO engineering_subcon_profiles
       (project_id, supplier_id, company_name, tax_code, primary_discipline)
     VALUES (?, ?, ?, ?, ?)
     RETURNING id`,
    projectId,
    input.supplierId,
    supplier.name,
    input.taxCode?.trim() || null,
    discipline,
  );
  return { ok: true, id: row!.id };
}
