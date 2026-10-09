import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/bao-mat/auth";
import { hoanTatKhoiPhuc } from "@/lib/bao-mat/offline-recovery";
import {
  jsonOffline,
  loiOffline,
  moDauOffline,
  phanHoiLoiOffline,
  thietBiCuaToi,
} from "@/lib/bao-mat/offline-http";

export const dynamic = "force-dynamic";

// POST /api/offline/recovery/:id/complete — chủ dữ liệu hoàn tất khôi phục đã được Admin duyệt,
// CHỈ trên đúng thiết bị mới đã gửi yêu cầu (proof hiện tại, khác → 403). Khoá chưa retire của
// thiết bị cũ được bọc lại thành khoá mới của thiết bị này cho dự án còn quyền; mất quyền → bỏ
// qua + đếm. Trả `{ mapping: [{ oldKeyId, newKeyId, oldKeyVersion }], skipped }` — chỉ id, không
// khoá; client mở khoá qua /api/offline/vault/unlock như thường.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return loiOffline(401, "unauthenticated", "Chưa đăng nhập");
  const md = await moDauOffline(req, user, {
    kiemOrigin: true,
    canVault: true,
    gioiHan: { ten: "recovery-complete", max: 10 },
  });
  if (!md.ok) return md.res;
  const { id } = await params;
  try {
    const thietBi = await thietBiCuaToi(user, md.proofHash);
    return jsonOffline(await hoanTatKhoiPhuc(user, thietBi, md.keyring!, id));
  } catch (e) {
    return phanHoiLoiOffline(e);
  }
}
