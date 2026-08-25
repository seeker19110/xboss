// M99 PR6 — dữ liệu cho BẢNG ĐIỀU KHIỂN PLUGIN AUTOCAD trên web (§13):
// rule pack đang phát hành + lịch sử bản vẽ do plugin tải lên kèm kết quả kiểm định server.
// Thuần miền kỹ thuật, không biết gì về HTTP (ADR-0008) — route chỉ bọc NextResponse.
import { query } from "@/lib/db";
import { getCurrentRulePack } from "@/lib/ky-thuat/cad/rule-pack";

export type TomTatRulePack = {
  version: string;
  /** Số nhóm hệ trong layerMap (HVAC, PLUMB, FIRE…). */
  soNhomLayer: number;
  /** Số hạng mục bóc tách khai trong rule pack. */
  soHangMucBocTach: number;
};

export type LuotPluginUpload = {
  revisionId: number;
  drawingId: number;
  drawingCode: string;
  drawingName: string;
  rev: string;
  status: string;
  submittedAt: string | null;
  rulePackVersion: string | null;
  nguoiTaiLen: string | null;
  /** Kiểm định phía server lúc ghi sổ (lưu trong standardize_report.serverValidation). */
  kiemDinh: { ok: boolean; soLoi: number; soCanhBao: number; canhBao: string[] } | null;
};

/** Tóm tắt rule pack đang phát hành — plugin tải bản đầy đủ qua /api/engineering/cad/rule-pack. */
export function tomTatRulePack(): TomTatRulePack {
  const pack = getCurrentRulePack();
  return {
    version: pack.version,
    soNhomLayer: pack.layerMap.groups.length,
    soHangMucBocTach: pack.takeoff.items.length,
  };
}

type Dong = {
  id: number;
  drawing_id: number;
  code: string;
  name: string;
  rev: string;
  status: string;
  submitted_at: string | null;
  rule_pack_version: string | null;
  nguoi: string | null;
  standardize_report: Record<string, unknown> | null;
};

/** Lịch sử bản vẽ do plugin AutoCAD tải lên (source_tool='plugin') trong phạm vi dự án. */
export async function layLichSuPluginUpload(
  projectId: number,
  limit = 20,
): Promise<LuotPluginUpload[]> {
  const rows = await query<Dong>(
    `SELECT r.id, r.drawing_id, d.code, d.name, r.rev, r.status, r.submitted_at,
            r.rule_pack_version, u.name AS nguoi, r.standardize_report
       FROM drawing_revisions r
       JOIN drawings d ON d.id = r.drawing_id
       LEFT JOIN users u ON u.id = r.uploaded_by
      WHERE r.source_tool = 'plugin' AND d.project_id = ?
      ORDER BY r.id DESC
      LIMIT ?`,
    projectId,
    limit,
  );

  return rows.map((r) => ({
    revisionId: r.id,
    drawingId: r.drawing_id,
    drawingCode: r.code,
    drawingName: r.name,
    rev: r.rev,
    status: r.status,
    submittedAt: r.submitted_at,
    rulePackVersion: r.rule_pack_version,
    nguoiTaiLen: r.nguoi,
    kiemDinh: docKiemDinhTuBaoCao(r.standardize_report),
  }));
}

/** Bóc kết quả kiểm định server ra khỏi standardize_report (thuần — test đơn vị được). */
export function docKiemDinhTuBaoCao(
  report: Record<string, unknown> | null,
): LuotPluginUpload["kiemDinh"] {
  const v = report?.serverValidation;
  if (!v || typeof v !== "object") return null;
  const o = v as { ok?: unknown; errors?: unknown; warnings?: unknown };
  const canhBao = Array.isArray(o.warnings) ? o.warnings.map(String) : [];
  return {
    ok: o.ok === true,
    soLoi: Array.isArray(o.errors) ? o.errors.length : 0,
    soCanhBao: canhBao.length,
    canhBao: canhBao.slice(0, 5),
  };
}
