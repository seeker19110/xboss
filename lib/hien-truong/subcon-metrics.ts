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
import { query, queryOne } from "@/lib/db";

export type ChiSoThauPhu = {
  // % công việc đúng hạn (suy từ schedule_score 1–5)
  onTimeCompletionRate: number | null;
  // % nghiệm thu đạt (suy từ quality_score 1–5)
  bbntPassRate: number | null;
  // Điểm an toàn HSE (suy từ safety_score 1–5)
  hseSafetyScore: number | null;
  // Số NCR quy trách nhiệm cho nhà thầu phụ — chưa có nguồn (bảng `ncrs` không có cột
  // nhà thầu/nhà cung cấp, chỉ gắn task + người được giao).
  ncrIncidentCount: number | null;
  // % phát sinh chi phí ngoài hợp đồng — chưa có nguồn gắn với hồ sơ thầu phụ M82.
  costVarianceRate: number | null;
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

  const thieuDuLieu: { chiSo: string; lyDo: string }[] = [
    {
      chiSo: "ncrIncidentCount",
      lyDo: "Bảng ncrs chưa có trường quy trách nhiệm cho nhà thầu phụ nên không đếm được.",
    },
    {
      chiSo: "costVarianceRate",
      lyDo: "Chưa có nguồn gắn phát sinh chi phí với hồ sơ thầu phụ.",
    },
  ];

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
      ncrIncidentCount: null,
      costVarianceRate: null,
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
    ncrIncidentCount: null,
    costVarianceRate: null,
    thieuDuLieu,
    soKyDanhGia,
  };
}
