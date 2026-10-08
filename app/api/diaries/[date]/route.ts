import { phanHoiLoiCoStatus } from "@/lib/nen/loi";
import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, run, withTransaction } from "@/lib/db";
import { getCurrentUser, type Role } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import {
  buildDiaryPrefill,
  getDiaryByDate,
  assertDiaryUnlocked,
  baseVersionNhatKy,
  dieuKienThoa,
  docDieuKienNhatKy,
  etagNhatKy,
} from "@/lib/hien-truong/diary";
import {
  bamYeuCau,
  docThaoTacHangDoi,
  ghiBienNhan,
  khoaVaTraBienNhan,
  type PhamViBienNhan,
} from "@/lib/bao-mat/offline-receipt";
import { chotNguCanhHangDoi, traLoiOfflineHoacNem } from "@/lib/bao-mat/offline-http";
import { LoiOffline } from "@/lib/bao-mat/offline-devices";
import { DIARY_EDIT_ROLES } from "@/lib/nen/roles";

export const dynamic = "force-dynamic";

const canEdit = (r?: Role) => !!r && DIARY_EDIT_ROLES.includes(r);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// GET /api/diaries/:date → nhật ký ngày đó (null nếu chưa lập, hoặc thuộc dự án khác —
// M22) + prefill tự tổng hợp scoped theo dự án đang chọn. `etag` (kèm header ETag) = phiên bản
// mạnh để PUT gửi lại qua If-Match (S06); null khi chưa có nhật ký → PUT dùng If-None-Match: *.
export async function GET(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ date: string }> },
) {
  const { date } = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!DATE_RE.test(date))
    return NextResponse.json({ error: "Ngày không hợp lệ (YYYY-MM-DD)" }, { status: 422 });

  const projectId = await getCurrentProjectId(user);
  const diary = projectId != null ? await getDiaryByDate(date, projectId) : undefined;
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

  const prefill = await buildDiaryPrefill(date, projectId ?? undefined);

  const etag = diary ? etagNhatKy(diary) : null;
  return NextResponse.json(
    { diary: diary ?? null, manpower, photoIds, prefill, etag },
    { headers: { "Cache-Control": "private, no-store", ...(etag ? { ETag: etag } : {}) } },
  );
}

type ManpowerInput = { crew: string; headcount: number; note?: string | null };

// PUT /api/diaries/:date → upsert draft (Admin/PM/engineer). body:
// { weatherAm?, weatherPm?, workDone?, obstacles?, safetyNote?, manpower?: ManpowerInput[], photoIds?: number[] }
// FULL-REPLACE nên BẮT BUỘC precondition (S06, A2-FR11): sửa → If-Match: <etag từ GET>; tạo mới →
// If-None-Match: *. Thiếu → 428; lệch phiên bản → 412 (không đè bản người khác vừa lưu).
// Hàng đợi offline (kind `diary_note`): thêm Idempotency-Key + X-XBoss-Context → receipt; replay
// hợp lệ được trả TRƯỚC khi so If-Match (mất ACK không thành 412 giả).
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

  const projectId = await getCurrentProjectId(user);
  // Context kiểm trước mọi đánh giá khác về dự án: tab cũ sau khi đổi dự án nhận 409 (A2-AC02).
  let op: ReturnType<typeof docThaoTacHangDoi>;
  try {
    op = docThaoTacHangDoi(req.headers);
    if (op) await chotNguCanhHangDoi(op.context, user, projectId);
  } catch (e) {
    return traLoiOfflineHoacNem(e);
  }
  if (projectId == null)
    return NextResponse.json({ error: "Chưa có dự án nào để lập nhật ký" }, { status: 422 });

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
  // Lỗi đầu vào (422) báo trước, precondition (428/400) sau — sửa form không cần tải lại phiên bản.
  const dk = docDieuKienNhatKy(req.headers.get("if-match"), req.headers.get("if-none-match"));
  if (!dk.ok) return NextResponse.json({ error: dk.error, code: dk.code }, { status: dk.status });
  // Nội dung ĐÚNG như sẽ ghi — vừa là dữ liệu UPDATE/INSERT vừa là payload băm receipt.
  const noiDung = {
    weatherAm: body.weatherAm ?? null,
    weatherPm: body.weatherPm ?? null,
    workDone: body.workDone ?? null,
    obstacles: body.obstacles ?? null,
    safetyNote: body.safetyNote ?? null,
    manpower: manpowerInput.map((m) => ({
      crew: String(m.crew).trim(),
      headcount: Number(m.headcount),
      note: m.note ?? null,
    })),
    photoIds,
  };

  const bn: PhamViBienNhan | null = op
    ? {
        user,
        projectId,
        operationId: op.operationId,
        kind: "diary_note",
        hash: bamYeuCau({
          kind: "diary_note",
          orgId: user.orgId,
          projectId,
          userId: user.id,
          target: { date },
          payload: noiDung,
          baseVersion: baseVersionNhatKy(dk.dieuKien),
        }),
      }
    : null;

  try {
    const kq = await withTransaction(async () => {
      if (bn) {
        const replay = await khoaVaTraBienNhan(bn);
        if (replay) return { replay } as const;
      }
      // Tuần tự hoá theo (dự án, ngày) TRƯỚC khi đọc: hai request tạo mới (If-None-Match: *) cùng
      // ngày không cùng thấy "chưa có" rồi một bên vấp UNIQUE. Thứ tự khoá: receipt → ngày → dòng.
      await queryOne(
        `SELECT pg_advisory_xact_lock(hashtextextended(?, 0))`,
        `site-diary|${projectId}|${date}`,
      );
      // site_diaries nay UNIQUE(diary_date, project_id) — tìm đúng nhật ký của dự án
      // đang chọn cho ngày này (dự án khác có nhật ký cùng ngày là hợp lệ, không đụng độ).
      const existing = await queryOne<{ id: number; status: string; version: number }>(
        `SELECT id, status, version FROM site_diaries WHERE diary_date = ? AND project_id = ? FOR UPDATE`,
        date,
        projectId,
      );
      // So phiên bản DƯỚI khoá rồi mới ghi (A2-FR11).
      if (!dieuKienThoa(dk.dieuKien, existing)) return { lechPhienBan: true } as const;
      assertDiaryUnlocked(existing?.status);

      let id: number;
      if (existing) {
        await run(
          `UPDATE site_diaries SET weather_am = ?, weather_pm = ?, work_done = ?, obstacles = ?,
                                    safety_note = ?
             WHERE id = ?`,
          noiDung.weatherAm,
          noiDung.weatherPm,
          noiDung.workDone,
          noiDung.obstacles,
          noiDung.safetyNote,
          existing.id,
        );
        id = existing.id;
      } else {
        const inserted = await queryOne<{ id: number }>(
          `INSERT INTO site_diaries (diary_date, weather_am, weather_pm, work_done, obstacles,
                                      safety_note, created_by, project_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
          date,
          noiDung.weatherAm,
          noiDung.weatherPm,
          noiDung.workDone,
          noiDung.obstacles,
          noiDung.safetyNote,
          user.id,
          projectId,
        );
        id = inserted!.id;
      }

      await run(`DELETE FROM diary_manpower WHERE diary_id = ?`, id);
      for (const m of noiDung.manpower) {
        await run(
          `INSERT INTO diary_manpower (diary_id, crew, headcount, note) VALUES (?, ?, ?, ?)`,
          id,
          m.crew,
          m.headcount,
          m.note,
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

      // Phiên bản SAU mọi ghi (trigger dòng con cũng tăng version) — đọc trong transaction để
      // ETag trả về đúng bản của chính request này, không phải bản của request khác COMMIT sau.
      const sau = await queryOne<{ version: number }>(
        `SELECT version FROM site_diaries WHERE id = ?`,
        id,
      );
      const etag = etagNhatKy({ id, version: Number(sau?.version) });
      const receipt = bn
        ? await ghiBienNhan(bn, {
            resourceType: "site_diary",
            resourceId: String(id),
            version: etag,
          })
        : undefined;
      return { id, etag, receipt } as const;
    });

    if ("replay" in kq) return NextResponse.json({ receipt: kq.replay });
    if ("lechPhienBan" in kq)
      return NextResponse.json(
        {
          error:
            "Nhật ký ngày này đã được cập nhật ở nơi khác (hoặc vừa được tạo) — tải lại để xem bản mới nhất rồi lưu lại",
          code: "version_mismatch",
        },
        { status: 412 },
      );

    const diary = await getDiaryByDate(date, projectId);
    return NextResponse.json(
      { id: kq.id, diary, etag: kq.etag, ...(kq.receipt ? { receipt: kq.receipt } : {}) },
      { headers: { ETag: kq.etag } },
    );
  } catch (err: unknown) {
    if (err instanceof LoiOffline) return traLoiOfflineHoacNem(err);
    const e = err as { code?: string };
    // Vi phạm khoá ngoại (23503) = client gửi id không tồn tại, vd `photoIds` trỏ tới ảnh đã bị
    // xoá. Đó là lỗi ĐẦU VÀO chứ không phải sự cố máy chủ: để nguyên sẽ trả 500 kèm thông báo
    // thô của Postgres — vừa không giúp người dùng sửa được gì, vừa lộ tên bảng/ràng buộc ra
    // ngoài. Trả 422 với thông điệp tiếng Việt như mọi lỗi đầu vào khác của route này.
    if (e.code === "23503")
      return NextResponse.json(
        { error: "Dữ liệu tham chiếu không tồn tại (ảnh hoặc tổ đội đã bị xoá) — tải lại trang" },
        { status: 422 },
      );
    return phanHoiLoiCoStatus(err);
  }
}
