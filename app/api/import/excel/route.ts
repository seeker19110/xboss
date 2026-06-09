import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'Không tìm thấy file' }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });

    const results = {
      totalRows: 0,
      success: 0,
      errors: [] as string[],
      sheets: [] as string[],
      message: "Import parsing thành công (chưa lưu DB)"
    };

    for (const sheetName of workbook.SheetNames) {
      if (!sheetName.includes('TRACKING')) continue;

      results.sheets.push(sheetName);
      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

      for (let i = 3; i < data.length; i++) {
        const row = data[i];
        if (!row || !row[1]) continue;

        results.totalRows++;

        try {
          const detail = String(row[1] || '').trim();
          const ghiChu = String(row[2] || '').trim();
          const floorNum = String(row[3] || 'Unknown').trim();
          const progress = parseFloat(row[7] || '0');

          if (detail) {
            results.success++;
          }
        } catch (err: any) {
          results.errors.push(`Dòng ${i + 1} (${sheetName})`);
        }
      }
    }

    results.message = `✅ Import parsing hoàn tất! ${results.success}/${results.totalRows} records`;

    return NextResponse.json(results);

  } catch (error: any) {
    console.error("Import Error:", error);
    return NextResponse.json({ 
      error: error.message || 'Lỗi server' 
    }, { status: 500 });
  }
}