import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { query, queryOne, insertId, run } from "@/lib/db";
import { getCurrentUser, type Role } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { assertModuleEnabled } from "@/lib/feature-flags";
import { isContentTooLarge } from "@/lib/photos";

export const dynamic = "force-dynamic";

const canEditMaterials = (r?: Role) => r === "admin" || r === "pm" || r === "engineer";

// 20MB — khớp ngưỡng file Excel import khác (/api/import/excel, /api/boq/import).
const MAX_BYTES = 20 * 1024 * 1024;

const VALID_STATUSES = ["dat_hang", "ve_kho", "da_dung"];

const IGNORE_SHEET_PATTERNS = [
  /HUONG_DAN/i,
  /HDSD/i,
  /GUIDE/i,
  /DASHBOARD/i,
  /KIEM_SOAT/i,
  /In phieu/i,
  /Phieu xuat/i,
];

type RowResult = {
  row: number;
  name: string;
  status: "ok" | "skip" | "error";
  message?: string;
};

function clean(v: unknown): string {
  return String(v ?? "")
    .replace(/\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function num(v: unknown): number {
  const n = Number(v);
  return isFinite(n) ? n : 0;
}

// POST /api/materials/import  body: FormData { file: File, mode: "append"|"replace", sheetId?: number }
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!canEditMaterials(user.role))
    return NextResponse.json({ error: "Không có quyền import vật tư" }, { status: 403 });

  const projectId = await getCurrentProjectId(user);
  if (projectId == null)
    return NextResponse.json({ error: "Chưa có dự án nào để import vật tư" }, { status: 422 });
  const blocked = await assertModuleEnabled("materials", projectId);
  if (blocked) return blocked;

  if (isContentTooLarge(req.headers.get("content-length"), MAX_BYTES))
    return NextResponse.json(
      { error: `File quá lớn (tối đa ${MAX_BYTES / 1024 / 1024}MB)` },
      { status: 413 },
    );

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Không đọc được form" }, { status: 400 });

  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "Thiếu file" }, { status: 400 });

  const mode = String(form.get("mode") ?? "append"); // append | replace
  const defaultSheetId = parseInt(String(form.get("sheetId") ?? "")) || null;

  const buf = Buffer.from(await file.arrayBuffer());
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buf, { type: "buffer" });
  } catch {
    return NextResponse.json(
      { error: "File không đúng định dạng Excel (.xlsx/.xls)" },
      { status: 400 },
    );
  }

  if (!wb.SheetNames || wb.SheetNames.length === 0) {
    return NextResponse.json({ error: "File không có sheet nào" }, { status: 400 });
  }

  // Chọn sheet dữ liệu: ưu tiên 'Data-BOQ', '02_MAU_BOQ_TRONG', 'Vật tư', hoặc sheet đầu tiên không phải hướng dẫn
  let targetSheetName: string =
    wb.SheetNames.find((s) => s === "Data-BOQ" || s === "02_MAU_BOQ_TRONG" || s === "Vật tư") ??
    wb.SheetNames.find((s) => !IGNORE_SHEET_PATTERNS.some((p) => p.test(s))) ??
    wb.SheetNames[0];

  const ws = wb.Sheets[targetSheetName];
  if (!ws)
    return NextResponse.json(
      { error: `Không đọc được sheet "${targetSheetName}"` },
      { status: 400 },
    );

  const raw: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
  if (!raw.length) return NextResponse.json({ error: "Sheet không có dữ liệu" }, { status: 400 });

  // Dò dòng tiêu đề và ánh xạ cột
  let headerRow = -1;
  const colMap = {
    code: -1,
    name: -1,
    unit: -1,
    qtyBoq: -1,
    qtyPlanned: -1,
    status: -1,
    note: -1,
  };

  for (let i = 0; i < Math.min(raw.length, 30); i++) {
    const r = raw[i];
    if (!r) continue;

    let foundName = false;
    r.forEach((cell, idx) => {
      const c = clean(cell).toLowerCase();
      if (c.includes("mã boq") || c === "mãboq" || c === "mã hàng") colMap.code = idx;
      if (c.includes("mô tả") || c.includes("tên vật tư") || c === "vật tư" || c === "diễn giải") {
        colMap.name = idx;
        foundName = true;
      }
      if (c === "đơn vị" || c === "đvt" || c === "dvt") colMap.unit = idx;
      if (c.includes("khối lượng boq") || c.includes("định mức boq") || c.includes("kl boq"))
        colMap.qtyBoq = idx;
      if (
        c.includes("khối lượng định mức") ||
        c.includes("định mức tháp a") ||
        c.includes("kl định mức")
      )
        colMap.qtyPlanned = idx;
      if (c.includes("trạng thái") || c === "status") colMap.status = idx;
      if (c.includes("ghi chú") || c === "note") colMap.note = idx;
    });

    if (foundName) {
      headerRow = i;
      break;
    }
  }

  if (headerRow === -1 || colMap.name === -1) {
    return NextResponse.json(
      {
        error:
          "Không tìm thấy dòng tiêu đề hợp lệ. Cần có cột 'Tên vật tư *' hoặc 'MÔ TẢ' / 'Vật tư' / 'Mã BOQ'.",
      },
      { status: 400 },
    );
  }

  // Danh sách hệ (sheet_types) để tra mã prefix → id
  const sheetTypes = await query<{ id: number; code: string }>(
    `SELECT id, code FROM sheet_types ORDER BY id`,
  );
  const sheetMap = new Map(sheetTypes.map((s) => [s.code.trim().toLowerCase(), s.id]));

  const results: RowResult[] = [];
  let inserted = 0;
  let skipped = 0;
  let errors = 0;

  // mode=replace với hệ được chọn: xoá vật tư của hệ đó trong dự án hiện tại
  if (mode === "replace" && defaultSheetId) {
    await run(
      `DELETE FROM materials WHERE sheet_type_id = ? AND project_id = ?`,
      defaultSheetId,
      projectId,
    );
  }

  // sort_order counter: null key = vật tư không có hệ
  const sortCounters = new Map<number | null, number>();
  const getCounter = async (sid: number | null): Promise<number> => {
    if (!sortCounters.has(sid)) {
      if (mode === "replace" || sid === null) {
        sortCounters.set(sid, 1);
      } else {
        const maxRow = await queryOne<{ m: number | null }>(
          `SELECT MAX(sort_order) AS m FROM materials WHERE sheet_type_id ${sid === null ? "IS NULL" : "= ?"}`,
          ...(sid !== null ? [sid] : []),
        );
        sortCounters.set(sid, (maxRow?.m ?? 0) + 1);
      }
    }
    const val = sortCounters.get(sid)!;
    sortCounters.set(sid, val + 1);
    return val;
  };

  for (let i = headerRow + 1; i < raw.length; i++) {
    const r = raw[i];
    if (!r) continue;
    const rowNum = i + 1;

    const name = colMap.name >= 0 ? clean(r[colMap.name]) : "";
    const unit = colMap.unit >= 0 ? clean(r[colMap.unit]) || null : null;
    const boqCode = colMap.code >= 0 ? clean(r[colMap.code]) || null : null;
    const qtyBoq = colMap.qtyBoq >= 0 ? num(r[colMap.qtyBoq]) : 0;
    const qtyPlanned = colMap.qtyPlanned >= 0 ? num(r[colMap.qtyPlanned]) : 0;
    const note = colMap.note >= 0 ? clean(r[colMap.note]) || null : null;

    if (!name || name.startsWith("[Nhập")) {
      skipped++;
      results.push({
        row: rowNum,
        name: name || "—",
        status: "skip",
        message: "Bỏ qua (không có tên / mẫu trống)",
      });
      continue;
    }

    // Xác định sheetId: nếu mã có prefix (vd DHKK-...) thử map, nếu không dùng defaultSheetId
    let sheetId: number | null = defaultSheetId;
    if (boqCode) {
      const prefix = boqCode.split("-")[0]?.toLowerCase();
      if (prefix && sheetMap.has(prefix)) {
        sheetId = sheetMap.get(prefix)!;
      }
    }

    const sortOrder = await getCounter(sheetId);

    // Nếu mã BOQ đã tồn tại ở vật tư (trong dự án hiện tại) → cập nhật số liệu + sort_order
    if (boqCode) {
      const existing = await queryOne<{ id: number }>(
        `SELECT id FROM materials WHERE boq_code = ? AND project_id = ?`,
        boqCode,
        projectId,
      );
      if (existing) {
        await run(
          `UPDATE materials SET name=?, unit=?, qty_boq=?, qty_planned=?, note=?, sort_order=? WHERE id=? AND project_id=?`,
          name,
          unit,
          qtyBoq,
          qtyPlanned,
          note,
          sortOrder,
          existing.id,
          projectId,
        );
        inserted++;
        results.push({ row: rowNum, name, status: "ok", message: "Cập nhật" });
        continue;
      }
    }

    let status = colMap.status >= 0 ? clean(r[colMap.status]) : "dat_hang";
    if (!VALID_STATUSES.includes(status)) status = "dat_hang";

    try {
      await insertId(
        `INSERT INTO materials (sheet_type_id, boq_code, name, unit, qty_boq, qty_planned, qty_used, status, note, sort_order, project_id)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
        sheetId,
        boqCode,
        name,
        unit,
        qtyBoq,
        qtyPlanned,
        status,
        note,
        sortOrder,
        projectId,
      );
      inserted++;
      results.push({ row: rowNum, name, status: "ok" });
    } catch (e: unknown) {
      errors++;
      results.push({
        row: rowNum,
        name,
        status: "error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return NextResponse.json({
    inserted,
    skipped,
    errors,
    results,
    sheetUsed: targetSheetName,
  });
}
