import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCurrentUser, COOKIE, parseToken } from "@/lib/bao-mat/auth";
import { laLoiSchemaChuaSan, phanHoiSchemaChuaSan } from "@/lib/nen/loi";
import { dauRangBuocPhien } from "@/lib/bao-mat/session-token";

export const dynamic = "force-dynamic";

// Payload danh tính/2FA không được lưu bởi HTTP cache, kể cả response 401.
const noStoreHeaders = { "Cache-Control": "private, no-store" };

export async function GET() {
  let user;
  try {
    user = await getCurrentUser();
  } catch (err) {
    if (laLoiSchemaChuaSan(err)) return phanHoiSchemaChuaSan();
    throw err;
  }
  if (!user) return NextResponse.json({ user: null }, { status: 401, headers: noStoreHeaders });

  // M56 PR2 (đóng nợ kỹ thuật ghi ở PROGRESS.md): /api/auth/me nằm TRONG whitelist
  // /api/auth/* nên proxy.ts luôn cho request này qua (200) — route tự đọc cờ mustSetup2fa
  // từ chính token đang hiệu lực (không recompute từ DB, để khớp đúng cái proxy.ts THẬT SỰ
  // đang chặn theo) và đính kèm code để fetchMe() (điểm chạm duy nhất mọi trang dùng để lấy
  // user hiện tại) tự redirect NGAY ở lần gọi đầu tiên thay vì phải đợi 1 API khác bị 403.
  const token = (await cookies()).get(COOKIE)?.value;
  const parsed = token ? parseToken(token) : null;
  // S05: dấu ràng buộc actor mờ — client phát hiện đổi tài khoản (kể cả SSO) để dọn cache/khoá tab.
  const binding = parsed ? dauRangBuocPhien(parsed) : null;
  if (parsed?.mustSetup2fa) {
    return NextResponse.json(
      {
        user,
        binding,
        error: "Cần bật xác thực 2 lớp trước khi tiếp tục",
        code: "2fa_required",
      },
      { headers: noStoreHeaders },
    );
  }
  return NextResponse.json({ user, binding }, { headers: noStoreHeaders });
}
