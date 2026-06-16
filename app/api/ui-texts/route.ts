import { NextRequest, NextResponse } from "next/server";
import { queryOne, run } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Kho text tuỳ chỉnh của giao diện (nhãn, tiêu đề...) — admin sửa inline.
// Lưu dạng JSON { key: value } trong cột projects.ui_texts.

// GET /api/ui-texts → { texts: Record<string,string> }
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const row = await queryOne<{ ui_texts: string | null }>(
    `SELECT ui_texts FROM projects LIMIT 1`);
  let texts: Record<string, string> = {};
  try { texts = JSON.parse(row?.ui_texts ?? "{}") ?? {}; } catch { /* dùng mặc định */ }
  return NextResponse.json({ texts });
}

// PATCH /api/ui-texts  body: { key: string, value: string } (chỉ Admin)
// value rỗng = đặt lại mặc định (xoá override).
export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (user.role !== "admin")
    return NextResponse.json({ error: "Chỉ Admin được sửa text giao diện" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const key = typeof body.key === "string" ? body.key.trim() : "";
  const value = typeof body.value === "string" ? body.value.trim() : "";
  if (!key) return NextResponse.json({ error: "Thiếu key" }, { status: 400 });

  const row = await queryOne<{ ui_texts: string | null }>(
    `SELECT ui_texts FROM projects LIMIT 1`);
  let texts: Record<string, string> = {};
  try { texts = JSON.parse(row?.ui_texts ?? "{}") ?? {}; } catch { /* reset */ }

  if (value) texts[key] = value;
  else delete texts[key];

  await run(`UPDATE projects SET ui_texts = ? WHERE id = (SELECT id FROM projects LIMIT 1)`,
    JSON.stringify(texts));
  return NextResponse.json({ ok: true, texts });
}
