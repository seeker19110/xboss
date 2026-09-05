// Kiểm lớp lỗi nghiệp vụ + helper ánh xạ lỗi → phản hồi HTTP (lib/nen/loi.ts).
// Không chạm DB nên không cần tests/setup.ts (bám khuôn tests/money.test.ts).
//
// Ca quan trọng nhất của file này là ca CUỐI: lỗi KHÔNG phải nghiệp vụ vẫn phải ra 500.
// Nuốt lỗi hệ thống thành 4xx còn nguy hiểm hơn bệnh đang chữa (client tưởng mình gửi sai
// trong khi server đang hỏng, cảnh báo Sentry im lặng).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LoiNghiepVu,
  loiDauVao,
  loiKhongCoQuyen,
  loiKhongTimThay,
  loiXungDot,
  loiKhongXuLyDuoc,
  phanHoiLoi,
} from "@/lib/nen/loi";

test("các hàm tạo gắn đúng mã trạng thái và giữ nguyên thông điệp", () => {
  assert.equal(loiDauVao("Mã QR hỏng").status, 400);
  assert.equal(loiKhongCoQuyen("Không đủ quyền").status, 403);
  assert.equal(loiKhongTimThay("Không tìm thấy gói thầu").status, 404);
  assert.equal(loiXungDot("Đối tượng đã bị xoá mềm").status, 409);
  assert.equal(loiKhongXuLyDuoc("Thiếu điểm toạ độ").status, 422);
  const e = loiKhongTimThay("Không tìm thấy phiên Swarm Debate.");
  assert.ok(e instanceof LoiNghiepVu);
  assert.ok(e instanceof Error);
  assert.equal(e.message, "Không tìm thấy phiên Swarm Debate.");
});

test("phanHoiLoi: LoiNghiepVu → đúng mã 4xx, thân vẫn { error: <thông điệp> }", async () => {
  for (const [tao, ma] of [
    [loiDauVao, 400],
    [loiKhongCoQuyen, 403],
    [loiKhongTimThay, 404],
    [loiXungDot, 409],
    [loiKhongXuLyDuoc, 422],
  ] as const) {
    const res = phanHoiLoi(tao("Thông điệp tiếng Việt"));
    assert.equal(res.status, ma);
    assert.deepEqual(await res.json(), { error: "Thông điệp tiếng Việt" });
  }
});

test("phanHoiLoi: lớp con của LoiNghiepVu (vd EsignSignError) giữ nguyên mã của nó", async () => {
  class LoiKy extends LoiNghiepVu {
    constructor(message: string, status: number) {
      super(message, status);
      this.name = "LoiKy";
    }
  }
  const res = phanHoiLoi(new LoiKy("OTP đã hết hạn", 409));
  assert.equal(res.status, 409);
  assert.deepEqual(await res.json(), { error: "OTP đã hết hạn" });
});

test("phanHoiLoi: LỖI HỆ THỐNG vẫn ra 500, không bị hạ xuống 4xx", async () => {
  // Lỗi Error thường (vd lỗi pg) — kể cả khi vô tình mang thuộc tính `status` là số 4xx,
  // vẫn phải ra 500: helper CỐ Ý chỉ nhận instanceof, không dò cấu trúc.
  const loiDb = Object.assign(new Error("invalid input syntax for type uuid"), {
    code: "22P02",
    status: 400,
  });
  const res = phanHoiLoi(loiDb);
  assert.equal(res.status, 500);
  assert.deepEqual(await res.json(), { error: "invalid input syntax for type uuid" });

  // Giá trị ném ra không phải Error.
  const res2 = phanHoiLoi("hỏng nặng");
  assert.equal(res2.status, 500);
  assert.deepEqual(await res2.json(), { error: "hỏng nặng" });

  // Không có thông điệp → dùng thông điệp mặc định của route (giữ hành vi cũ
  // `error.message || "Lỗi tải thiết bị IoT"`), vẫn là 500.
  const res3 = phanHoiLoi(new Error(""), "Lỗi tải thiết bị IoT");
  assert.equal(res3.status, 500);
  assert.deepEqual(await res3.json(), { error: "Lỗi tải thiết bị IoT" });
});
