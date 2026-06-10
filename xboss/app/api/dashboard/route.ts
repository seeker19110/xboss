import { NextResponse } from "next/server";
import { db, tasks, workPackages, sheetTypes } from "@/lib/db";
import { eq, lt, and, notInArray, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const today = new Date();

  // Task trễ: end_date < hôm nay AND progress < 1 AND chưa hoàn thành/nghiệm thu
  const delayedTasks = await db
    .select({
      id: tasks.id,
      code: tasks.code,
      name: tasks.name,
      status: tasks.status,
      startDate: tasks.startDate,
      endDate: tasks.endDate,
      progressPercent: tasks.progressPercent,
      floorLabel: workPackages.floorLabel,
      packageCode: workPackages.code,
      sheetType: sheetTypes.code,
    })
    .from(tasks)
    .innerJoin(workPackages, eq(tasks.packageId, workPackages.id))
    .innerJoin(sheetTypes, eq(workPackages.sheetTypeId, sheetTypes.id))
    .where(
      and(
        lt(tasks.endDate, today),
        sql`${tasks.progressPercent} < 1`,
        notInArray(tasks.status, ["hoan_thanh", "nghiem_thu"]),
      ),
    )
    .orderBy(tasks.endDate);

  // KPI theo từng sheet
  const kpi = await db
    .select({
      sheetType: sheetTypes.code,
      total: sql<number>`count(${tasks.id})::int`,
      avgProgress: sql<number>`coalesce(avg(${tasks.progressPercent}), 0)`,
      delayed: sql<number>`sum(case when ${tasks.endDate} < now() and ${tasks.progressPercent} < 1 and ${tasks.status} not in ('hoan_thanh','nghiem_thu') then 1 else 0 end)::int`,
    })
    .from(tasks)
    .innerJoin(workPackages, eq(tasks.packageId, workPackages.id))
    .innerJoin(sheetTypes, eq(workPackages.sheetTypeId, sheetTypes.id))
    .groupBy(sheetTypes.code);

  return NextResponse.json({
    delayedTasks,
    kpi,
    totalDelayed: delayedTasks.length,
  });
}
