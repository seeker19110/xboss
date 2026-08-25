// Test cho 3 route CHƯA có test nào trước file này:
//   app/api/engineering/cad/normalize/route.ts
//   app/api/engineering/cad/convert-to-dxf/route.ts
//   app/api/engineering/cad/parse-dxf/route.ts
// Cả 3 chỉ gọi getCurrentUser() (next/headers) nên KHÔNG gọi handler trực tiếp ngoài request
// scope thật (xem quy ước ở tests/cad-block-proposal-withdraw.test.ts) — phủ qua route-source
// + gọi thẳng các hàm thuần route uỷ quyền (normalizeCadLayers/convertTcvn3ToUnicode đã có test
// đơn vị riêng ở tests/engineering-cad-skills.test.ts nên KHÔNG lặp lại ở đây, chỉ kiểm ĐÚNG
// route có gọi và truyền tham số như mô tả).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function nguon(...phan: string[]): string {
  return readFileSync(join(process.cwd(), "app", "api", "engineering", "cad", ...phan, "route.ts"), "utf8");
}

// ===== normalize =====

test("route normalize: force-dynamic, 401/403 CAN.manageEngineeringTwin, rawLayers/legacyText tùy chọn", () => {
  const src = nguon("normalize");
  assert.match(src, /export const dynamic = "force-dynamic"/);
  assert.match(src, /export async function POST/);
  assert.match(src, /getCurrentUser\(\)/);
  assert.match(src, /status: 401/);
  assert.match(src, /CAN\.manageEngineeringTwin\(user\.role\)/);
  assert.match(src, /status: 403/);

  const iUser = src.indexOf("getCurrentUser()");
  const i401 = src.indexOf("status: 401");
  const i403 = src.indexOf("status: 403");
  const iParse = src.indexOf("await req.json()");
  assert.ok(iUser < i401 && i401 < i403 && i403 < iParse, "auth phải chạy trước khi đọc body");

  // rawLayers/legacyText đều KHÔNG bắt buộc — thiếu cái nào thì trả rỗng/null cho cái đó,
  // không throw 400/422 (route không kiểm bắt buộc trường nào).
  assert.match(src, /normalizeCadLayers\(rawLayers\) : \{\}/);
  assert.match(src, /convertTcvn3ToUnicode\(legacyText\) : null/);
  assert.match(src, /status: "success"/);
  // Không có nhánh 400/409/422 nào khác 401/403 — route không kiểm bắt buộc trường nào.
  for (const ma of ["400", "409", "422"]) {
    assert.ok(!src.includes(`status: ${ma}`), `route normalize không được có nhánh ${ma}`);
  }
});

// ===== convert-to-dxf =====

test("route convert-to-dxf: force-dynamic, 401/403 CAN.viewEngineeringGraph, 422 thiếu fileBase64, LUÔN từ chối (DWG chưa hỗ trợ đọc bằng TS)", () => {
  const src = nguon("convert-to-dxf");
  assert.match(src, /export const dynamic = "force-dynamic"/);
  assert.match(src, /getCurrentUser\(\)/);
  assert.match(src, /status: 401/);
  assert.match(src, /CAN\.viewEngineeringGraph\(user\.role\)/);
  assert.match(src, /status: 403/);
  assert.match(src, /status: 422/);
  assert.match(src, /!body\.fileBase64/);
  // ADR-0006/M99 PR0: KHÔNG có nhánh nào thật sự chuyển đổi DWG→DXF — luôn trả lỗi
  // DWG_UNSUPPORTED_MESSAGE, kể cả khi có fileBase64 hợp lệ.
  assert.match(src, /DWG_UNSUPPORTED_MESSAGE/);
  assert.ok(
    !/success:\s*true/.test(src),
    "route convert-to-dxf không có đường thành công nào — mọi request hợp lệ vẫn bị từ chối 422",
  );

  const iUser = src.indexOf("getCurrentUser()");
  const i401 = src.indexOf("status: 401");
  const i403 = src.indexOf("status: 403");
  const iBody = src.indexOf("await req.json()");
  assert.ok(iUser < i401 && i401 < i403 && i403 < iBody);
});

test("convert-to-dxf: DWG_UNSUPPORTED_MESSAGE là thông điệp thật do dxf-parser xuất, không phải chuỗi rỗng", async () => {
  const { DWG_UNSUPPORTED_MESSAGE } = await import("@/lib/ky-thuat/cad/dxf-parser");
  assert.ok(typeof DWG_UNSUPPORTED_MESSAGE === "string" && DWG_UNSUPPORTED_MESSAGE.length > 10);
});

// ===== parse-dxf =====

test("route parse-dxf: force-dynamic, 401/403 CAN.viewEngineeringGraph TRƯỚC khi đọc body/tệp", () => {
  const src = nguon("parse-dxf");
  assert.match(src, /export const dynamic = "force-dynamic"/);
  assert.match(src, /getCurrentUser\(\)/);
  assert.match(src, /status: 401/);
  assert.match(src, /CAN\.viewEngineeringGraph\(user\.role\)/);
  assert.match(src, /status: 403/);

  const iUser = src.indexOf("getCurrentUser()");
  const i401 = src.indexOf("status: 401");
  const i403 = src.indexOf("status: 403");
  const iBody = src.indexOf("await req.json()");
  assert.ok(iUser < i401 && i401 < i403 && i403 < iBody);
});

test("route parse-dxf: giới hạn dung lượng ƯỚC LƯỢNG từ base64 TRƯỚC khi Buffer.from giải mã (chống tràn RAM)", () => {
  const src = nguon("parse-dxf");
  const iUocLuong = src.indexOf("uocLuongByteTuBase64(fileBase64)");
  const i413 = src.indexOf("status: 413");
  const iBufferFrom = src.indexOf("Buffer.from(fileBase64");
  assert.ok(iUocLuong >= 0 && i413 >= 0 && iBufferFrom >= 0);
  assert.ok(
    iUocLuong < i413 && i413 < iBufferFrom,
    "phải ước lượng và trả 413 TRƯỚC khi giải mã base64 thật vào bộ nhớ",
  );
});

test("route parse-dxf: nhiều tệp cùng khớp trên đĩa → 409 kèm danh sách ứng viên, KHÔNG tự chọn", () => {
  const src = nguon("parse-dxf");
  assert.match(src, /status: 409/);
  assert.match(src, /candidates: danhSach\.map/);
  assert.match(src, /"nhap_nhang"/);
  // Không tìm thấy tệp thật lẫn dxfContent trực tiếp → 404, KHÔNG bịa bản vẽ mẫu.
  assert.match(src, /status: 404/);
  assert.ok(
    !/isRealDrawing = true;?\s*$/m.test(src) || src.includes("result.isRealDrawing = result.entities.length > 0"),
    "isRealDrawing phải suy từ có thực thể thật, không được gán cứng true",
  );
});

test("route parse-dxf: nhận diện DWG qua đuôi tệp HOẶC 4 byte đầu 'AC10' (không chỉ dựa đuôi tệp có thể sai)", () => {
  const src = nguon("parse-dxf");
  assert.match(src, /ext === "\.dwg" \|\| fileBuffer\.subarray\(0, 4\)\.toString\("ascii"\)\.startsWith\("AC10"\)/);
  assert.match(src, /parseDwgBinary\(fileBuffer, fileName\)/);
});

test("route parse-dxf: đọc drawing_revisions ưu tiên storage phẳng, iso_path cây thư mục chỉ là phương án dự phòng", () => {
  const src = nguon("parse-dxf");
  assert.match(src, /rev\.file_name\.includes\("\/"\)/);
  assert.match(src, /storageGet\(user\.orgId, rev\.file_name\)/);
  assert.match(src, /rev\.iso_path/);
});

// Các hàm helper mà route parse-dxf dùng để dò tệp trên đĩa (timTepBanVeTrenDia/chonTepDuyNhat/
// duongDanAnToan) đã có test đơn vị riêng ở tests/cad-tim-tep-ban-ve.test.ts — không lặp lại.
test("parse-dxf: các helper dò tệp route dùng thật sự tồn tại đúng chữ ký (không import module rỗng)", async () => {
  const mod = await import("@/lib/ky-thuat/cad/tim-ban-ve");
  assert.equal(typeof mod.timTepBanVeTrenDia, "function");
  assert.equal(typeof mod.chonTepDuyNhat, "function");
  assert.equal(typeof mod.duongDanAnToan, "function");
});
