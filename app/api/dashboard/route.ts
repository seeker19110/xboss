import { NextResponse } from 'next/server';
import { db, tasks, workPackages, sheetTypes, towers, projects } from '@/lib/db';
import { lt, and, ne, inArray, sql } from 'drizzle-orm';

export async function GET() {
  const today = new Date().toISOString().split('T')[0];
  
  // Tasks trễ: end_date < today AND progress < 1 AND status không phải hoàn thành
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
        ne(tasks.status, 'Đã Hoàn Thành'),
        ne(tasks.status, 'Đã Nghiệm Thu'),
      )
    )
    .orderBy(tasks.endDate);

  // KPI per sheet
  const kpiRows = await db
    .select({
      sheetType: sheetTypes.code,
      total: sql<number>`count(${tasks.id})`,
      avgProgress: sql<number>`avg(${tasks.progressPercent})`,
      delayed: sql<number>`sum(case when ${tasks.endDate} < ${today} and ${tasks.progressPercent} < 1 then 1 else 0 end)`,
    })
    .from(tasks)
    .innerJoin(workPackages, eq(tasks.packageId, workPackages.id))
    .innerJoin(sheetTypes, eq(workPackages.sheetTypeId, sheetTypes.id))
    .groupBy(sheetTypes.code);

  return NextResponse.json({ delayedTasks, kpi: kpiRows, totalDelayed: delayedTasks.length });
}