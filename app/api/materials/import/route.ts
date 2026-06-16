import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { query, queryOne, insertId, run } from "@/lib/db";
import { getCurrentUser, type Role } from "@/lib/auth";
import { boqTakenBy } from "@/lib/boq";

export const dynamic = "force-dynamic";

const canEditMaterials = (r?: Role) => r === "admin" || r === "pm" || r === "engineer";

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

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Không đọc được form" }, { status: 400 });

  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "Thiếu file" }, { status: 400 });

  const mode = String(form.get("mode") ?? "append"); // append | replace

  const buf = Buffer.from(await file.arrayBuffer());
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buf, { type: "buffer" });
  } catch {
    return NextResponse.json({ error: "File không đúng định dạng Excel (.xlsx/.xls)" }, { status: 400 });
  }

  // Ưu tiên sheet "Data-BOQ" nếu có, ngược lại lấy sheet đầu tiên
  const sheetName = wb.SheetNames.includes("Data-BOQ") ? "Data-BOQ" : wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });

  if (!rows.length) return NextResponse.json({ error: "File không có dữ liệu" }, { status: 400 });

  // Chuẩn hoá key: trim khoảng trắng thừa ở đầu/cuối
  const normalizedRows = rows.map(r =>
    Object.fromEntries(Object.entries(r).map(([k, v]) => [k.trim(), v]))
  );

  // Phát hiện format: template cũ hay BOQ gốc
  const firstRow = normalizedRows[0];
  const isBOQFormat = !("Tên vật tư *" in firstRow) && ("MÔ TẢ" in firstRow || "MO TA" in firstRow);

  if (!isBOQFormat && !("Tên vật tư *" in firstRow)) {
    return NextResponse.json({
      error: "File không đúng cấu trúc. Cần có cột 'Tên vật tư *' (template mẫu) hoặc 'MÔ TẢ' (file BOQ gốc).",
    }, { status: 400 });
  }

  // Helper đọc trường theo format
  function getField(row: Record<string, unknown>, templateKey: string, boqKey: string): string {
    if (isBOQFormat) return String(row[boqKey] ?? "").trim();
    return String(row[templateKey] ?? "").trim();
  }

  // Danh sách hệ (sheet_types) để tra mã → id
  const sheetTypes = await query<{ id: number; code: string }>(
    `SELECT id, code FROM sheet_types ORDER BY id`);
  const sheetMap = new Map(sheetTypes.map(s => [s.code.trim().toLowerCase(), s.id]));

  const results: RowResult[] = [];
  let inserted = 0;
  let skipped = 0;
  let errors = 0;

  // Nếu mode=replace: xoá toàn bộ vật tư của các hệ sẽ import (xác định sau khi đọc file)
  // Để an toàn, chỉ xoá hệ nào có trong file
  const sheetIdsInFile = new Set<number>();
  for (const raw of normalizedRows) {
    let sheetCode: string;
    if (isBOQFormat) {
      // Trích prefix từ MãBOQ: "DHKK-A.I.1.0" → "DHKK"
      sheetCode = String(raw["MãBOQ"] ?? "").split("-")[0].toLowerCase();
    } else {
      sheetCode = String(raw["Mã hệ *"] ?? "").trim().toLowerCase();
    }
    const sheetId = sheetMap.get(sheetCode);
    if (sheetId) sheetIdsInFile.add(sheetId);
  }

  if (mode === "replace" && sheetIdsInFile.size > 0) {
    for (const sid of sheetIdsInFile) {
      await run(`DELETE FROM materials WHERE sheet_type_id = ?`, sid);
    }
  }

  for (let i = 0; i < normalizedRows.length; i++) {
    const raw = normalizedRows[i];
    const rowNum = i + 2; // +2 vì hàng 1 là tiêu đề, i bắt đầu từ 0
    const name = getField(raw, "Tên vật tư *", "MÔ TẢ");

    if (!name) { skipped++; results.push({ row: rowNum, name: "—", status: "skip", message: "Bỏ qua (không có tên)" }); continue; }

    // Xác định mã hệ
    let sheetCode: string;
    if (isBOQFormat) {
      const boqPrefix = String(raw["MãBOQ"] ?? "").split("-")[0].toLowerCase();
      sheetCode = boqPrefix;
    } else {
      sheetCode = String(raw["Mã hệ *"] ?? "").trim().toLowerCase();
    }
    const sheetId = sheetMap.get(sheetCode);
    if (!sheetId) {
      errors++;
      const displayCode = isBOQFormat
        ? String(raw["MãBOQ"] ?? "").split("-")[0]
        : String(raw["Mã hệ *"] ?? "");
      results.push({ row: rowNum, name, status: "error", message: `Mã hệ "${displayCode}" không tồn tại trong hệ thống` });
      continue;
    }

    const boqCode = getField(raw, "Mã BOQ", "MãBOQ") || null;

    const unit = getField(raw, "ĐVT", "Đơn vị") || null;
    const qtyBoq = parseFloat(String(raw[isBOQFormat ? "KHỐI LƯỢNG BOQ" : "Định mức BOQ"] ?? "")) || 0;
    const qtyPlanned = parseFloat(String(raw[isBOQFormat ? "KL Định Mức" : "Định mức Tháp A"] ?? "")) || 0;
    const noteRaw = getField(raw, "Ghi chú", "GHI CHÚ");
    const note = noteRaw || null;

    // Nếu mã BOQ đã tồn tại ở vật tư → cập nhật khối lượng
    if (boqCode) {
      const existing = await queryOne<{ id: number }>(
        `SELECT id FROM materials WHERE boq_code = ?`, boqCode);
      if (existing) {
        await run(
          `UPDATE materials SET qty_boq=?, qty_planned=? WHERE id=?`,
          qtyBoq, qtyPlanned, existing.id);
        inserted++;
        results.push({ row: rowNum, name, status: "ok", message: "Cập nhật khối lượng" });
        continue;
      }
      // Trùng với task/work_package → báo lỗi để sửa
      const taken = await boqTakenBy(boqCode);
      if (taken) {
        errors++;
        results.push({ row: rowNum, name, status: "error", message: `Mã BOQ "${boqCode}" đã dùng bởi ${taken}` });
        continue;
      }
    }

    let status = getField(raw, "Trạng thái", "Trạng thái");
    if (!VALID_STATUSES.includes(status)) status = "dat_hang";

    // Tìm vị trí chèn: dựa theo phân cấp mã BOQ
    // "DHKK-A.I.2.0" → thử prefix "DHKK-A.I.2" → "DHKK-A.I" → "DHKK-A" → cuối cùng
    let insertAfter: number | null = null;
    if (boqCode) {
      let prefix = boqCode;
      while (insertAfter === null) {
        const sep = Math.max(prefix.lastIndexOf("."), prefix.lastIndexOf("-"));
        if (sep <= 0) break;
        prefix = prefix.slice(0, sep);
        const anchor = await queryOne<{ m: number | null }>(
          `SELECT MAX(sort_order) AS m FROM materials WHERE sheet_type_id = ? AND boq_code LIKE ?`,
          sheetId, prefix + "%");
        if (anchor?.m != null) insertAfter = anchor.m;
      }
    }

    let sortOrder: number;
    if (insertAfter !== null) {
      // Đẩy các hàng phía sau xuống 1
      await run(
        `UPDATE materials SET sort_order = sort_order + 1 WHERE sheet_type_id = ? AND sort_order > ?`,
        sheetId, insertAfter);
      sortOrder = insertAfter + 1;
    } else {
      // Không có anchor → thêm vào cuối
      const maxRow = await queryOne<{ m: number | null }>(
        `SELECT MAX(sort_order) AS m FROM materials WHERE sheet_type_id = ?`, sheetId);
      sortOrder = (maxRow?.m ?? 0) + 1;
    }

    try {
      await insertId(
        `INSERT INTO materials (sheet_type_id, boq_code, name, unit, qty_boq, qty_planned, qty_used, status, note, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
        sheetId, boqCode, name, unit, qtyBoq, qtyPlanned, status, note, sortOrder);
      inserted++;
      results.push({ row: rowNum, name, status: "ok" });
    } catch (e: unknown) {
      errors++;
      results.push({ row: rowNum, name, status: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  return NextResponse.json({ inserted, skipped, errors, results });
}
