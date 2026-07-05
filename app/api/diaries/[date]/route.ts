import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, run, withTransaction } from "@/lib/db";
import { getCurrentUser, type Role } from "@/lib/auth";
import { buildDiaryPrefill, assertDiaryUnlocked } from "@/lib/diary";

export const dynamic = "force-dynamic";

const canEdit = (r?: Role) => r === "admin" || r === "pm" || r === "engineer";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type DiaryRow = {
  id: number;
  diaryDate: string;
  weatherAm: string | null;
  weatherPm: string | null;
  workDone: string | null;
  obstacles: string | null;
  safetyNote: string | null;
  status: "draft" | "locked";
  createdBy: number | null;
  lockedBy: number | null;
  lockedByName: string | null;
  lockedAt: string | null;
};

const SELECT_DIARY = `
  SELECT sd.id, sd.diary_date AS "diaryDate", sd.weather_am AS "weatherAm",
         sd.weather_pm AS "weatherPm", sd.work_done AS "workDone", sd.obstacles,
         sd.safety_note AS "safetyNote", sd.status, sd.created_by AS "createdBy",
         sd.locked_by AS "lockedBy", u.name AS "lockedByName", sd.locked_at AS "lockedAt"
    FROM site_diaries sd
    LEFT JOIN users u ON u.id = sd.locked_by
   WHERE sd.diary_date = ?`;

// GET /api/diaries/:date → nhật ký ngày đó (null nếu chưa lập) + prefill tự tổng hợp.
export async function GET(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ date: string }> },
) {
  const { date } = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!DATE_RE.test(date))
    return NextResponse.json({ error: "Ngày không hợp lệ (YYYY-MM-DD)" }, { status: 422 });

  const diary = await queryOne<DiaryRow>(SELECT_DIARY, date);
  const manpower = diary
    ? await query<{ id: number; crew: string; headcount: number; note: string | null }>(
        `SELECT id, crew, headcount, note FROM diary_manpower WHERE diary_id = ? ORDER BY id`,
        diary.id,
      )
    : [];
  const photoIds = diary
    ? (
        await query<{ photoId: number }>(
          `SELECT photo_id AS "photoId" FROM diary_photos WHERE diary_id = ?`,
          diary.id,
        )
      ).map((r) => r.photoId)
    : [];

  const prefill = await buildDiaryPrefill(date);

  return NextResponse.json({ diary, manpower, photoIds, prefill });
}

type ManpowerInput = { crew: string; headcount: number; note?: string | null };

// PUT /api/diaries/:date → upsert draft (Admin/PM/engineer). body:
// { weatherAm?, weatherPm?, workDone?, obstacles?, safetyNote?, manpower?: ManpowerInput[], photoIds?: number[] }
export async function PUT(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ date: string }> },
) {
  const { date } = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!canEdit(user.role))
    return NextResponse.json({ error: "Chỉ Admin/PM/Kỹ sư được lập nhật ký" }, { status: 403 });
  if (!DATE_RE.test(date))
    return NextResponse.json({ error: "Ngày không hợp lệ (YYYY-MM-DD)" }, { status: 422 });

  const body = await req.json().catch(() => ({}));
  const manpowerInput: ManpowerInput[] = Array.isArray(body.manpower) ? body.manpower : [];
  const seenCrews = new Set<string>();
  for (const m of manpowerInput) {
    const crew = String(m.crew ?? "").trim();
    if (!crew)
      return NextResponse.json({ error: "Tên tổ đội không được để trống" }, { status: 422 });
    if (seenCrews.has(crew))
      return NextResponse.json({ error: `Tổ đội "${crew}" bị lặp lại` }, { status: 422 });
    seenCrews.add(crew);
    const headcount = Number(m.headcount);
    if (!Number.isInteger(headcount) || headcount < 0)
      return NextResponse.json(
        { error: `Số người của tổ đội "${crew}" phải là số nguyên ≥ 0` },
        { status: 422 },
      );
  }
  const photoIds: number[] = Array.isArray(body.photoIds)
    ? body.photoIds.map(Number).filter((n: number) => Number.isInteger(n))
    : [];

  try {
    const diaryId = await withTransaction(async () => {
      const existing = await queryOne<{ id: number; status: string }>(
        `SELECT id, status FROM site_diaries WHERE diary_date = ? FOR UPDATE`,
        date,
      );
      assertDiaryUnlocked(existing?.status);

      let id: number;
      if (existing) {
        await run(
          `UPDATE site_diaries SET weather_am = ?, weather_pm = ?, work_done = ?, obstacles = ?,
                                    safety_note = ?
             WHERE id = ?`,
          body.weatherAm ?? null,
          body.weatherPm ?? null,
          body.workDone ?? null,
          body.obstacles ?? null,
          body.safetyNote ?? null,
          existing.id,
        );
        id = existing.id;
      } else {
        const inserted = await queryOne<{ id: number }>(
          `INSERT INTO site_diaries (diary_date, weather_am, weather_pm, work_done, obstacles,
                                      safety_note, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
          date,
          body.weatherAm ?? null,
          body.weatherPm ?? null,
          body.workDone ?? null,
          body.obstacles ?? null,
          body.safetyNote ?? null,
          user.id,
        );
        id = inserted!.id;
      }

      await run(`DELETE FROM diary_manpower WHERE diary_id = ?`, id);
      for (const m of manpowerInput) {
        await run(
          `INSERT INTO diary_manpower (diary_id, crew, headcount, note) VALUES (?, ?, ?, ?)`,
          id,
          String(m.crew).trim(),
          Number(m.headcount),
          m.note ?? null,
        );
      }

      await run(`DELETE FROM diary_photos WHERE diary_id = ?`, id);
      for (const photoId of photoIds) {
        await run(
          `INSERT INTO diary_photos (diary_id, photo_id) VALUES (?, ?)
           ON CONFLICT DO NOTHING`,
          id,
          photoId,
        );
      }

      return id;
    });

    const diary = await queryOne<DiaryRow>(SELECT_DIARY, date);
    return NextResponse.json({ id: diaryId, diary });
  } catch (err: unknown) {
    const e = err as { message?: string; status?: number };
    return NextResponse.json({ error: e.message ?? String(err) }, { status: e.status ?? 500 });
  }
}
