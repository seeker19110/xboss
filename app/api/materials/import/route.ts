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

  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });

  if (!rows.length) return NextResponse.json({ error: "File không có dữ liệu" }, { status: 400 });

  // Kiểm tra tiêu đề cột
  const firstRow = rows[0];
  if (!("Tên vật tư *" in firstRow) || !("Mã hệ *" in firstRow)) {
    return NextResponse.json({
      error: "File không đúng cấu trúc mẫu. Vui lòng tải mẫu mới và nhập lại.",
    }, { status: 400 });
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
  for (const raw of rows) {
    const sheetCode = String(raw["Mã hệ *"] ?? "").trim().toLowerCase();
    const sheetId = sheetMap.get(sheetCode);
    if (sheetId) sheetIdsInFile.add(sheetId);
  }

  if (mode === "replace" && sheetIdsInFile.size > 0) {
    for (const sid of sheetIdsInFile) {
      await run(`DELETE FROM materials WHERE sheet_type_id = ?`, sid);
    }
  }

  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i];
    const rowNum = i + 2; // +2 vì hàng 1 là tiêu đề, i bắt đầu từ 0
    const name = String(raw["Tên vật tư *"] ?? "").trim();

    if (!name) { skipped++; results.push({ row: rowNum, name: "—", status: "skip", message: "Bỏ qua (không có tên)" }); continue; }

    const sheetCode = String(raw["Mã hệ *"] ?? "").trim().toLowerCase();
    const sheetId = sheetMap.get(sheetCode);
    if (!sheetId) {
      errors++;
      results.push({ row: rowNum, name, status: "error", message: `Mã hệ "${raw["Mã hệ *"]}" không tồn tại` });
      continue;
    }

    const boqCode = String(raw["Mã BOQ"] ?? "").trim() || null;
    if (boqCode) {
      const taken = await boqTakenBy(boqCode);
      if (taken) {
        errors++;
        results.push({ row: rowNum, name, status: "error", message: `Mã BOQ "${boqCode}" đã dùng bởi ${taken}` });
        continue;
      }
    }

    const unit = String(raw["ĐVT"] ?? "").trim() || null;
    const qtyBoq = parseFloat(String(raw["Định mức BOQ"] ?? "")) || 0;
    const qtyPlanned = parseFloat(String(raw["Định mức Tháp A"] ?? "")) || 0;
    const noteRaw = String(raw["Ghi chú"] ?? "").trim();
    const note = noteRaw || null;

    let status = String(raw["Trạng thái"] ?? "").trim();
    if (!VALID_STATUSES.includes(status)) status = "dat_hang";

    // sort_order: thêm vào cuối hệ đó
    const maxRow = await queryOne<{ m: number | null }>(
      `SELECT MAX(sort_order) AS m FROM materials WHERE sheet_type_id = ?`, sheetId);
    const sortOrder = (maxRow?.m ?? 0) + 1;

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
