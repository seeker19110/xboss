import { NextResponse } from "next/server";
import { getCurrentUser, type Role } from "@/lib/auth";
import { runMaterialSync } from "@/lib/material-sync";

export const dynamic = "force-dynamic";

const canSync = (r?: Role) => r === "admin" || r === "pm";

// POST /api/materials/sync → đồng bộ hai chiều vật tư ↔ Google Sheet (Admin/PM).
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!canSync(user.role))
    return NextResponse.json({ error: "Chỉ Admin/PM được đồng bộ Google Sheet" }, { status: 403 });

  try {
    const summary = await runMaterialSync();
    return NextResponse.json({ ok: true, summary });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Lỗi đồng bộ Google Sheet";
    console.error("POST /api/materials/sync error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
