import "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CAN } from "@/lib/bao-mat/auth";
import { kiemDieuKienKy } from "@/lib/ky-thuat/engineering-esignature";

// ─────────────────────────────────────────────────────────────────────────────
// Hồi quy lỗ hổng Cao A3 (audit 2026-08-24) trên POST /api/engineering/esign/sign:
//   1. gate bằng `CAN.viewEngineeringGraph` → vai trò CHỈ-XEM `bch` ký được;
//   2. `signatoryId` do client chọn, không ràng buộc tài khoản → 1 user ký cả 3 bên;
//   3. `if (signatory.otpCode && otpCode)` → bỏ trường `otpCode` là qua mặt OTP;
//   4. chỉ chặn status 'signed' → ký sai thứ tự được;
//   5. `projectId` lấy thẳng từ body, không đối chiếu `visibleProjectIds`.
// ─────────────────────────────────────────────────────────────────────────────

const NGUOI_KY = { userId: 7, status: "ready", otpCode: null, otpExpiresAt: null };

describe("e-Sign: siết quyền ký", () => {
  it("ca 1 — vai trò chỉ-xem và subcon không có quyền ký", () => {
    for (const r of ["bch", "cdt", "viewer", "subcon"] as const) {
      assert.equal(CAN.signEngineeringEsign(r), false, `${r} không được phép ký`);
    }
    for (const r of ["admin", "pm", "engineer"] as const) {
      assert.equal(CAN.signEngineeringEsign(r), true, `${r} phải được phép ký`);
    }
  });

  it("ca 2 — user A ký mục của user B → 403; chưa gắn tài khoản → 422", () => {
    const khac = kiemDieuKienKy(NGUOI_KY, 8);
    assert.equal(khac.ok, false);
    assert.equal(khac.ok === false && khac.status, 403);

    const chuaGan = kiemDieuKienKy({ ...NGUOI_KY, userId: null }, 7);
    assert.equal(chuaGan.ok, false);
    assert.equal(chuaGan.ok === false && chuaGan.status, 422);

    // Đúng chủ tài khoản thì đi qua.
    assert.equal(kiemDieuKienKy(NGUOI_KY, 7).ok, true);
  });

  it("ca 3 — có otp_code mà request không gửi otpCode → 422", () => {
    const hetHan = new Date(Date.now() + 5 * 60_000).toISOString();
    const coOtp = { ...NGUOI_KY, otpCode: "123456", otpExpiresAt: hetHan };

    const thieu = kiemDieuKienKy(coOtp, 7);
    assert.equal(thieu.ok, false, "thiếu OTP phải bị chặn (trước đây: ký thành công)");
    assert.equal(thieu.ok === false && thieu.status, 422);

    const sai = kiemDieuKienKy(coOtp, 7, "999999");
    assert.equal(sai.ok === false && sai.status, 422);

    // OTP đúng nhưng đã hết hạn → vẫn chặn.
    const qua = kiemDieuKienKy(
      { ...coOtp, otpExpiresAt: new Date(Date.now() - 60_000).toISOString() },
      7,
      "123456",
    );
    assert.equal(qua.ok === false && qua.status, 422);

    assert.equal(kiemDieuKienKy(coOtp, 7, "123456").ok, true);
  });

  it("ca 4 — signatory status='waiting' → 409 (ký sai thứ tự)", () => {
    const cho = kiemDieuKienKy({ ...NGUOI_KY, status: "waiting" }, 7);
    assert.equal(cho.ok, false);
    assert.equal(cho.ok === false && cho.status, 409);

    const daKy = kiemDieuKienKy({ ...NGUOI_KY, status: "signed" }, 7);
    assert.equal(daKy.ok === false && daKy.status, 409);
  });

  it("ca 5 — route chốt projectId qua chotProjectIdChoGhi, không tin body", () => {
    const src = readFileSync(
      new URL("../app/api/engineering/esign/sign/route.ts", import.meta.url),
      "utf8",
    );
    assert.ok(
      src.includes("chotProjectIdChoGhi"),
      "route phải đối chiếu projectId với visibleProjectIds",
    );
    assert.ok(!/Number\(body\.projectId/.test(src), "route không được lấy thẳng projectId từ body");
    assert.ok(
      src.includes("CAN.signEngineeringEsign"),
      "route phải gate bằng quyền KÝ, không phải quyền XEM",
    );
  });
});
