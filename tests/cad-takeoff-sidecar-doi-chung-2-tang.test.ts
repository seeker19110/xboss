// Đối chứng 2 tầng cho sidecar `takeoff.json` (M101 §6.4 PR5): server đọc kiểu duck-typing ở
// lib/ky-thuat/cad/bang-dieu-khien.ts (docKlBocTuBaoCao / layDongTakeoffChoExport) còn plugin
// C# sinh JSON này ở plugin-autocad/XBoss.Cad.Core/Reporting/TakeoffJsonReport.cs — trước PR này
// không có tệp mẫu chung nên hai tầng có thể trôi tên field mà không ai biết. Tệp mẫu
// plugin-autocad/doi-chung/takeoff-sidecar-mau.json khớp tay đúng tên [JsonPropertyName] sinh
// bởi TakeoffJsonReport.cs; test này khẳng định server đọc đủ MỌI field đang dùng thật từ tệp đó.
// Test THUẦN — không chạm DB, chạy được mọi nơi (không cần TEST_DATABASE_URL).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { docKlBocTuBaoCao } from "@/lib/ky-thuat/cad/bang-dieu-khien";

const DOI_CHUNG = join(process.cwd(), "plugin-autocad", "doi-chung");
const TAKEOFF_MAU = JSON.parse(
  readFileSync(join(DOI_CHUNG, "takeoff-sidecar-mau.json"), "utf8"),
) as Record<string, unknown>;

test("tệp mẫu khớp đúng hình dạng TakeoffJsonReport.cs (khoá bắt buộc + kiểu dữ liệu)", () => {
  // Khoá cấp báo cáo mà TakeoffJsonReport.cs sinh ra ([JsonPropertyName] trên class chính).
  for (const k of [
    "rulePackVersion",
    "tenDuAn",
    "goiThau",
    "tenBanVe",
    "nguoiBoc",
    "ngayIso",
    "lines",
    "canhBao",
  ]) {
    assert.ok(k in TAKEOFF_MAU, `thiếu khoá cấp báo cáo "${k}"`);
  }
  assert.ok(Array.isArray(TAKEOFF_MAU.lines) && TAKEOFF_MAU.lines.length >= 1);

  // Khoá cấp dòng mà TakeoffJsonLine sinh ra ([JsonPropertyName] trên từng dòng).
  const dong0 = (TAKEOFF_MAU.lines as Record<string, unknown>[])[0];
  for (const k of [
    "itemId",
    "boqCode",
    "group",
    "ten",
    "quyCach",
    "donVi",
    "soDoiTuong",
    "khoiLuong",
    "handles",
    "size",
    "nguonSize",
    "vung",
    "heSoQuyDoi",
    "moTaQuyDoi",
    "klQuyDoi",
    "danXuat",
  ]) {
    assert.ok(k in dong0, `thiếu khoá cấp dòng "${k}"`);
  }
  assert.equal(typeof dong0.itemId, "string");
  assert.equal(typeof dong0.khoiLuong, "number");
  assert.equal(typeof dong0.soDoiTuong, "number");
  assert.ok(Array.isArray(dong0.handles));
  assert.equal(typeof dong0.danXuat, "boolean");
});

test(
  "server (docKlBocTuBaoCao) đọc đúng field group/vung/donVi/khoiLuong từ tệp mẫu — gộp theo hệ " +
    "và vùng khớp tổng tính tay",
  () => {
    // Sidecar mẫu được LƯU NGUYÊN vào standardize_report.takeoff khi upload (xem
    // lib/ky-thuat/cad/plugin-upload.ts: `...(input.takeoff ? { takeoff: input.takeoff } : {})`),
    // nên report.takeoff CHÍNH LÀ nội dung JSON gốc — không có tầng bọc/đổi tên nào ở giữa.
    const kq = docKlBocTuBaoCao({ takeoff: TAKEOFF_MAU });
    assert.ok(kq);
    const lines = TAKEOFF_MAU.lines as {
      group: string;
      vung: string;
      donVi: string;
      khoiLuong: number;
    }[];
    assert.equal(kq!.tongDong, lines.length);

    // Tính tay tổng theo (group, donVi) từ chính tệp mẫu — không hard-code số, để đổi tệp mẫu
    // không làm test tự đỏ vì lệch số liệu, chỉ đỏ khi SERVER đọc sai field.
    const gopHe = new Map<string, number>();
    const gopVung = new Map<string, number>();
    for (const l of lines) {
      const keyHe = `${l.group} (${l.donVi})`;
      gopHe.set(keyHe, (gopHe.get(keyHe) ?? 0) + l.khoiLuong);
      const keyVung = `${l.vung} (${l.donVi})`;
      gopVung.set(keyVung, (gopVung.get(keyVung) ?? 0) + l.khoiLuong);
    }
    assert.deepEqual(
      kq!.theoHe,
      [...gopHe.entries()].map(([nhan, khoiLuong]) => ({ nhan, khoiLuong })),
    );
    assert.deepEqual(
      kq!.theoVung,
      [...gopVung.entries()].map(([nhan, khoiLuong]) => ({ nhan, khoiLuong })),
    );
  },
);

test(
  "server đọc đủ field dùng trong Excel gộp (itemId/boqCode/group/ten/donVi/khoiLuong/size/vung) " +
    "khớp DongTakeoffRaw ở lib/ky-thuat/cad/bang-dieu-khien.ts — giá trị THẬT, không tự so với chính nó",
  () => {
    // layDongTakeoffChoExport (chạm DB, có test riêng ở tests/cad-vong-doi-ban-ve-takeoff.test.ts)
    // đọc từng dòng raw theo đúng khuôn `typeof raw.<field> === "string" ? raw.<field> : ""` /
    // `typeof raw.<field> === "number" ? raw.<field> : 0`. Lặp lại nguyên khuôn đó ở đây nhưng so
    // với giá trị MONG ĐỢI cứng (không phải chính raw) — nếu ai đó đổi tên field phía C# (VD "ten"
    // → "name") mà quên đổi server, giá trị đọc ra sẽ rơi về fallback rỗng/0 và assert dưới đây đỏ.
    type DongTakeoffRaw = {
      itemId?: unknown;
      boqCode?: unknown;
      group?: unknown;
      ten?: unknown;
      donVi?: unknown;
      khoiLuong?: unknown;
      size?: unknown;
      vung?: unknown;
      heSoQuyDoi?: unknown;
      moTaQuyDoi?: unknown;
      klQuyDoi?: unknown;
    };
    const doc = (raw: DongTakeoffRaw) => {
      // 0 = rule pack không khai hệ số quy đổi → coi như không có, để trống (khớp
      // lib/ky-thuat/cad/bang-dieu-khien.ts: layDongTakeoffChoExport).
      const heSoQuyDoi =
        typeof raw.heSoQuyDoi === "number" && raw.heSoQuyDoi > 0 ? raw.heSoQuyDoi : null;
      return {
        itemId: typeof raw.itemId === "string" ? raw.itemId : "",
        boqCode: typeof raw.boqCode === "string" ? raw.boqCode : "",
        group: typeof raw.group === "string" ? raw.group : "",
        ten: typeof raw.ten === "string" ? raw.ten : "",
        donVi: typeof raw.donVi === "string" ? raw.donVi : "",
        khoiLuong: typeof raw.khoiLuong === "number" ? raw.khoiLuong : 0,
        size: typeof raw.size === "string" ? raw.size : "",
        vung: typeof raw.vung === "string" ? raw.vung : "",
        heSoQuyDoi,
        moTaQuyDoi: heSoQuyDoi !== null && typeof raw.moTaQuyDoi === "string" ? raw.moTaQuyDoi : "",
        klQuyDoi: heSoQuyDoi !== null && typeof raw.klQuyDoi === "number" ? raw.klQuyDoi : null,
      };
    };

    const lines = TAKEOFF_MAU.lines as DongTakeoffRaw[];
    assert.deepEqual(doc(lines[0]), {
      itemId: "duct-supp",
      boqCode: "M.01.01",
      group: "HVAC",
      ten: "Ống gió cấp",
      donVi: "m",
      khoiLuong: 20,
      size: "300x200",
      vung: "Tầng 5",
      // heSoQuyDoi=0 trong tệp mẫu → rule pack không khai hệ số cho dòng này, phải để TRỐNG.
      heSoQuyDoi: null,
      moTaQuyDoi: "",
      klQuyDoi: null,
    });
    assert.deepEqual(doc(lines[1]), {
      itemId: "duct-cachnhiet",
      boqCode: "M.01.02",
      group: "HVAC",
      ten: "Cách nhiệt ống gió",
      donVi: "m2",
      khoiLuong: 20,
      size: "300x200",
      vung: "Tầng 5",
      // Item dẫn xuất (cách nhiệt) — có hệ số quy đổi thật trong tệp mẫu.
      heSoQuyDoi: 1.6,
      moTaQuyDoi: "Diện tích cách nhiệt = chu vi x chiều dài x hệ số",
      klQuyDoi: 32,
    });
  },
);
