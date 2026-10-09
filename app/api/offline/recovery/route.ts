import { NextRequest } from "next/server";
import { CAN, getCurrentUser } from "@/lib/bao-mat/auth";
import {
  danhSachYeuCauKhoiPhuc,
  MAX_GHI_CHU,
  taoYeuCauKhoiPhuc,
} from "@/lib/bao-mat/offline-recovery";
import {
  jsonOffline,
  loiOffline,
  moDauOffline,
  phanHoiLoiOffline,
  thietBiCuaToi,
} from "@/lib/bao-mat/offline-http";
import { sendPushToUsers } from "@/lib/van-hanh/push";
import { log } from "@/lib/nen/log";

export const dynamic = "force-dynamic";

// GET /api/offline/recovery — yêu cầu khôi phục vault offline (M131 §3): Admin (CAN.manageUsers)
// thấy cả tổ chức, người khác chỉ thấy của chính mình. Không chứa khoá. Không cần KEK.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return loiOffline(401, "unauthenticated", "Chưa đăng nhập");
  const md = await moDauOffline(req, user, { kiemOrigin: false, canVault: false });
  if (!md.ok) return md.res;
  try {
    const caToChuc = user.role === "admin" && CAN.manageUsers(user.role);
    return jsonOffline({ requests: await danhSachYeuCauKhoiPhuc(user, caToChuc) });
  } catch (e) {
    return phanHoiLoiOffline(e);
  }
}

// POST /api/offline/recovery  body: { oldDeviceId: uuid, reason?: string ≤500 }
// Chủ dữ liệu trên thiết bị MỚI (proof hiện tại đã đăng ký, chưa thu hồi) xin khôi phục khoá của
// thiết bị CŨ của chính mình (mất proof). Tạo `pending` + báo Admin cùng tổ chức. Rate limit
// 5 lần/ngày/người. Admin duyệt ở PATCH /api/offline/recovery/:id.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return loiOffline(401, "unauthenticated", "Chưa đăng nhập");
  const md = await moDauOffline(req, user, {
    kiemOrigin: true,
    canVault: true,
    gioiHan: { ten: "recovery", max: 5, phut: 24 * 60 },
  });
  if (!md.ok) return md.res;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const oldDeviceId = body?.oldDeviceId;
  const lyDo = body?.reason;
  if (
    typeof oldDeviceId !== "string" ||
    (lyDo !== undefined && lyDo !== null && typeof lyDo !== "string") ||
    (typeof lyDo === "string" && lyDo.trim().length > MAX_GHI_CHU)
  )
    return loiOffline(
      422,
      "invalid_body",
      `Cần { oldDeviceId } và lý do (nếu có) tối đa ${MAX_GHI_CHU} ký tự`,
    );
  try {
    const thietBi = await thietBiCuaToi(user, md.proofHash);
    const reason = typeof lyDo === "string" && lyDo.trim() ? lyDo.trim() : null;
    const { yeuCau, adminIds } = await taoYeuCauKhoiPhuc(user, thietBi, oldDeviceId, reason);
    await sendPushToUsers(adminIds, {
      title: "Yêu cầu khôi phục dữ liệu ngoại tuyến",
      body: `${user.name} cần Admin duyệt khôi phục từ thiết bị cũ`,
      url: "/admin/thiet-bi-offline?tab=khoi-phuc",
    }).catch((e: unknown) =>
      log.warn("Không gửi được push yêu cầu khôi phục offline", {
        loi: e instanceof Error ? e.message : String(e),
      }),
    );
    return jsonOffline({ request: yeuCau }, 201);
  } catch (e) {
    return phanHoiLoiOffline(e);
  }
}
