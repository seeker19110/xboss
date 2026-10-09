import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/bao-mat/auth";
import { MAX_GHI_CHU, quyetDinhYeuCau, type QuyetDinh } from "@/lib/bao-mat/offline-recovery";
import {
  jsonOffline,
  loiOffline,
  moDauOffline,
  phanHoiLoiOffline,
  requireAdminOffline2FA,
} from "@/lib/bao-mat/offline-http";

export const dynamic = "force-dynamic";

// PATCH /api/offline/recovery/:id  body: { decision: "approve" | "reject", note?: string ≤500 }
// Admin cùng tổ chức có CAN.manageUsers + 2FA quyết định yêu cầu `pending`; không quyết định yêu
// cầu của chính mình (403). Duyệt = thu hồi thiết bị cũ cùng transaction (chủ thiết bị phải đăng
// nhập lại). Phản hồi chỉ có trạng thái yêu cầu — không bao giờ chứa khoá/bản nháp. Không cần KEK.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return loiOffline(401, "unauthenticated", "Chưa đăng nhập");
  const md = await moDauOffline(req, user, {
    kiemOrigin: true,
    canVault: false,
    gioiHan: { ten: "recovery-decide", max: 30 },
  });
  if (!md.ok) return md.res;
  const chan = await requireAdminOffline2FA(user, "Chỉ Admin được duyệt yêu cầu khôi phục");
  if (chan) return chan;

  const { id } = await params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const decision = body?.decision;
  const note = body?.note;
  if (
    (decision !== "approve" && decision !== "reject") ||
    (note !== undefined && note !== null && typeof note !== "string") ||
    (typeof note === "string" && note.trim().length > MAX_GHI_CHU)
  )
    return loiOffline(
      422,
      "invalid_body",
      `Cần { decision: "approve" | "reject" } và ghi chú (nếu có) tối đa ${MAX_GHI_CHU} ký tự`,
    );
  try {
    const ghiChu = typeof note === "string" && note.trim() ? note.trim() : null;
    return jsonOffline({
      request: await quyetDinhYeuCau(user, id, decision as QuyetDinh, ghiChu),
    });
  } catch (e) {
    return phanHoiLoiOffline(e);
  }
}
