import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCurrentUser, ensureDefaultUsers, COOKIE, parseToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  await ensureDefaultUsers();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ user: null }, { status: 401 });

  // M56 PR2 (đóng nợ kỹ thuật ghi ở PROGRESS.md): /api/auth/me nằm TRONG whitelist
  // /api/auth/* nên proxy.ts luôn cho request này qua (200) — route tự đọc cờ mustSetup2fa
  // từ chính token đang hiệu lực (không recompute từ DB, để khớp đúng cái proxy.ts THẬT SỰ
  // đang chặn theo) và đính kèm code để fetchMe() (điểm chạm duy nhất mọi trang dùng để lấy
  // user hiện tại) tự redirect NGAY ở lần gọi đầu tiên thay vì phải đợi 1 API khác bị 403.
  const token = (await cookies()).get(COOKIE)?.value;
  const parsed = token ? parseToken(token) : null;
  if (parsed?.mustSetup2fa) {
    return NextResponse.json({
      user,
      error: "Cần bật xác thực 2 lớp trước khi tiếp tục",
      code: "2fa_required",
    });
  }
  return NextResponse.json({ user });
}
