import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { query, queryOne, insertId, run } from "@/lib/db";
import { getCurrentUser, type Role } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { isContentTooLarge } from "@/lib/photos";

export const dynamic = "force-dynamic";

const canEditMaterials = (r?: Role) => r === "admin" || r === "pm" || r === "engineer";

// 20MB — khớp ngưỡng file Excel import khác (/api/import/excel, /api/boq/import).
const MAX_BYTES = 20 * 1024 * 1024;

const VALID_STATUSES = ["dat_hang", "ve_kho", "da_dung"];

type RowResult = {
  row: number;
  name: string;
  status: "ok" | "skip" | "error";
  message?: string;
};

// POST /api/materials/import  body: FormData { file: File, mode: "append"|"replace" }
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!canEditMaterials(user.role))
    return NextResponse.json({ error: "Không có quyền import vật tư" }, { status: 403 });

  const projectId = await getCurrentProjectId(user);
  if (projectId == null)
    return NextResponse.json({ error: "Chưa có dự án nào để import vật tư" }, { status: 422 });

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

  // Ưu tiên sheet "Data-BOQ" nếu có, ngược lại lấy sheet đầu tiên
  const sheetName = wb.SheetNames.includes("Data-BOQ") ? "Data-BOQ" : wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });

  if (!rows.length) return NextResponse.json({ error: "File không có dữ liệu" }, { status: 400 });

  // Chuẩn hoá key: trim khoảng trắng + bỏ dấu ngoặc kép thừa + NFC
  const normalizedRows = rows.map((r) =>
    Object.fromEntries(
      Object.entries(r).map(([k, v]) => [
        k
          .trim()
          .replace(/^"+|"+$/g, "")
          .trim()
          .normalize("NFC"),
        v,
      ]),
    ),
  );

  // Cột tên vật tư trong file BOQ có thể là "Vật tư", "MÔ TẢ", "MO TA"
  const BOQ_NAME_COLS = ["Vật tư", "MÔ TẢ", "MO TA"];
  const firstRow = normalizedRows[0];
  const boqNameCol = BOQ_NAME_COLS.find((c) => c in firstRow) ?? null;
  const isBOQFormat = !("Tên vật tư *" in firstRow) && boqNameCol !== null;

  // Cột mã BOQ trong file BOQ có thể là "Mã BOQ" hoặc "MãBOQ"
  const boqCodeCol = "Mã BOQ" in firstRow ? "Mã BOQ" : "MãBOQ";

  if (!isBOQFormat && !("Tên vật tư *" in firstRow)) {
    return NextResponse.json(
      {
        error:
          "File không đúng cấu trúc. Cần có cột 'Tên vật tư *' (template mẫu) hoặc 'Vật tư' / 'MÔ TẢ' (file BOQ gốc).",
      },
      { status: 400 },
    );
  }

  // Template format mà không chọn hệ → báo lỗi sớm
  if (!isBOQFormat && !defaultSheetId) {
    return NextResponse.json({ error: "Vui lòng chọn hệ trước khi import." }, { status: 400 });
  }

  // Tìm cột trong firstRow theo danh sách ưu tiên (case-insensitive, NFC)
  function findCol(candidates: string[]): string | null {
    const keys = Object.keys(firstRow).map((k) => k.toLowerCase());
    for (const c of candidates) {
      const idx = keys.indexOf(c.toLowerCase());
      if (idx >= 0) return Object.keys(firstRow)[idx];
    }
    return null;
  }

  const boqQtyCol = findCol(["ĐỊnh Mức BOQ", "KHỐI LƯỢNG BOQ", "Định mức BOQ", "KL BOQ"]);
  const plannedCol = findCol(["Định mức Tháp A", "KL Định Mức", "KL Định mức", "Định mức tháp A"]);
  const unitColBOQ = findCol(["ĐVT", "Đơn vị", "DVT"]);
  const noteColBOQ = findCol(["GHI CHÚ", "Ghi chú", "Ghi chu"]);
  const statusColBOQ = findCol(["Trạng Thái", "Trạng thái", "TRANG THAI"]);

  // Helper đọc trường theo format
  function getField(row: Record<string, unknown>, templateKey: string, boqKey: string): string {
    if (isBOQFormat) return String(row[boqKey] ?? "").trim();
    return String(row[templateKey] ?? "").trim();
  }

  // Danh sách hệ (sheet_types) để tra mã → id
  const sheetTypes = await query<{ id: number; code: string }>(
    `SELECT id, code FROM sheet_types ORDER BY id`,
  );
  const sheetMap = new Map(sheetTypes.map((s) => [s.code.trim().toLowerCase(), s.id]));

  const results: RowResult[] = [];
  let inserted = 0;
  let skipped = 0;
  let errors = 0;

  // mode=replace với template format: xoá vật tư của hệ được chọn (trong dự án hiện tại)
  if (mode === "replace" && !isBOQFormat && defaultSheetId) {
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

  for (let i = 0; i < normalizedRows.length; i++) {
    const raw = normalizedRows[i];
    const rowNum = i + 2;
    const name = getField(raw, "Tên vật tư *", boqNameCol ?? "Vật tư");

    if (!name) {
      skipped++;
      results.push({ row: rowNum, name: "—", status: "skip", message: "Bỏ qua (không có tên)" });
      continue;
    }

    // Xác định sheetId: template dùng defaultSheetId, BOQ thử prefix rồi fallback null
    let sheetId: number | null;
    if (isBOQFormat) {
      const boqPrefix = String(raw[boqCodeCol] ?? "")
        .split("-")[0]
        .toLowerCase();
      sheetId = sheetMap.get(boqPrefix) ?? defaultSheetId ?? null;
    } else {
      sheetId = defaultSheetId!;
    }

    const boqCode = getField(raw, "Mã BOQ", boqCodeCol) || null;

    const unit = isBOQFormat
      ? String(raw[unitColBOQ ?? "ĐVT"] ?? "").trim() || null
      : String(raw["ĐVT"] ?? "").trim() || null;
    const qtyBoq =
      parseFloat(String(raw[isBOQFormat ? (boqQtyCol ?? "") : "Định mức BOQ"] ?? "")) || 0;
    const qtyPlanned =
      parseFloat(String(raw[isBOQFormat ? (plannedCol ?? "") : "Định mức Tháp A"] ?? "")) || 0;
    const noteRaw = isBOQFormat
      ? String(raw[noteColBOQ ?? "GHI CHÚ"] ?? "").trim()
      : String(raw["Ghi chú"] ?? "").trim();
    const note = noteRaw || null;

    // sort_order theo thứ tự dòng trong file
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

    let status = isBOQFormat
      ? String(raw[statusColBOQ ?? "Trạng Thái"] ?? "").trim()
      : String(raw["Trạng thái"] ?? "").trim();
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

  return NextResponse.json({ inserted, skipped, errors, results });
}
