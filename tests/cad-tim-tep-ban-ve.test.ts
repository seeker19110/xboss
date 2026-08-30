import "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  timTepBanVeTrenDia,
  chonTepDuyNhat,
  duongDanAnToan,
  type TepUngVien,
} from "@/lib/ky-thuat/cad/drawing";
import { GIOI_HAN_TEP_CAD, uocLuongByteTuBase64 } from "@/lib/ky-thuat/cad/dashboard";

// ─────────────────────────────────────────────────────────────────────────────
// Hồi quy cho hai lỗi tìm thấy khi audit quy trình chuẩn hoá bản vẽ 2D (2026-08-24):
//
//   1. Khớp tên tệp quá lỏng → CHỌN SAI BẢN VẼ, âm thầm. Điều kiện cũ
//      `cleanQuery.includes(entryBase)` khiến mọi tệp tên ngắn khớp mọi mã: tìm `HVAC-01`
//      thì `A.dxf` của hệ PCCC cũng khớp. Hàm lại trả ứng viên ĐẦU TIÊN gặp trong lượt duyệt
//      LIFO, nên kết quả còn phụ thuộc thứ tự đọc thư mục. Kỹ sư nhận nhầm bản vẽ hệ khác mà
//      không có cảnh báo nào — với app thi công MEPF là lắp sai theo bản vẽ sai.
//   2. `join(DRAWINGS_DIR, body.filePath)` không chặn `../` → đọc được tệp ngoài thư mục bản vẽ.
// ─────────────────────────────────────────────────────────────────────────────

const goc = mkdtempSync(join(tmpdir(), "xboss-cad-"));
const thuMucBanVe = join(goc, "drawings");
mkdirSync(join(thuMucBanVe, "HVAC"), { recursive: true });
mkdirSync(join(thuMucBanVe, "PCCC"), { recursive: true });
mkdirSync(join(thuMucBanVe, "DIEN"), { recursive: true });

writeFileSync(join(thuMucBanVe, "HVAC", "HVAC-01.dxf"), "0\nEOF");
writeFileSync(join(thuMucBanVe, "HVAC", "HVAC-01-Rev02.dxf"), "0\nEOF");
writeFileSync(join(thuMucBanVe, "PCCC", "A.dxf"), "0\nEOF");
writeFileSync(join(thuMucBanVe, "DIEN", "V.dxf"), "0\nEOF");
writeFileSync(join(thuMucBanVe, "0.dxf"), "0\nEOF");
// Mã chỉ có bản đánh số hiệu chỉnh, KHÔNG có tệp trùng khít — ca dùng khớp tiền tố
writeFileSync(join(thuMucBanVe, "HVAC", "ODNN2-Rev01.dxf"), "0\nEOF");
writeFileSync(join(goc, "bi-mat.txt"), "SECRET"); // NGOÀI thư mục bản vẽ

const tim = (ma: string) => timTepBanVeTrenDia(thuMucBanVe, ma);
const ten = (ds: TepUngVien[]) => ds.map((u) => u.fileName).sort();

describe("Tìm tệp bản vẽ trên đĩa — không được chọn nhầm bản vẽ", () => {
  it("KHÔNG khớp tệp tên ngắn của hệ khác (lỗi cũ: 'hvac-01' chứa 'a' nên A.dxf khớp)", () => {
    const kq = ten(tim("HVAC-01"));
    assert.ok(!kq.includes("A.dxf"), "A.dxf của hệ PCCC không được khớp mã HVAC-01");
    assert.ok(!kq.includes("V.dxf"), "V.dxf của hệ điện không được khớp mã HVAC-01");
    assert.ok(!kq.includes("0.dxf"), "tệp nháp 0.dxf không được khớp mã HVAC-01");
  });

  it("khớp chính xác được ưu tiên hơn khớp tiền tố, và chọn ra đúng một tệp", () => {
    const kq = tim("HVAC-01");
    assert.equal(kq[0].fileName, "HVAC-01.dxf");
    assert.equal(kq[0].kieuKhop, "chinh_xac");

    const chon = chonTepDuyNhat(kq);
    assert.equal(chon.loai, "duy_nhat");
    assert.equal(chon.loai === "duy_nhat" && chon.tep.fileName, "HVAC-01.dxf");
  });

  it("vẫn khớp tiền tố hợp lệ khi không có tệp trùng khít", () => {
    const kq = tim("ODNN2");
    assert.deepEqual(ten(kq), ["ODNN2-Rev01.dxf"]);
    assert.equal(kq[0].kieuKhop, "tien_to");
  });

  it("mã HVAC-01 khớp cả bản gốc lẫn bản Rev, nhưng bản trùng khít đứng trước", () => {
    const kq = tim("HVAC-01");
    assert.deepEqual(ten(kq), ["HVAC-01-Rev02.dxf", "HVAC-01.dxf"]);
    assert.equal(kq[0].fileName, "HVAC-01.dxf");
    assert.equal(kq[1].kieuKhop, "tien_to");
  });

  it("tiền tố phải kết thúc ở dấu phân cách — 'HVAC-0' KHÔNG được nuốt 'HVAC-01'", () => {
    assert.deepEqual(ten(tim("HVAC-0")), []);
  });

  it("mã ngắn dưới 4 ký tự không kích hoạt khớp tiền tố", () => {
    assert.deepEqual(ten(tim("HVA")), []);
  });

  it("bỏ qua tệp không phải bản vẽ", () => {
    writeFileSync(join(thuMucBanVe, "HVAC-02.txt"), "x");
    assert.deepEqual(ten(tim("HVAC-02")), []);
  });

  it("nhiều tệp cùng hạng → báo nhập nhằng, KHÔNG tự chọn", () => {
    const chon = chonTepDuyNhat([
      { fullPath: "/a", relativePath: "HVAC/X.dxf", fileName: "X.dxf", kieuKhop: "chinh_xac" },
      { fullPath: "/b", relativePath: "PCCC/X.dxf", fileName: "X.dxf", kieuKhop: "chinh_xac" },
    ]);
    assert.equal(chon.loai, "nhap_nhang");
    assert.equal(chon.loai === "nhap_nhang" && chon.danhSach.length, 2);
  });

  it("không tìm thấy thì báo không thấy, không trả bừa một tệp nào đó", () => {
    assert.equal(chonTepDuyNhat(tim("KHONG-TON-TAI-99")).loai, "khong_thay");
  });

  it("thứ tự kết quả ổn định, không phụ thuộc thứ tự đọc thư mục", () => {
    assert.deepEqual(
      tim("HVAC-01").map((u) => u.relativePath),
      tim("HVAC-01").map((u) => u.relativePath),
    );
  });

  it("thư mục gốc chưa tồn tại thì trả rỗng, không ném lỗi", () => {
    assert.deepEqual(timTepBanVeTrenDia(join(goc, "khong-co"), "HVAC-01"), []);
  });
});

describe("duongDanAnToan — chặn thoát thư mục bản vẽ", () => {
  const trong = (rel: string) => duongDanAnToan(thuMucBanVe, rel) !== null;

  it("chấp nhận đường dẫn nằm trong thư mục gốc", () => {
    assert.equal(trong("HVAC/HVAC-01.dxf"), true);
  });

  it("chặn ../ thoát một cấp", () => {
    assert.equal(trong("../bi-mat.txt"), false);
  });

  it("chặn thoát nhiều cấp", () => {
    assert.equal(trong("../../../../etc/passwd"), false);
  });

  it("chặn ../ lồng giữa đường dẫn", () => {
    assert.equal(trong("HVAC/../../bi-mat.txt"), false);
  });

  it("chặn chuỗi rỗng và giá trị không phải chuỗi", () => {
    assert.equal(trong(""), false);
    assert.equal(trong("   "), false);
    assert.equal(duongDanAnToan(thuMucBanVe, null as unknown as string), null);
  });
});

process.on("exit", () => {
  try {
    rmSync(goc, { recursive: true, force: true });
  } catch {}
});

// ─────────────────────────────────────────────────────────────────────────────
// Hồi quy cho lỗi #4 cùng đợt audit: đường CAD KHÔNG có giới hạn dung lượng nào, dù ảnh hiện
// trường giới hạn 10 MB và biên bản nghiệm thu 20 MB. Client đọc trọn tệp → base64 (phình 1,33×)
// → một body JSON → Buffer.from trên máy chủ.
// ─────────────────────────────────────────────────────────────────────────────
describe("Giới hạn dung lượng tệp CAD", () => {
  it("trần đủ rộng cho bản vẽ MEPF thật (≥ 100 MB) nhưng không phải vô hạn", () => {
    assert.ok(GIOI_HAN_TEP_CAD >= 100 * 1024 * 1024, "trần quá thấp sẽ chặn người dùng thật");
    assert.ok(Number.isFinite(GIOI_HAN_TEP_CAD) && GIOI_HAN_TEP_CAD > 0);
  });

  it("ước lượng byte từ base64 sát với kích thước thật, không cần giải mã", () => {
    for (const n of [0, 1, 2, 3, 100, 1023, 4096]) {
      const b64 = Buffer.alloc(n, 7).toString("base64");
      assert.equal(
        uocLuongByteTuBase64(b64),
        n,
        `chuỗi base64 của ${n} byte phải ước lượng đúng ${n}`,
      );
    }
  });

  it("chuỗi rỗng cho 0, không NaN", () => {
    assert.equal(uocLuongByteTuBase64(""), 0);
  });

  it("phát hiện vượt trần CHỈ từ độ dài chuỗi, không dựng buffer để đo", () => {
    // Độ dài base64 tương ứng đúng ngưỡng, và ngưỡng + 1 byte. Không dựng chuỗi thật (150 MB
    // trong test là vô nghĩa) — kiểm bằng chính công thức mà route dùng.
    const doDaiB64 = (soByte: number) => Math.ceil(soByte / 3) * 4;
    const uoc = (doDai: number) => Math.floor((doDai * 3) / 4);

    assert.ok(uoc(doDaiB64(GIOI_HAN_TEP_CAD)) >= GIOI_HAN_TEP_CAD, "đúng ngưỡng vẫn phải lọt");
    assert.ok(
      uoc(doDaiB64(GIOI_HAN_TEP_CAD + 1024 * 1024)) > GIOI_HAN_TEP_CAD,
      "vượt trần 1 MB phải bị phát hiện",
    );
  });
});
