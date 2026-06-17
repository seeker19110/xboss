import { getCurrentUser } from '@/lib/auth';
import { queryOne, run } from '@/lib/db';
import { readFile, unlink } from 'fs/promises';
import { join } from 'path';
import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Chưa đăng nhập' }, { status: 401 });

  const { id } = await params;
  const file = await queryOne<{ file_name: string; name: string }>(
    `SELECT file_name, name FROM ifc_files WHERE id = ?`,
    Number(id)
  );
  if (!file) return Response.json({ error: 'Không tìm thấy file' }, { status: 404 });

  const filePath = join(process.cwd(), 'data', 'uploads', file.file_name);
  try {
    const data = await readFile(filePath);
    return new Response(data, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(file.name)}"`,
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch {
    return Response.json({ error: 'Không đọc được file' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Chưa đăng nhập' }, { status: 401 });
  if (user.role !== 'admin') {
    return Response.json({ error: 'Chỉ Admin mới được xoá bản vẽ' }, { status: 403 });
  }

  const { id } = await params;
  const file = await queryOne<{ file_name: string }>(
    `SELECT file_name FROM ifc_files WHERE id = ?`,
    Number(id)
  );
  if (!file) return Response.json({ error: 'Không tìm thấy file' }, { status: 404 });

  try {
    await unlink(join(process.cwd(), 'data', 'uploads', file.file_name));
  } catch { /* file đã bị xoá hoặc không tồn tại */ }

  await run(`DELETE FROM ifc_files WHERE id = ?`, Number(id));
  return Response.json({ ok: true });
}
