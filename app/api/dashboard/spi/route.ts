import { NextRequest, NextResponse } from "next/server";
import { query, todayISO } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { resolveSystemId } from "@/lib/systems";

export const dynamic = "force-dynamic";

type Row = {
  sheetType: string;
  startDate: string | null;
  endDate: string | null;
  progress: number;
};

const DAY_MS = 86400_000;
const toDate = (iso: string) => new Date(iso + "T00:00:00Z").getTime();

// Tỉ lệ thời gian đã trôi của 1 task tại hôm nay (kế hoạch tuyến tính start→end), clamp 0..1.
function plannedRatio(start: string, end: string, today: number): number {
  const s = toDate(start),
    e = toDate(end);
  if (e <= s) return today >= e ? 1 : 0;
  return Math.min(1, Math.max(0, (today - s) / (e - s)));
}

// GET /api/dashboard/spi?system=<code>
// SPI (Schedule Performance Index) = % thực tế / % kế hoạch tại hôm nay, theo từng hệ + tổng dự án.
// % kế hoạch nội suy tuyến tính start→end mỗi task (giống đường kế hoạch S-curve).
// SPI ≥ 1 đúng/vượt tiến độ · 0.9–1 hơi chậm · < 0.9 chậm đáng kể.
// `?system=<systems.code>` lọc theo hệ — không truyền = nguyên hành vi cũ (toàn dự án).
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewDashboard(user.role))
    return NextResponse.json({ error: "Thầu phụ không có quyền xem dashboard" }, { status: 403 });

  const systemId = await resolveSystemId(req.nextUrl.searchParams.get("system"));
  const systemFilter = systemId !== null ? "WHERE st.system_id = ?" : "";
  const systemParams = systemId !== null ? [systemId] : [];

  const rows = await query<Row>(
    `SELECT st.code AS "sheetType", t.start_date AS "startDate",
            t.end_date AS "endDate", t.progress_percent AS progress
       FROM tasks t
       JOIN work_packages wp ON t.package_id = wp.id
       JOIN sheet_types st ON wp.sheet_type_id = st.id
       ${systemFilter}`,
    ...systemParams,
  );

  const todayMs = toDate(todayISO());

  // Chỉ tính trên task có đủ ngày BĐ/KT — không có ngày thì không đo được kế hoạch.
  const groups = new Map<string, { plannedSum: number; actualSum: number; count: number }>();
  let oPlanned = 0,
    oActual = 0,
    oCount = 0;

  for (const r of rows) {
    if (!r.startDate || !r.endDate) continue;
    const planned = plannedRatio(r.startDate, r.endDate, todayMs);
    const actual = r.progress ?? 0;
    const g = groups.get(r.sheetType) ?? { plannedSum: 0, actualSum: 0, count: 0 };
    g.plannedSum += planned;
    g.actualSum += actual;
    g.count += 1;
    groups.set(r.sheetType, g);
    oPlanned += planned;
    oActual += actual;
    oCount += 1;
  }

  const round = (n: number) => Math.round(n * 1000) / 1000;
  const make = (plannedSum: number, actualSum: number, count: number) => {
    if (count === 0) return { planned: 0, actual: 0, spi: null as number | null, taskCount: 0 };
    const planned = plannedSum / count,
      actual = actualSum / count;
    return {
      planned: round(planned),
      actual: round(actual),
      spi: planned > 0.0001 ? round(actual / planned) : null,
      taskCount: count,
    };
  };

  const spi = [...groups.entries()].map(([sheetType, g]) => ({
    sheetType,
    ...make(g.plannedSum, g.actualSum, g.count),
  }));

  return NextResponse.json({ spi, overall: make(oPlanned, oActual, oCount) });
}
