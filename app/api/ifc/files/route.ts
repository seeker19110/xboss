import { getCurrentUser } from '@/lib/auth';
import { query, insertId } from '@/lib/db';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Chưa đăng nhập' }, { status: 401 });

  const files = await query<{
    id: number; name: string; file_size: number;
    uploaded_at: string; uploaded_by_name: string;
  }>(
    `SELECT f.id, f.name, f.file_size, f.uploaded_at, u.name as uploaded_by_name
     FROM ifc_files f LEFT JOIN users u ON u.id = f.uploaded_by
     ORDER BY f.uploaded_at DESC`
  );

  return Response.json(files);
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Chưa đăng nhập' }, { status: 401 });
  if (user.role !== 'admin' && user.role !== 'pm') {
    return Response.json({ error: 'Chỉ Admin/PM mới được upload bản vẽ' }, { status: 403 });
  }

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  if (!file) return Response.json({ error: 'Thiếu file' }, { status: 400 });

  if (!file.name.toLowerCase().endsWith('.ifc')) {
    return Response.json({ error: 'Chỉ chấp nhận file .ifc' }, { status: 400 });
  }

  const MAX = 500 * 1024 * 1024; // 500 MB
  if (file.size > MAX) {
    return Response.json({ error: 'File quá lớn (tối đa 500 MB)' }, { status: 400 });
  }

  const uploadDir = join(process.cwd(), 'data', 'uploads');
  await mkdir(uploadDir, { recursive: true });

  const fileName = `ifc-${Date.now()}-${Math.random().toString(36).slice(2)}.ifc`;
  const filePath = join(uploadDir, fileName);
  await writeFile(filePath, Buffer.from(await file.arrayBuffer()));

  const id = await insertId(
    `INSERT INTO ifc_files (name, file_name, file_size, uploaded_by) VALUES (?, ?, ?, ?)`,
    file.name, fileName, file.size, user.id
  );

  return Response.json({ id, name: file.name }, { status: 201 });
}
