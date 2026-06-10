import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { db, projects, towers, sheetTypes, workPackages, tasks } from '@/lib/db';
import { eq, and } from 'drizzle-orm';

// Convert Excel serial date → ISO string
function excelDateToISO(serial: number): string | null {
  if (!serial || isNaN(serial)) return null;
  const date = new Date(Math.round((serial - 25569) * 86400 * 1000));
  return date.toISOString().split('T')[0];
}

// Parse progress value từ Excel (có thể là float 0-1 hoặc text "Chuẩn bị")
function parseProgress(val: any): number {
  if (typeof val === 'number' && val >= 0 && val <= 1) return val;
  return 0;
}

// Map tên sheet → code chuẩn
const SHEET_MAP: Record<string, { code: string; label: string }> = {
  'TRACKING OGTĐ':     { code: 'OGTĐ',       label: 'Ống gió trục đứng' },
  'TRACKING OGHL':     { code: 'OGHL',        label: 'Ống gió hành lang' },
  'TRACKING OGCH':     { code: 'OGCH',        label: 'Ống gió căn hộ' },
  'TRACKING ODNN Zone 1': { code: 'ODNN Zone 1', label: 'Ống đồng nước ngưng Zone 1' },
  'TRACKING ODNN Zone 2': { code: 'ODNN Zone 2', label: 'Ống đồng nước ngưng Zone 2' },
};

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'Không tìm thấy file' }, { status: 400 });

    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });

    // 1. Upsert Project + Tower
    let [project] = await db.select().from(projects).where(eq(projects.name, 'AVIO Tháp A'));
    if (!project) {
      [project] = await db.insert(projects).values({ name: 'AVIO Tháp A', status: 'In Progress' }).returning();
    }
    
    let [tower] = await db.select().from(towers).where(eq(towers.projectId, project.id));
    if (!tower) {
      [tower] = await db.insert(towers).values({ projectId: project.id, name: 'Tháp A' }).returning();
    }

    const stats = { totalRows: 0, success: 0, errors: [] as string[], sheets: [] as string[] };

    for (const sheetName of workbook.SheetNames) {
      const sheetInfo = SHEET_MAP[sheetName];
      if (!sheetInfo) continue;

      stats.sheets.push(sheetName);
      const ws = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null }) as any[][];

      // 2. Upsert SheetType
      let [st] = await db.select().from(sheetTypes)
        .where(and(eq(sheetTypes.towerId, tower.id), eq(sheetTypes.code, sheetInfo.code)));
      if (!st) {
        [st] = await db.insert(sheetTypes)
          .values({ towerId: tower.id, code: sheetInfo.code, label: sheetInfo.label })
          .returning();
      }

      // 3. Parse rows — bỏ qua header (3 dòng đầu)
      let currentPackageId: number | null = null;
      let currentPackageCode = '';

      for (let i = 3; i < rows.length; i++) {
        const row = rows[i];
        if (!row || (!row[0] && !row[1])) continue;

        const stt = String(row[0] || '').trim();
        const name = String(row[1] || '').trim();
        if (!name) continue;

        stats.totalRows++;

        try {
          const startDate = excelDateToISO(row[4]);
          const durationDays = row[5] ? parseInt(row[5]) : null;
          const endDate = excelDateToISO(row[6]);
          const progressPercent = parseProgress(row[7]);
          const status = String(row[2] || 'Chuẩn bị').trim() || 'Chuẩn bị';

          // Phân biệt WorkPackage (stt dạng "1", "2") vs SubTask (stt dạng "1.01")
          const isWorkPackage = /^\d+$/.test(stt) || stt === '';
          
          if (isWorkPackage && stt) {
            // Upsert WorkPackage
            const code = stt;
            const floorLabel = name.match(/(\d+F)/)?.[1] || null;
            
            let [wp] = await db.select().from(workPackages)
              .where(and(eq(workPackages.sheetTypeId, st.id), eq(workPackages.code, code)));
            
            if (!wp) {
              [wp] = await db.insert(workPackages).values({
                sheetTypeId: st.id,
                code,
                seqNo: stt,
                floorLabel,
                description: name,
                startDate,
                endDate,
              }).returning();
            }
            currentPackageId = wp.id;
            currentPackageCode = code;
          } else if (currentPackageId) {
            // Upsert SubTask
            const taskCode = `${currentPackageCode},${stt}`;
            
            const [existing] = await db.select().from(tasks)
              .where(and(eq(tasks.packageId, currentPackageId), eq(tasks.code, taskCode)));

            if (!existing) {
              await db.insert(tasks).values({
                packageId: currentPackageId,
                code: taskCode,
                seqNo: stt,
                name,
                status,
                startDate,
                endDate,
                durationDays,
                progressPercent,
              });
            } else {
              await db.update(tasks)
                .set({ status, progressPercent, startDate, endDate, durationDays })
                .where(eq(tasks.id, existing.id));
            }
            stats.success++;
          }
        } catch (err: any) {
          stats.errors.push(`Dòng ${i + 1} (${sheetName}): ${err.message}`);
        }
      }
    }

    return NextResponse.json({
      ...stats,
      message: `✅ Import hoàn tất! ${stats.success}/${stats.totalRows} tasks đã lưu vào DB`,
    });

  } catch (error: any) {
    console.error("Import Error:", error);
    return NextResponse.json({ error: error.message || 'Lỗi server' }, { status: 500 });
  }
}