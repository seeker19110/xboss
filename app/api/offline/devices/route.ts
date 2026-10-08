import { NextRequest } from "next/server";
import { CAN, getCurrentUser, isSecureCookie } from "@/lib/bao-mat/auth";
import {
  dangKyThietBi,
  danhSachThietBi,
  bamProof,
  docProof,
  taoProof,
  PROOF_COOKIE,
  PROOF_COOKIE_MAX_AGE,
  PROOF_COOKIE_PATH,
} from "@/lib/bao-mat/offline-devices";
import {
  jsonOffline,
  loiOffline,
  moDauOffline,
  phanHoiLoiOffline,
} from "@/lib/bao-mat/offline-http";

export const dynamic = "force-dynamic";

// GET /api/offline/devices — thiết bị offline: Admin (CAN.manageUsers) thấy cả tổ chức, người khác
// chỉ thấy của chính mình. Không bao giờ trả proof/khoá. Không cần KEK (vẫn xem/thu hồi được khi
// tính năng đang tắt).
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return loiOffline(401, "unauthenticated", "Chưa đăng nhập");
  const md = await moDauOffline(req, user, { kiemOrigin: false, canVault: false });
  if (!md.ok) return md.res;
  try {
    const caToChuc = user.role === "admin" && CAN.manageUsers(user.role);
    return jsonOffline({ devices: await danhSachThietBi(user, md.proofHash, caToChuc) });
  } catch (e) {
    return phanHoiLoiOffline(e);
  }
}

// POST /api/offline/devices — đăng ký trình duyệt hiện tại cho actor (idempotent, luôn
// shared-safe). Chưa có proof → server sinh 32 byte ngẫu nhiên, đặt cookie HttpOnly/SameSite=Lax
// (Secure ở production HTTPS) chỉ gửi tới /api/offline; DB chỉ lưu SHA-256. Proof đã có (kể cả do
// tài khoản khác cùng trình duyệt tạo) được dùng lại — không ghi đè bản ghi của người khác.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return loiOffline(401, "unauthenticated", "Chưa đăng nhập");
  const md = await moDauOffline(req, user, {
    kiemOrigin: true,
    canVault: true,
    gioiHan: { ten: "device", max: 10 },
  });
  if (!md.ok) return md.res;
  try {
    let proofMoi: string | null = null;
    let proofHash = md.proofHash;
    if (!proofHash) {
      proofMoi = taoProof();
      proofHash = bamProof(docProof(proofMoi) as Buffer);
    }
    const { thietBi, moi } = await dangKyThietBi(user, proofHash);
    const res = jsonOffline({ device: thietBi, created: moi }, moi ? 201 : 200);
    if (proofMoi)
      res.cookies.set(PROOF_COOKIE, proofMoi, {
        httpOnly: true,
        secure: isSecureCookie(req),
        sameSite: "lax",
        path: PROOF_COOKIE_PATH,
        maxAge: PROOF_COOKIE_MAX_AGE,
      });
    return res;
  } catch (e) {
    return phanHoiLoiOffline(e);
  }
}
