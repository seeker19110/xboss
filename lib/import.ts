import * as XLSX from "xlsx";
import { db, projects, towers, sheetTypes, workPackages, tasks } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { toStatusSlug, parseProgress } from "@/lib/status";

export const SHEET_MAP: Record<string, { code: string; name: string; responsible?: string }> = {
  "TRACKING OGTĐ": { code: "OGTĐ", name: "Ống gió trục đứng", responsible: "Mr. Thừa" },
  "TRACKING OGHL": { code: "OGHL", name: "Ống gió hành lang", responsible: "Mr. Thừa" },
  "TRACKING OGCH": { code: "OGCH", name: "Ống gió căn hộ", responsible: "Mr. Thừa" },
  "TRACKING ODNN Zone 1": { code: "ODNN Zone 1", name: "Ống đồng nước ngưng Zone 1", responsible: "Mr. Hải" },
  "TRACKING ODNN Zone 2": { code: "ODNN Zone 2", name: "Ống đồng nước ngưng Zone 2", responsible: "Mr. Thắng" },
};

// Excel serial hoặc Date hoặc ISO string → Date | null
export function toDate(v: unknown): Date | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof v === "number" && !isNaN(v)) {
    return new Date(Math.round((v - 25569) * 86400 * 1000));
  }
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? null : d;
}

const intStt = (s: string) => /^\d+$/.test(s);          // "1", "2" → work package
const floorOf = (name: string) => name.match(/(\d+F)\b/)?.[1] ?? null;

export type ImportStats = {
  totalRows: number;
  packages: number;
  tasks: number;
  errors: string[];
  sheets: string[];
};

export async function importWorkbook(workbook: XLSX.WorkBook): Promise<ImportStats> {
  const stats: ImportStats = { totalRows: 0, packages: 0, tasks: 0, errors: [], sheets: [] };

  // Project + Tower
  let [project] = await db.select().from(projects).where(eq(projects.name, "TT AVIO Tháp A"));
  if (!project) {
    [project] = await db.insert(projects)
      .values({ name: "TT AVIO Tháp A", code: "AVIO-A" }).returning();
  }
  let [tower] = await db.select().from(towers).where(eq(towers.projectId, project.id));
  if (!tower) {
    [tower] = await db.insert(towers)
      .values({ projectId: project.id, name: "Tháp A" }).returning();
  }

  for (const sheetName of workbook.SheetNames) {
    const info = SHEET_MAP[sheetName];
    if (!info) continue;
    stats.sheets.push(sheetName);

    const ws = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null }) as unknown[][];

    // Sheet type
    let [st] = await db.select().from(sheetTypes)
      .where(and(eq(sheetTypes.towerId, tower.id), eq(sheetTypes.code, info.code)));
    if (!st) {
      [st] = await db.insert(sheetTypes)
        .values({ towerId: tower.id, code: info.code, name: info.name, responsible: info.responsible })
        .returning();
    }

    let currentPkgId: number | null = null;
    let currentPkgCode = "";

    // Cột: 0=CODE 1=STT 2=CHI TIẾT 3=GHI CHÚ 4=bắt đầu 5=số ngày 6=kết thúc 7=% tiến độ
    // Data thật từ row index 5 trở đi (bỏ tiêu đề + group "A").
    for (let i = 5; i < rows.length; i++) {
      const row = rows[i];
      if (!row) continue;

      const code = String(row[0] ?? "").trim();
      const stt = String(row[1] ?? "").trim();
      const name = String(row[2] ?? "").trim();
      if (!name) continue;

      // Bỏ group cấp cao "A - THI CÔNG..." (stt là chữ cái đơn, không có code dạng A1)
      const isTopGroup = /^[A-Z]+$/.test(stt) && !/^[A-Z]+\d/.test(code);
      if (isTopGroup) continue;

      stats.totalRows++;
      const startDate = toDate(row[4]);
      const durationDays = row[5] != null ? parseInt(String(row[5])) || null : null;
      const endDate = toDate(row[6]);
      const status = toStatusSlug(row[3]);
      const progress = parseProgress(row[7]);

      try {
        // Work package: có CODE (không dấu phẩy) VÀ STT là số nguyên ("1","2"...).
        const isPkg = !!code && !code.includes(",") && intStt(stt);
        // Sub-header trong nhóm (vd "Trực Đứng Nước Ngưng 1F"): không code, không stt → bỏ.
        const isSubHeader = !code && !stt;
        if (isSubHeader) continue;

        if (isPkg) {
          const wpCode = code || `${info.code}-${stt || i}`;
          let [wp] = await db.select().from(workPackages)
            .where(and(eq(workPackages.sheetTypeId, st.id), eq(workPackages.code, wpCode)));
          if (!wp) {
            [wp] = await db.insert(workPackages).values({
              sheetTypeId: st.id, code: wpCode, seqNo: stt || null,
              floorLabel: floorOf(name), name, startDate, endDate,
              durationDays, status, progress,
            }).returning();
            stats.packages++;
          } else {
            await db.update(workPackages)
              .set({ status, progress, startDate, endDate, durationDays })
              .where(eq(workPackages.id, wp.id));
          }
          currentPkgId = wp.id;
          currentPkgCode = wpCode;
        } else if (currentPkgId) {
          const taskCode = code || `${currentPkgCode},${stt}`;
          const [existing] = await db.select().from(tasks)
            .where(and(eq(tasks.packageId, currentPkgId), eq(tasks.code, taskCode)));
          if (!existing) {
            await db.insert(tasks).values({
              packageId: currentPkgId, code: taskCode, seqNo: stt, name,
              note: row[3] != null ? String(row[3]) : null,
              status, startDate, endDate, durationDays, progressPercent: progress,
            });
          } else {
            await db.update(tasks)
              .set({ status, progressPercent: progress, startDate, endDate, durationDays })
              .where(eq(tasks.id, existing.id));
          }
          stats.tasks++;
        }
      } catch (err) {
        stats.errors.push(`Dòng ${i + 1} (${sheetName}): ${(err as Error).message}`);
      }
    }
  }
  return stats;
}
