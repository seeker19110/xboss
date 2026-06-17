import { getCurrentUser } from '@/lib/auth';
import { query, run } from '@/lib/db';
import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

const VALID_STATUSES = new Set(['chua_lap', 'dang_lap', 'hoan_thanh']);

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Chưa đăng nhập' }, { status: 401 });

  const fileId = req.nextUrl.searchParams.get('fileId');
  if (!fileId || isNaN(Number(fileId))) {
    return Response.json({ error: 'Thiếu fileId' }, { status: 400 });
  }

  const rows = await query<{
    global_id: string; status: string; note: string | null;
    updated_at: string; updated_by_name: string | null;
  }>(
    `SELECT e.global_id, e.status, e.note, e.updated_at, u.name as updated_by_name
     FROM ifc_element_status e
     LEFT JOIN users u ON u.id = e.updated_by
     WHERE e.ifc_file_id = ?
     ORDER BY e.updated_at DESC`,
    Number(fileId)
  );

  return Response.json(rows);
}

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Chưa đăng nhập' }, { status: 401 });

  const body = await req.json() as {
    fileId: number;
    updates: Array<{ globalId: string; status: string; note?: string }>;
  };

  if (!body?.fileId || !Array.isArray(body.updates) || body.updates.length === 0) {
    return Response.json({ error: 'Dữ liệu không hợp lệ' }, { status: 400 });
  }

  for (const u of body.updates) {
    if (!u.globalId || !VALID_STATUSES.has(u.status)) {
      return Response.json(
        { error: `Trạng thái không hợp lệ: ${u.status}` },
        { status: 400 }
      );
    }
  }

  for (const update of body.updates) {
    await run(
      `INSERT INTO ifc_element_status (ifc_file_id, global_id, status, note, updated_by, updated_at)
       VALUES (?, ?, ?, ?, ?, NOW())
       ON CONFLICT (ifc_file_id, global_id)
       DO UPDATE SET status = EXCLUDED.status,
                     note = EXCLUDED.note,
                     updated_by = EXCLUDED.updated_by,
                     updated_at = NOW()`,
      body.fileId, update.globalId, update.status, update.note ?? null, user.id
    );
  }

  return Response.json({ ok: true, count: body.updates.length });
}
