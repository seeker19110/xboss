// Tìm tệp bản vẽ trên đĩa cho đường chuẩn hoá CAD 2D.
//
// Nằm ở lib/ chứ không trong route: đây là logic nghiệp vụ (quyết định tệp nào ứng với mã bản vẽ
// nào), route chỉ là ranh giới HTTP — ADR-0008. Tách ra cũng là điều kiện để test được: thư mục
// gốc truyền vào tham số thay vì đọc `process.cwd()` lúc nạp module.

import { readdirSync, existsSync } from "node:fs";
import { join, basename, extname, normalize, resolve, sep } from "node:path";

/**
 * Ghép đường dẫn tương đối do client gửi vào DRAWINGS_DIR, **chặn thoát thư mục**.
 *
 * Trước đây route ghép thẳng `join(DRAWINGS_DIR, body.filePath)` với `filePath` lấy nguyên từ
 * body JSON. `join("…/drawings", "../../../../etc/passwd")` cho ra `/etc/passwd` — máy chủ đọc
 * được tệp bất kỳ ngoài thư mục bản vẽ. Đo thật thì nội dung tệp không phải DXF KHÔNG lọt ra
 * theo JSON trả về, nhưng `fileSizeBytes` + `sourcePath` vẫn thành oracle dò sự tồn tại và kích
 * thước mọi tệp trên đĩa, và tệp DXF ở bất kỳ đâu thì đọc được nội dung thật (audit 2026-08-24).
 *
 * Dùng lại đúng mẫu đã có ở `lib/nen/storage.ts:42-49`: chuẩn hoá rồi đòi đường dẫn kết quả phải
 * nằm trong thư mục gốc. Trả `null` khi thoát ra ngoài — người gọi coi như không tìm thấy.
 */
export function duongDanAnToan(thuMucGoc: string, duongDanTuongDoi: string): string | null {
  if (typeof duongDanTuongDoi !== "string" || duongDanTuongDoi.trim() === "") return null;
  const goc = resolve(thuMucGoc);
  const p = normalize(join(goc, duongDanTuongDoi));
  if (p !== goc && !p.startsWith(goc + sep)) return null;
  return p;
}

/** Một tệp bản vẽ ứng viên tìm thấy trên đĩa. */
export interface TepUngVien {
  fullPath: string;
  relativePath: string;
  fileName: string;
  /** `chinh_xac` = tên tệp trùng khít mã bản vẽ; `tien_to` = mã + dấu phân cách + hậu tố. */
  kieuKhop: "chinh_xac" | "tien_to";
}

/**
 * Tìm các tệp bản vẽ ứng viên trong `data/uploads/drawings` theo mã bản vẽ.
 *
 * ═══ VÌ SAO KHẮT KHE ĐẾN MỨC NÀY ═══
 *
 * Bản trước khớp tên bằng 5 điều kiện OR, trong đó có `cleanQuery.includes(entryBase)` —
 * tức "mã bản vẽ có chứa tên tệp". Điều kiện đó khiến MỌI tệp tên ngắn khớp với MỌI mã:
 * tìm `HVAC-01` thì `A.dxf` của hệ PCCC cũng khớp (vì "hvac-01" chứa "a"). Hàm lại duyệt
 * thư mục bằng ngăn xếp LIFO và trả về ứng viên ĐẦU TIÊN gặp được, không phải ứng viên tốt
 * nhất — nên kỹ sư chọn bản vẽ điều hoà hoàn toàn có thể nhận về bản vẽ chữa cháy, kèm cờ
 * `isRealDrawing: true` và không một cảnh báo nào. Với app thi công MEPF, đó là lắp sai theo
 * bản vẽ sai (audit 2026-08-24).
 *
 * Nay chỉ chấp nhận hai kiểu khớp, và **không bao giờ** khớp theo chiều "mã chứa tên tệp":
 *
 *   1. `chinh_xac` — tên tệp (bỏ đuôi) trùng khít mã, hoặc trùng cả đuôi.
 *   2. `tien_to`   — tên tệp bắt đầu bằng mã RỒI tới dấu phân cách (`-`, `_`, `.`, khoảng
 *                    trắng), vd mã `HVAC-01` khớp `HVAC-01-Rev02.dxf`. Chỉ áp dụng khi mã
 *                    dài ≥ 4 ký tự, để mã ngắn kiểu `A1` không quét trúng nửa thư mục.
 *
 * Trả về **mọi** ứng viên chứ không dừng ở cái đầu tiên — người gọi phải tự quyết khi có
 * nhiều hơn một, thay vì để thứ tự duyệt thư mục quyết hộ.
 */
export function timTepBanVeTrenDia(thuMucGoc: string, maBanVe: string): TepUngVien[] {
  if (!existsSync(thuMucGoc)) return [];

  const ma = maBanVe.trim().toLowerCase();
  const maKhongDuoi = ma.replace(/\.(dwg|dxf|pdf|bak)$/i, "");
  if (!maKhongDuoi) return [];

  const PHAN_CACH = ["-", "_", ".", " "];
  const ungVien: TepUngVien[] = [];
  const stack: string[] = [""];

  while (stack.length > 0) {
    const currentRel = stack.pop()!;
    const currentFull = join(thuMucGoc, currentRel);
    try {
      for (const entry of readdirSync(currentFull, { withFileTypes: true })) {
        const relPath = currentRel ? `${currentRel}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          stack.push(relPath);
          continue;
        }
        if (!entry.isFile()) continue;

        const ext = extname(entry.name).toLowerCase();
        if (![".dwg", ".dxf", ".pdf"].includes(ext)) continue;

        const tenTep = entry.name.toLowerCase();
        const tenKhongDuoi = basename(entry.name, ext).toLowerCase();

        let kieuKhop: TepUngVien["kieuKhop"] | null = null;
        if (tenKhongDuoi === maKhongDuoi || tenTep === ma) {
          kieuKhop = "chinh_xac";
        } else if (
          maKhongDuoi.length >= 4 &&
          tenKhongDuoi.startsWith(maKhongDuoi) &&
          PHAN_CACH.includes(tenKhongDuoi.charAt(maKhongDuoi.length))
        ) {
          kieuKhop = "tien_to";
        }

        if (kieuKhop) {
          ungVien.push({
            fullPath: join(currentFull, entry.name),
            relativePath: relPath,
            fileName: entry.name,
            kieuKhop,
          });
        }
      }
    } catch {
      // Thư mục không đọc được thì bỏ qua, không làm hỏng cả lượt tìm.
    }
  }

  // Khớp chính xác luôn thắng khớp tiền tố; trong cùng nhóm thì sắp theo đường dẫn để kết quả
  // ổn định giữa các lần chạy (thứ tự readdir không được bảo đảm).
  return ungVien.sort((a, b) =>
    a.kieuKhop === b.kieuKhop
      ? a.relativePath.localeCompare(b.relativePath)
      : a.kieuKhop === "chinh_xac"
        ? -1
        : 1,
  );
}

/**
 * Chọn đúng MỘT tệp từ danh sách ứng viên, hoặc báo nhập nhằng.
 *
 * Nhập nhằng = có ≥2 ứng viên cùng hạng cao nhất. Khi đó tuyệt đối không tự chọn: route sẽ trả
 * 409 kèm danh sách để người dùng chỉ đích danh. Đoán bừa chính là lỗi vừa sửa ở trên.
 */
export function chonTepDuyNhat(
  ungVien: TepUngVien[],
):
  | { loai: "khong_thay" }
  | { loai: "duy_nhat"; tep: TepUngVien }
  | { loai: "nhap_nhang"; danhSach: TepUngVien[] } {
  if (ungVien.length === 0) return { loai: "khong_thay" };
  const hangCao = ungVien[0].kieuKhop;
  const cungHang = ungVien.filter((u) => u.kieuKhop === hangCao);
  if (cungHang.length === 1) return { loai: "duy_nhat", tep: cungHang[0] };
  return { loai: "nhap_nhang", danhSach: cungHang };
}
