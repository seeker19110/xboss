// M99 PR6 — dữ liệu cho BẢNG ĐIỀU KHIỂN PLUGIN AUTOCAD trên web (§13):
// rule pack đang phát hành + lịch sử bản vẽ do plugin tải lên kèm kết quả kiểm định server.
// Thuần miền kỹ thuật, không biết gì về HTTP (ADR-0008) — route chỉ bọc NextResponse.
import { query } from "@/lib/db";
import { getCurrentRulePack } from "@/lib/ky-thuat/cad/rule-pack";
import { layLichSuBlockLib } from "@/lib/ky-thuat/cad/block-lib";

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
  /** KL đã bóc gửi kèm khi upload (M101 §6.4, PR5) — null khi tệp gửi không kèm sidecar. */
  klBoc: TomTatKlBoc | null;
};

/** Tóm tắt KL bóc của 1 revision — nhóm theo hệ/vùng (kèm đơn vị vì rule pack có nhiều item
 * khác đơn vị nhau, cộng lẫn là sai) để vẽ biểu đồ nhỏ trên bảng điều khiển. */
export type TomTatKlBoc = {
  tongDong: number;
  theoHe: { nhan: string; khoiLuong: number }[];
  theoVung: { nhan: string; khoiLuong: number }[];
};

type TakeoffJsonLine = {
  group?: unknown;
  vung?: unknown;
  khoiLuong?: unknown;
  donVi?: unknown;
};

/** Bóc KL bóc ra khỏi standardize_report.takeoff (M101 §6.4 — sidecar TakeoffJsonReport của
 * plugin), gộp theo (hệ, đơn vị) và (vùng, đơn vị) — thuần, test đơn vị được. */
export function docKlBocTuBaoCao(report: Record<string, unknown> | null): TomTatKlBoc | null {
  const tk = report?.takeoff;
  if (!tk || typeof tk !== "object") return null;
  const lines = (tk as { lines?: unknown }).lines;
  if (!Array.isArray(lines) || lines.length === 0) return null;

  const gopHe = new Map<string, number>();
  const gopVung = new Map<string, number>();
  for (const raw of lines as TakeoffJsonLine[]) {
    const he = typeof raw.group === "string" ? raw.group : "";
    const vung = typeof raw.vung === "string" ? raw.vung : "";
    const donVi = typeof raw.donVi === "string" ? raw.donVi : "";
    const kl = typeof raw.khoiLuong === "number" ? raw.khoiLuong : 0;
    if (he) gopHe.set(`${he} (${donVi})`, (gopHe.get(`${he} (${donVi})`) ?? 0) + kl);
    if (vung) gopVung.set(`${vung} (${donVi})`, (gopVung.get(`${vung} (${donVi})`) ?? 0) + kl);
  }

  return {
    tongDong: lines.length,
    theoHe: [...gopHe.entries()].map(([nhan, khoiLuong]) => ({ nhan, khoiLuong })),
    theoVung: [...gopVung.entries()].map(([nhan, khoiLuong]) => ({ nhan, khoiLuong })),
  };
}

/** Tóm tắt rule pack đang phát hành — plugin tải bản đầy đủ qua /api/engineering/cad/rule-pack. */
export function tomTatRulePack(): TomTatRulePack {
  const pack = getCurrentRulePack();
  return {
    version: pack.version,
    soNhomLayer: pack.layerMap.groups.length,
    soHangMucBocTach: pack.takeoff.items.length,
  };
}

/** Một bản phát hành thư viện block, rút gọn cho bảng điều khiển (M100 PR2 §13). */
export type TomTatBlockLib = {
  version: string;
  soBlock: number;
  dwgSha256: string;
  nguoiPhatHanh: string | null;
  ngayPhatHanh: string | null;
};

/**
 * Thư viện block: bản hiện hành + lịch sử phát hành. Thư viện là append-only nên bản mới nhất
 * chính là bản hiện hành — lấy một lượt rồi tách, không truy vấn hai lần.
 */
export async function layTomTatBlockLib(
  limit = 10,
): Promise<{ hienHanh: TomTatBlockLib | null; lichSu: TomTatBlockLib[] }> {
  const rows = await layLichSuBlockLib(limit);
  const lichSu = rows.map((r) => ({
    version: r.version,
    soBlock: r.manifest?.blocks?.length ?? 0,
    dwgSha256: r.dwgSha256,
    nguoiPhatHanh: r.nguoiPhatHanh,
    ngayPhatHanh: r.createdAt,
  }));
  return { hienHanh: lichSu[0] ?? null, lichSu };
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
    klBoc: docKlBocTuBaoCao(r.standardize_report),
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

/** Một dòng phẳng cho Excel gộp (nút "Tải Excel gộp" trên bảng điều khiển, M101 §6.4) — nguồn là
 * KL đã bóc gửi kèm khi XBOSS_UPLOAD (không đọc DWG, không đụng bảng BOQ). */
export type DongTakeoffExport = {
  drawingCode: string;
  drawingName: string;
  rev: string;
  he: string;
  ten: string;
  size: string;
  vung: string;
  donVi: string;
  khoiLuong: number;
  boqCode: string;
};

type DongTakeoffRaw = {
  itemId?: unknown;
  boqCode?: unknown;
  group?: unknown;
  ten?: unknown;
  donVi?: unknown;
  khoiLuong?: unknown;
  size?: unknown;
  vung?: unknown;
};

/**
 * Toàn bộ dòng KL đã bóc, phẳng hoá từ mọi revision plugin trong dự án — nguồn cho Excel gộp
 * trên web (KHÁC với Excel mẫu công ty do plugin XBOSS_BOCKL_XUAT/XBOSS_BATCH xuất tại máy kỹ
 * sư; đây là bản tổng hợp những gì đã GỬI VỀ SERVER, phục vụ PM/QS xem nhanh không cần AutoCAD).
 */
export async function layDongTakeoffChoExport(projectId: number): Promise<DongTakeoffExport[]> {
  const rows = await query<{
    code: string;
    name: string;
    rev: string;
    standardize_report: Record<string, unknown> | null;
  }>(
    `SELECT d.code, d.name, r.rev, r.standardize_report
       FROM drawing_revisions r
       JOIN drawings d ON d.id = r.drawing_id
      WHERE r.source_tool = 'plugin' AND d.project_id = ?
      ORDER BY r.id ASC`,
    projectId,
  );

  const ra: DongTakeoffExport[] = [];
  for (const r of rows) {
    const tk = r.standardize_report?.takeoff;
    const lines = tk && typeof tk === "object" ? (tk as { lines?: unknown }).lines : undefined;
    if (!Array.isArray(lines)) continue;
    for (const raw of lines as DongTakeoffRaw[]) {
      ra.push({
        drawingCode: r.code,
        drawingName: r.name,
        rev: r.rev,
        he: typeof raw.group === "string" ? raw.group : "",
        ten: typeof raw.ten === "string" ? raw.ten : "",
        size: typeof raw.size === "string" ? raw.size : "",
        vung: typeof raw.vung === "string" ? raw.vung : "",
        donVi: typeof raw.donVi === "string" ? raw.donVi : "",
        khoiLuong: typeof raw.khoiLuong === "number" ? raw.khoiLuong : 0,
        boqCode: typeof raw.boqCode === "string" ? raw.boqCode : "",
      });
    }
  }
  return ra;
}
