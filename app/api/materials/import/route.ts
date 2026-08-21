import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { queryOne, insertId, run } from "@/lib/db";
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
  code?: string | null;
  name: string;
  unit?: string | null;
  qtyBoq?: number;
  qtyPlanned?: number;
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
  if (v == null || v === "") return 0;
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, "").trim());
  return isFinite(n) ? n : 0;
}

// POST /api/materials/import
// body: FormData { file: File, mode: "append"|"replace", sheetId: string|number, sheetName?: string }
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
  if (!form) return NextResponse.json({ error: "Không đọc được form dữ liệu" }, { status: 400 });

  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "Thiếu file Excel" }, { status: 400 });

  const systemIdRaw = form.get("systemId") ?? form.get("sheetId");
  const targetSystemId = parseInt(String(systemIdRaw ?? "")) || null;
  if (!targetSystemId) {
    return NextResponse.json(
      { error: "Vui lòng chọn hệ MEPF trước khi import (HVAC, Điện, Cấp Thoát Nước, PCCC...)" },
      { status: 400 },
    );
  }

  // Xác minh systemId tồn tại trong systems hoặc sheet_types
  let system = await queryOne<{ id: number; name: string; code: string }>(
    `SELECT id, name, code FROM systems WHERE id = ?`,
    targetSystemId,
  );
  let defaultSheetId: number | null = null;

  if (system) {
    const defaultSheet = await queryOne<{ id: number }>(
      `SELECT id FROM sheet_types WHERE system_id = ? ORDER BY id LIMIT 1`,
      system.id,
    );
    defaultSheetId = defaultSheet?.id ?? null;
  } else {
    // Fallback: nếu truyền sheet_type_id
    const st = await queryOne<{ id: number; name: string; system_id: number | null }>(
      `SELECT id, name, system_id FROM sheet_types WHERE id = ?`,
      targetSystemId,
    );
    if (!st) {
      return NextResponse.json(
        { error: "Hệ đã chọn không tồn tại trong hệ thống" },
        { status: 400 },
      );
    }
    defaultSheetId = st.id;
    if (st.system_id) {
      system = await queryOne<{ id: number; name: string; code: string }>(
        `SELECT id, name, code FROM systems WHERE id = ?`,
        st.system_id,
      );
    }
  }

  const resolvedSystemId = system?.id ?? null;
  const mode = String(form.get("mode") ?? "append"); // append | replace
  const requestedSheetName = form.get("sheetName") ? String(form.get("sheetName")).trim() : null;

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
    return NextResponse.json({ error: "File Excel không có sheet nào" }, { status: 400 });
  }

  // Chọn sheet dữ liệu:
  // 1. Ưu tiên sheetName do người dùng chỉ định
  // 2. Ưu tiên 'Data-BOQ', 'Vật tư', 'BOQ'
  // 3. Ưu tiên sheet đầu tiên không phải sheet hướng dẫn / dashboard / in phiếu
  // 4. Fallback sheet đầu tiên
  const targetSheetName: string =
    (requestedSheetName && wb.Sheets[requestedSheetName] ? requestedSheetName : "") ||
    wb.SheetNames.find((s) => s === "Data-BOQ" || s === "Vật tư" || s === "BOQ") ||
    wb.SheetNames.find((s) => !IGNORE_SHEET_PATTERNS.some((p) => p.test(s))) ||
    wb.SheetNames[0];

  const ws = wb.Sheets[targetSheetName];
  if (!ws) {
    return NextResponse.json(
      { error: `Không đọc được sheet "${targetSheetName}" trong file` },
      { status: 400 },
    );
  }

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

  for (let i = 0; i < Math.min(raw.length, 35); i++) {
    const r = raw[i];
    if (!r) continue;

    let foundName = false;
    r.forEach((cell, idx) => {
      const c = clean(cell).toLowerCase();
      if (
        c.includes("mã boq") ||
        c === "mãboq" ||
        c === "mã hàng" ||
        c.includes("mã hiệu") ||
        c.includes("mã vt") ||
        c.includes("mã vật tư")
      ) {
        colMap.code = idx;
      }
      if (
        c.includes("mô tả") ||
        c.includes("tên vật tư") ||
        c === "vật tư" ||
        c === "diễn giải" ||
        c.includes("nội dung công tác") ||
        c === "tên hàng" ||
        c.includes("hạng mục công việc")
      ) {
        colMap.name = idx;
        foundName = true;
      }
      if (c === "đơn vị" || c === "đvt" || c === "dvt" || c.includes("đơn vị tính")) {
        colMap.unit = idx;
      }
      if (
        c.includes("khối lượng boq") ||
        c.includes("định mức boq") ||
        c.includes("kl boq") ||
        c.includes("khối lượng hợp đồng") ||
        c.includes("kl hợp đồng") ||
        c.includes("khối lượng dự toán") ||
        c.includes("kl dự toán") ||
        (colMap.qtyBoq === -1 && (c === "khối lượng" || c === "kl"))
      ) {
        colMap.qtyBoq = idx;
      }
      if (
        c.includes("khối lượng định mức") ||
        c.includes("định mức tháp") ||
        c.includes("kl định mức") ||
        c.includes("bản vẽ thi công") ||
        c.includes("bản vẽ shop") ||
        (colMap.qtyPlanned === -1 && c.includes("định mức") && !c.includes("định mức boq"))
      ) {
        colMap.qtyPlanned = idx;
      }
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
          "Không tìm thấy dòng tiêu đề hợp lệ. File cần có cột 'MÔ TẢ', 'Tên vật tư', hoặc 'Diễn giải'.",
      },
      { status: 400 },
    );
  }

  const results: RowResult[] = [];
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  // mode=replace: xoá toàn bộ vật tư của đúng hệ được chọn trong dự án hiện tại
  if (mode === "replace") {
    if (resolvedSystemId) {
      await run(
        `DELETE FROM materials WHERE (system_id = ? OR sheet_type_id IN (SELECT id FROM sheet_types WHERE system_id = ?)) AND project_id = ?`,
        resolvedSystemId,
        resolvedSystemId,
        projectId,
      );
    } else if (defaultSheetId) {
      await run(
        `DELETE FROM materials WHERE sheet_type_id = ? AND project_id = ?`,
        defaultSheetId,
        projectId,
      );
    }
  }

  // sort_order counter
  let currentSortOrder = 0;
  if (mode !== "replace") {
    const maxRow = resolvedSystemId
      ? await queryOne<{ m: number | null }>(
          `SELECT MAX(sort_order) AS m FROM materials WHERE (system_id = ? OR sheet_type_id IN (SELECT id FROM sheet_types WHERE system_id = ?)) AND project_id = ?`,
          resolvedSystemId,
          resolvedSystemId,
          projectId,
        )
      : await queryOne<{ m: number | null }>(
          `SELECT MAX(sort_order) AS m FROM materials WHERE sheet_type_id = ? AND project_id = ?`,
          defaultSheetId,
          projectId,
        );
    currentSortOrder = maxRow?.m ?? 0;
  }

  for (let i = headerRow + 1; i < raw.length; i++) {
    const r = raw[i];
    if (!r) continue;
    const rowNum = i + 1;

    const rawName = colMap.name >= 0 ? clean(r[colMap.name]) : "";
    const boqCode = colMap.code >= 0 ? clean(r[colMap.code]) || null : null;
    const unit = colMap.unit >= 0 ? clean(r[colMap.unit]) || null : null;
    const qtyBoq = colMap.qtyBoq >= 0 ? num(r[colMap.qtyBoq]) : 0;
    const qtyPlanned = colMap.qtyPlanned >= 0 ? num(r[colMap.qtyPlanned]) : 0;
    const note = colMap.note >= 0 ? clean(r[colMap.note]) || null : null;

    // Bỏ qua dòng hoàn toàn trống
    if (!rawName && !boqCode) {
      skipped++;
      results.push({
        row: rowNum,
        name: "—",
        status: "skip",
        message: "Bỏ qua (dòng trống)",
      });
      continue;
    }

    const name = rawName || boqCode || "—";

    currentSortOrder++;
    const sortOrder = currentSortOrder;

    // Nếu mã BOQ đã tồn tại trong cùng hệ của dự án → Cập nhật số liệu
    if (boqCode) {
      const existing = resolvedSystemId
        ? await queryOne<{ id: number }>(
            `SELECT id FROM materials WHERE boq_code = ? AND (system_id = ? OR sheet_type_id IN (SELECT id FROM sheet_types WHERE system_id = ?)) AND project_id = ?`,
            boqCode,
            resolvedSystemId,
            resolvedSystemId,
            projectId,
          )
        : await queryOne<{ id: number }>(
            `SELECT id FROM materials WHERE boq_code = ? AND sheet_type_id = ? AND project_id = ?`,
            boqCode,
            defaultSheetId,
            projectId,
          );
      if (existing) {
        await run(
          `UPDATE materials SET name=?, unit=?, qty_boq=?, qty_planned=?, note=?, sort_order=?, system_id=COALESCE(?, system_id) WHERE id=? AND project_id=?`,
          name,
          unit,
          qtyBoq,
          qtyPlanned,
          note,
          sortOrder,
          resolvedSystemId,
          existing.id,
          projectId,
        );
        updated++;
        results.push({
          row: rowNum,
          code: boqCode,
          name,
          unit,
          qtyBoq,
          qtyPlanned,
          status: "ok",
          message: "Cập nhật",
        });
        continue;
      }
    }

    let status = colMap.status >= 0 ? clean(r[colMap.status]) : "dat_hang";
    if (!VALID_STATUSES.includes(status)) status = "dat_hang";

    try {
      await insertId(
        `INSERT INTO materials (system_id, sheet_type_id, boq_code, name, unit, qty_boq, qty_planned, qty_used, status, note, sort_order, project_id)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
        resolvedSystemId,
        defaultSheetId,
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
      results.push({
        row: rowNum,
        code: boqCode,
        name,
        unit,
        qtyBoq,
        qtyPlanned,
        status: "ok",
        message: "Thêm mới",
      });
    } catch (e: unknown) {
      errors++;
      results.push({
        row: rowNum,
        code: boqCode,
        name,
        status: "error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return NextResponse.json({
    inserted,
    updated,
    skipped,
    errors,
    sheetUsed: targetSheetName,
    results,
  });
}
