// lib/ky-thuat/cad/dashboard.ts — Hậu trường trang chuẩn hóa bản vẽ `/engineering/chuan-hoa-ban-ve`
/**
 * Gộp 5 mảnh nhỏ cùng phục vụ một trang (`bang-dieu-khien` + `boq-map` + `gioi-han` +
 * `plugin-package` + `plugin-upload`):
 *
 *   • Bảng điều khiển — số liệu tổng hợp hiện trên trang.
 *   • Map mã BOQ theo dự án — nối hạng mục bóc tách của rule pack với sổ khối lượng.
 *   • Giới hạn dung lượng — trần kích thước tệp nhận vào.
 *   • Gói cài plugin — đọc metadata gói phát hành cho kỹ sư tải về.
 *   • Nhận bản vẽ do plugin đẩy lên — kiểm DXF rồi ghi revision.
 */

import { query, run, withProjectScope, queryOne, insertId } from "@/lib/db";
import { getCurrentRulePack } from "@/lib/ky-thuat/cad/rule-pack";
import { layLichSuBlockLib } from "@/lib/ky-thuat/cad/block";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { storagePut } from "@/lib/nen/storage";
import { newDrawingRevisionFileName } from "@/lib/nen/photos";
import { validateDxf, parseDxf } from "@/lib/ky-thuat/cad/dxf-parser";

// ===== bang-dieu-khien.ts =====
// M99 PR6 — dữ liệu cho BẢNG ĐIỀU KHIỂN PLUGIN AUTOCAD trên web (§13):
// rule pack đang phát hành + lịch sử bản vẽ do plugin tải lên kèm kết quả kiểm định server.
// Thuần miền kỹ thuật, không biết gì về HTTP (ADR-0008) — route chỉ bọc NextResponse.

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
  /** Các bước chuẩn hoá đã chạy (standardize_report.steps, sinh bởi StandardizeReport.cs) —
   * rỗng khi báo cáo không kèm hoặc không đúng dạng. */
  buoc: BuocChuanHoa[];
  /** Tóm tắt phối hợp xung đột liên hệ gửi kèm khi upload (M116 PR3) — null khi tệp gửi không kèm
   * sidecar (chưa chạy XBOSS_PHOIHOP_BAOCAO, hoặc rule pack chưa bật coordinationPolicy). */
  phoiHop: TomTatPhoiHop | null;
};

/** Một dòng theo lớp kiểm trong tóm tắt phối hợp (khớp PhoiHopTomTatLop bên plugin). */
export type TomTatPhoiHopLop = {
  lop: string;
  nhan: string;
  tongSo: number;
  soCung: number;
  soMem: number;
  soCanhBao: number;
  soChuaXuLy: number;
  soChapNhan: number;
  soBoQua: number;
};

/** Tóm tắt phối hợp xung đột liên hệ của 1 revision (khớp PhoiHopTomTat bên plugin, M116 PR3). */
export type TomTatPhoiHop = {
  tongSo: number;
  soCung: number;
  soMem: number;
  soCanhBao: number;
  soChuaXuLy: number;
  soChapNhan: number;
  soBoQua: number;
  theoLop: TomTatPhoiHopLop[];
};

/** Một dòng diff chuẩn hoá — khớp StepDiff bên plugin (buoc/hangMuc/truoc/sau/soLuong). */
export type BuocChuanHoa = {
  buoc: string;
  hangMuc: string;
  truoc: string;
  sau: string;
  soLuong: number;
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

type PhoiHopLopRaw = {
  lop?: unknown;
  nhan?: unknown;
  tongSo?: unknown;
  soCung?: unknown;
  soMem?: unknown;
  soCanhBao?: unknown;
  soChuaXuLy?: unknown;
  soChapNhan?: unknown;
  soBoQua?: unknown;
};

/** Bóc tóm tắt phối hợp ra khỏi standardize_report.phoiHop (M116 PR3 — sidecar PhoiHopTomTat của
 * plugin) — đọc phòng thủ (duck-typing), thiếu/sai dạng thì trả null thay vì sập cả trang
 * (thuần — test đơn vị được, cùng khuôn docKlBocTuBaoCao/docBuocTuBaoCao). */
export function docPhoiHopTuBaoCao(report: Record<string, unknown> | null): TomTatPhoiHop | null {
  const ph = report?.phoiHop;
  if (!ph || typeof ph !== "object") return null;
  const o = ph as {
    tongSo?: unknown;
    soCung?: unknown;
    soMem?: unknown;
    soCanhBao?: unknown;
    soChuaXuLy?: unknown;
    soChapNhan?: unknown;
    soBoQua?: unknown;
    theoLop?: unknown;
  };
  if (typeof o.tongSo !== "number") return null;

  const theoLop: TomTatPhoiHopLop[] = [];
  if (Array.isArray(o.theoLop)) {
    for (const raw of o.theoLop as PhoiHopLopRaw[]) {
      if (
        typeof raw?.lop !== "string" ||
        typeof raw.nhan !== "string" ||
        typeof raw.tongSo !== "number"
      ) {
        continue;
      }
      theoLop.push({
        lop: raw.lop,
        nhan: raw.nhan,
        tongSo: raw.tongSo,
        soCung: typeof raw.soCung === "number" ? raw.soCung : 0,
        soMem: typeof raw.soMem === "number" ? raw.soMem : 0,
        soCanhBao: typeof raw.soCanhBao === "number" ? raw.soCanhBao : 0,
        soChuaXuLy: typeof raw.soChuaXuLy === "number" ? raw.soChuaXuLy : 0,
        soChapNhan: typeof raw.soChapNhan === "number" ? raw.soChapNhan : 0,
        soBoQua: typeof raw.soBoQua === "number" ? raw.soBoQua : 0,
      });
    }
  }

  return {
    tongSo: o.tongSo,
    soCung: typeof o.soCung === "number" ? o.soCung : 0,
    soMem: typeof o.soMem === "number" ? o.soMem : 0,
    soCanhBao: typeof o.soCanhBao === "number" ? o.soCanhBao : 0,
    soChuaXuLy: typeof o.soChuaXuLy === "number" ? o.soChuaXuLy : 0,
    soChapNhan: typeof o.soChapNhan === "number" ? o.soChapNhan : 0,
    soBoQua: typeof o.soBoQua === "number" ? o.soBoQua : 0,
    theoLop,
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
    buoc: docBuocTuBaoCao(r.standardize_report),
    phoiHop: docPhoiHopTuBaoCao(r.standardize_report),
  }));
}

type StepDiffRaw = {
  buoc?: unknown;
  hangMuc?: unknown;
  truoc?: unknown;
  sau?: unknown;
  soLuong?: unknown;
};

/** Bóc danh sách bước chuẩn hoá ra khỏi standardize_report.steps (StandardizeReport.cs) — đọc
 * phòng thủ (duck-typing), thiếu/sai dạng thì bỏ qua từng dòng thay vì sập cả trang (thuần —
 * test đơn vị được). */
export function docBuocTuBaoCao(report: Record<string, unknown> | null): BuocChuanHoa[] {
  const steps = report?.steps;
  if (!Array.isArray(steps)) return [];
  const ra: BuocChuanHoa[] = [];
  for (const raw of steps as StepDiffRaw[]) {
    if (
      typeof raw?.buoc !== "string" ||
      typeof raw.hangMuc !== "string" ||
      typeof raw.truoc !== "string" ||
      typeof raw.sau !== "string" ||
      typeof raw.soLuong !== "number"
    ) {
      continue;
    }
    ra.push({
      buoc: raw.buoc,
      hangMuc: raw.hangMuc,
      truoc: raw.truoc,
      sau: raw.sau,
      soLuong: raw.soLuong,
    });
  }
  return ra;
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
  /** KL ĐO — số đo trực tiếp trên bản vẽ, CHƯA quy đổi (TakeoffLine.Quantity). */
  khoiLuong: number;
  boqCode: string;
  /** Hệ số quy đổi đã dùng (KL quy đổi = KL đo × hệ số) — null khi rule pack không khai hệ số
   * cho dòng này (KHÔNG suy đoán, KHÔNG mặc định 1 — xem TakeoffLine.HeSoQuyDoi). */
  heSoQuyDoi: number | null;
  /** Mô tả hệ số quy đổi bằng tiếng Việt (vd "hao hụt 5%") — rỗng khi không có hệ số. */
  moTaQuyDoi: string;
  /** KL QUY ĐỔI — cột RIÊNG, không trộn vào khoiLuong (TakeoffLine.KlQuyDoi); null khi không có
   * hệ số quy đổi cho dòng này. */
  klQuyDoi: number | null;
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
  heSoQuyDoi?: unknown;
  moTaQuyDoi?: unknown;
  klQuyDoi?: unknown;
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
      // 0 = rule pack không khai hệ số quy đổi cho dòng này (TakeoffLine.HeSoQuyDoi) — để trống,
      // KHÔNG suy đoán/mặc định 1. Chỉ hiện hệ số/mô tả/KL quy đổi khi plugin gửi hệ số > 0.
      const heSoQuyDoi =
        typeof raw.heSoQuyDoi === "number" && raw.heSoQuyDoi > 0 ? raw.heSoQuyDoi : null;
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
        heSoQuyDoi,
        moTaQuyDoi: heSoQuyDoi !== null && typeof raw.moTaQuyDoi === "string" ? raw.moTaQuyDoi : "",
        klQuyDoi: heSoQuyDoi !== null && typeof raw.klQuyDoi === "number" ? raw.klQuyDoi : null,
      });
    }
  }
  return ra;
}

// ===== boq-map.ts =====
// Map "hạng mục bóc tách của rule pack" → "Mã BOQ" THEO DỰ ÁN
// (M101 §6.3, PR4). Bảng `cad_takeoff_boq_map` (migration 0140), có RLS theo project_id nên mọi
// truy vấn ở đây bọc `withProjectScope` — thiếu GUC là policy chặn sạch, không phải trả nhầm.
//
// Ranh giới miền: tệp này CHỈ biết bảng map + rule pack (miền kỹ thuật). Việc ghép map với KL
// hợp đồng trong `boq_items` (miền khối lượng) nằm ở `lib/dich-vu/cad.ts` — phối
// hợp 2 miền thì lên tầng dịch vụ (ADR-0008), không kéo `khoi-luong` vào đây.

/** Một dòng map: hạng mục bóc tách ↔ mã BOQ của dự án. */
export type MaBoqTheoItem = { takeoffItemId: string; boqCode: string };

/** Trần độ dài mã BOQ khi nhập tay trên web — đủ rộng cho mọi mã thật, chặn dán nhầm cả đoạn. */
export const MAX_DAI_MA_BOQ = 64;

/** Id các hạng mục bóc tách của rule pack đang phát hành (nguồn kiểm id hợp lệ khi ghi). */
export function danhSachItemBocTach(): { id: string; name: string; group: string; unit: string }[] {
  return getCurrentRulePack().takeoff.items.map((i) => ({
    id: i.id,
    name: i.name,
    group: i.group,
    unit: i.unit,
  }));
}

/** Map của một dự án, sắp theo `takeoff_item_id` để kết quả (và ETag suy từ nó) ổn định. */
export async function layMapBoqTheoDuAn(projectId: number): Promise<MaBoqTheoItem[]> {
  return withProjectScope(projectId, () =>
    query<MaBoqTheoItem>(
      `SELECT takeoff_item_id AS "takeoffItemId", boq_code AS "boqCode"
         FROM cad_takeoff_boq_map
        WHERE project_id = ?
        ORDER BY takeoff_item_id`,
      projectId,
    ),
  );
}

export type KetQuaGhiMap = { ok: true; soGan: number; soGo: number } | { ok: false; loi: string };

/**
 * Ghi map của một dự án. Mã rỗng = GỠ dòng map (không lưu mã rỗng làm rác).
 *
 * Idempotent: upsert theo `(project_id, takeoff_item_id)` qua `ON CONFLICT` — bấm lưu hai lần
 * hoặc gửi lại khi mạng chập chờn không đẻ dòng thứ hai. Chỉ nhận id hạng mục CÓ THẬT trong rule
 * pack đang phát hành: id lạ (client tự bịa/rule pack cũ) bị từ chối cả lô thay vì ghi rác vào DB.
 */
export async function ghiMapBoqTheoDuAn(
  projectId: number,
  userId: number,
  items: MaBoqTheoItem[],
): Promise<KetQuaGhiMap> {
  const hopLe = new Set(danhSachItemBocTach().map((i) => i.id));
  const daThay = new Set<string>();
  const chuanHoa: MaBoqTheoItem[] = [];
  for (const item of items) {
    const id = String(item?.takeoffItemId ?? "").trim();
    const ma = String(item?.boqCode ?? "").trim();
    if (!hopLe.has(id)) {
      return {
        ok: false,
        loi: `Hạng mục bóc tách "${id}" không có trong rule pack đang phát hành`,
      };
    }
    if (daThay.has(id)) return { ok: false, loi: `Hạng mục "${id}" gửi trùng hai lần` };
    if (ma.length > MAX_DAI_MA_BOQ) {
      return { ok: false, loi: `Mã BOQ của "${id}" dài quá ${MAX_DAI_MA_BOQ} ký tự` };
    }
    daThay.add(id);
    chuanHoa.push({ takeoffItemId: id, boqCode: ma });
  }

  let soGan = 0;
  let soGo = 0;
  // readOnly: false — đây là đường GHI; withProjectScope mặc định mở transaction READ ONLY.
  await withProjectScope(
    projectId,
    async () => {
      for (const { takeoffItemId, boqCode } of chuanHoa) {
        if (boqCode === "") {
          const kq = await run(
            `DELETE FROM cad_takeoff_boq_map WHERE project_id = ? AND takeoff_item_id = ?`,
            projectId,
            takeoffItemId,
          );
          soGo += kq.changes;
        } else {
          await run(
            `INSERT INTO cad_takeoff_boq_map (project_id, takeoff_item_id, boq_code, updated_by)
             VALUES (?, ?, ?, ?)
             ON CONFLICT (project_id, takeoff_item_id)
             DO UPDATE SET boq_code = EXCLUDED.boq_code, updated_by = EXCLUDED.updated_by,
                           updated_at = NOW()`,
            projectId,
            takeoffItemId,
            boqCode,
            userId,
          );
          soGan++;
        }
      }
    },
    { readOnly: false },
  );
  return { ok: true, soGan, soGo };
}

/**
 * Gán mã BOQ của dự án vào danh sách hạng mục của rule pack (thuần — test đơn vị được).
 *
 * KHÔNG sửa tại chỗ: `getCurrentRulePack()` trả về đúng đối tượng JSON đã import (singleton dùng
 * chung cho mọi request) — sửa tại chỗ là rò mã BOQ của dự án này sang request của dự án khác.
 * Hạng mục không có trong map giữ nguyên `boqCode` gốc của rule pack.
 */
export function ganMaBoqVaoItems<T extends { id: string; boqCode: string }>(
  items: readonly T[],
  map: readonly MaBoqTheoItem[],
): T[] {
  const theoId = new Map(map.map((m) => [m.takeoffItemId, m.boqCode]));
  return items.map((i) => {
    const ma = theoId.get(i.id);
    return ma ? ({ ...i, boqCode: ma } as T) : i;
  });
}

// ===== gioi-han.ts =====

// Ngưỡng dùng chung cho đường CAD — đặt ở lib/ chứ không ở route, vì cả route nạp lên lẫn
// route lưu đều cần cùng một con số (ADR-0008: route chỉ là ranh giới HTTP).

/**
 * Trần dung lượng tệp CAD nạp lên và lưu lại (byte).
 *
 * Vì sao cần: cả đường nạp lên lẫn đường lưu đều KHÔNG có giới hạn nào — client đọc trọn tệp
 * thành ArrayBuffer → base64 (phình 1,33×) → nhét vào một body JSON → `Buffer.from` trên máy chủ.
 * Đối chiếu phần còn lại của hệ thống: ảnh hiện trường 10 MB, biên bản nghiệm thu 20 MB; riêng
 * CAD — loại tệp lớn nhất trong cả app — thì bỏ ngỏ (audit 2026-08-24).
 *
 * Chọn 150 MB: bản vẽ MEPF thật của dự án đo được **~50 MB** (người dùng xác nhận 2026-08-24), nên
 * trần này để 3× dư địa. Đây là van an toàn chống tràn bộ nhớ máy chủ, không phải chính sách
 * nghiệp vụ — con số chưa có căn cứ từ đặc tả, cần chủ spec chốt lại.
 */
export const GIOI_HAN_TEP_CAD = 150 * 1024 * 1024;

/**
 * Ước lượng số byte thật của một chuỗi base64 mà KHÔNG giải mã nó.
 *
 * Phải ước lượng trước: giải mã rồi mới đo thì đã tốn đúng số bộ nhớ đang muốn tránh. Base64 mã
 * 3 byte thành 4 ký tự, và `=` ở cuối là ký tự đệm không mang dữ liệu.
 */
export function uocLuongByteTuBase64(chuoi: string): number {
  if (!chuoi) return 0;
  const demDem = chuoi.endsWith("==") ? 2 : chuoi.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((chuoi.length * 3) / 4) - demDem);
}

// ===== plugin-package.ts =====
// Thông tin gói cài plugin AutoCAD lộ ra web (§13 P8).
//
// Vì sao cần: kỹ sư tải gói cài về (qua XBOSS_PLUGIN_URL, xem route dashboard) không có cách
// nào tự xác minh mình tải đúng bản — nguồn sự thật của version là thẻ <Version> trong
// plugin-autocad/Directory.Build.props (dong-goi.ps1 đọc đúng thẻ này lúc đóng gói), sha256
// chỉ có khi quản trị khai kèm biến môi trường XBOSS_PLUGIN_SHA256 (đi kèm XBOSS_PLUGIN_URL,
// vì gói KHÔNG build trong CI/không nhúng nhị phân vào repo — không có nơi nào trong repo tự
// tính được sha256 của gói đang phát hành).
//
// Đọc TỆP TRÊN ĐĨA nên chỉ dùng được ở phía server (route API) — đọc lỗi/thiếu tệp thì trả
// null, KHÔNG bịa số (fail mềm, UI tự ẩn mục tương ứng).

const DUONG_DAN_PROPS = path.join(process.cwd(), "plugin-autocad", "Directory.Build.props");

/** Hàm thuần: bóc version từ nội dung Directory.Build.props. null nếu không có thẻ `<Version>`. */
export function bocVersionTuNoiDung(noiDung: string): string | null {
  const khop = noiDung.match(/<Version>([^<]+)<\/Version>/);
  const version = khop?.[1]?.trim();
  return version || null;
}

/** Đọc version gói cài từ thẻ `<Version>` trong Directory.Build.props. null nếu thiếu tệp/thẻ. */
export async function docVersionGoiCai(): Promise<string | null> {
  try {
    const noiDung = await readFile(DUONG_DAN_PROPS, "utf-8");
    return bocVersionTuNoiDung(noiDung);
  } catch {
    return null;
  }
}

/** Thông tin gói cài để lộ ra web: version (đọc từ tệp) + sha256 (chỉ có khi khai qua biến môi trường). */
export type ThongTinGoiCai = {
  version: string | null;
  sha256: string | null;
};

export async function layThongTinGoiCai(): Promise<ThongTinGoiCai> {
  const version = await docVersionGoiCai();
  const sha256Raw = process.env.XBOSS_PLUGIN_SHA256?.trim().toLowerCase() || null;
  // Chỉ hiện sha256 hợp lệ (64 ký tự hex) — biến môi trường gõ nhầm không nên hiện ra như
  // một checksum thật để kỹ sư đối chiếu nhầm.
  const sha256 = sha256Raw && /^[0-9a-f]{64}$/.test(sha256Raw) ? sha256Raw : null;
  return { version, sha256 };
}

// ===== plugin-upload.ts =====
// M99 PR5 — nhận bản vẽ từ plugin AutoCAD (XBOSS_UPLOAD): DWG + DXF sidecar + báo cáo
// chuẩn hóa + version rule pack. Server KHÔNG tin client (FR10): kiểm định lại DXF sidecar
// bằng chính parser tầng 3 (lib/ky-thuat/cad/dxf-parser — đã tôi luyện qua 6 vòng đối chiếu
// AutoCAD thật, xem PROGRESS.md) + đối chiếu version rule pack đang phát hành; sai → trả
// danh sách lỗi, KHÔNG tạo revision (AC5). Điểm lệch spec có chủ đích: spec FR10 nhắc
// "ezdxf" (worker Python) — dùng parser TS sẵn có thay vì thêm cả một stack Python chỉ để
// kiểm cấu trúc DXF; cùng tinh thần "server kiểm định lại, không đọc DWG".
//
// Idempotent theo hash nội dung DWG (M99 §12): cùng drawing + cùng sha256 → trả revision
// đã có, không tạo đôi; cùng rev nhưng nội dung khác → báo xung đột cho kỹ sư tự tăng rev.

export type PluginUploadValidation = {
  ok: boolean;
  /** Lỗi chặn (422 — không tạo revision). */
  errors: string[];
  /** Cảnh báo không chặn — ghi vào standardize_report để người duyệt thấy. */
  warnings: string[];
  /** Số liệu DXF đo được phía server (đối chứng với báo cáo client gửi). */
  stats?: { layers: number; entities: number };
};

export type PluginUploadKetQua =
  | { status: "invalid"; validation: PluginUploadValidation }
  | { status: "rev-conflict"; message: string }
  | { status: "created" | "idempotent"; validation: PluginUploadValidation; revisionId: number };

/** Kiểm định DXF sidecar + rule pack version — thuần, không chạm DB (test đơn vị được). */
export function kiemDinhPluginUpload(
  dxfText: string,
  rulePackVersion: string,
): PluginUploadValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  const packHienHanh = getCurrentRulePack();
  if (rulePackVersion !== packHienHanh.version) {
    // AC8: rule pack cache cũ bị CHẶN tải lên — kỹ sư chạy XBOSS_LOGIN cập nhật rồi chuẩn hóa lại.
    errors.push(
      `Rule pack ${rulePackVersion} không phải bản đang phát hành (${packHienHanh.version}) — ` +
        `chạy XBOSS_LOGIN cập nhật rule pack rồi chuẩn hóa lại trước khi tải lên.`,
    );
  }

  const cauTruc = validateDxf(dxfText);
  if (!cauTruc.valid) {
    errors.push(...cauTruc.errors.map((e) => `DXF sidecar lỗi cấu trúc: ${e}`));
  }

  let stats: PluginUploadValidation["stats"];
  if (cauTruc.valid) {
    try {
      const dxf = parseDxf(dxfText);
      stats = { layers: dxf.layers.length, entities: dxf.entities.length };
      if (dxf.entities.length === 0) {
        errors.push("DXF sidecar không có thực thể nào — sai tệp hoặc xuất hỏng.");
      }
    } catch (e) {
      errors.push(`Không parse được DXF sidecar: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { ok: errors.length === 0, errors, warnings, stats };
}

/**
 * Xử lý trọn một lượt tải lên từ plugin. Drawing đã được route xác minh thuộc dự án
 * người dùng (ranh giới HTTP lo scope — ADR-0008); hàm này lo kiểm định + ghi sổ.
 */
export async function xuLyPluginUpload(input: {
  drawingId: number;
  orgId: number;
  userId: number;
  rev: string;
  rulePackVersion: string;
  dwg: Buffer;
  dwgName: string;
  dxfText: string;
  report: Record<string, unknown> | null;
  /** M101 §6.4 (PR5): sidecar JSON kết quả bóc khối lượng (TakeoffJsonReport), TÙY CHỌN — lưu
   * nguyên vào standardize_report khối "takeoff". KHÔNG BAO GIỜ ghi vào bảng BOQ (đường ghi sổ
   * duy nhất giữ nguyên); upload không kèm khối này vẫn chạy y hệt trước PR5. */
  takeoff?: Record<string, unknown> | null;
  /** M116 PR3 §6 bước 5: sidecar JSON tóm tắt phối hợp xung đột liên hệ (PhoiHopTomTat), TÙY CHỌN
   * — lưu nguyên vào standardize_report khối "phoiHop". Upload không kèm khối này vẫn chạy y hệt
   * trước M116 (chưa chạy XBOSS_PHOIHOP_BAOCAO, hoặc rule pack chưa bật coordinationPolicy). */
  phoiHop?: Record<string, unknown> | null;
}): Promise<PluginUploadKetQua> {
  const validation = kiemDinhPluginUpload(input.dxfText, input.rulePackVersion);
  if (!validation.ok) return { status: "invalid", validation };

  const hash = createHash("sha256").update(input.dwg).digest("hex");

  // Idempotency: đúng tệp này đã có revision → trả lại, không ghi gì thêm.
  const daCo = await queryOne<{ id: number }>(
    `SELECT id FROM drawing_revisions WHERE drawing_id = ? AND content_sha256 = ?`,
    input.drawingId,
    hash,
  );
  if (daCo) return { status: "idempotent", validation, revisionId: daCo.id };

  // Cùng rev nhưng nội dung khác — không lặng lẽ đè (UNIQUE drawing_id+rev sẽ nổ):
  const trungRev = await queryOne<{ id: number }>(
    `SELECT id FROM drawing_revisions WHERE drawing_id = ? AND rev = ?`,
    input.drawingId,
    input.rev,
  );
  if (trungRev) {
    return {
      status: "rev-conflict",
      message: `Rev "${input.rev}" đã tồn tại với nội dung khác — tăng rev (VD ${input.rev} → kế tiếp) rồi tải lại.`,
    };
  }

  const fileName = newDrawingRevisionFileName(input.drawingId, input.rev, "application/acad");
  await storagePut(input.orgId, fileName, input.dwg);
  // DXF sidecar + báo cáo đặt cạnh DWG cùng quy ước tên — server/QS đọc lại được không cần AutoCAD.
  await storagePut(input.orgId, `${fileName}.sidecar.dxf`, Buffer.from(input.dxfText, "utf8"));

  const revisionId = await insertId(
    `INSERT INTO drawing_revisions
       (drawing_id, rev, file_name, original_name, mime_type, size_bytes, status, submitted_at,
        uploaded_by, source_tool, rule_pack_version, standardize_report, content_sha256)
     VALUES (?, ?, ?, ?, 'application/acad', ?, 'submitted', CURRENT_DATE, ?, 'plugin', ?, ?::jsonb, ?)`,
    input.drawingId,
    input.rev,
    fileName,
    input.dwgName,
    input.dwg.length,
    input.userId,
    input.rulePackVersion,
    JSON.stringify({
      ...(input.report ?? {}),
      ...(input.takeoff ? { takeoff: input.takeoff } : {}),
      ...(input.phoiHop ? { phoiHop: input.phoiHop } : {}),
      serverValidation: validation,
    }),
    hash,
  );
  return { status: "created", validation, revisionId };
}
