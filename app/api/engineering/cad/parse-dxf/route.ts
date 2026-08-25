import { NextResponse } from "next/server";
import { readdirSync, statSync, readFileSync, existsSync } from "node:fs";
import { join, basename, extname, normalize, sep, resolve } from "node:path";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { parseDxf, parseDwgBinary, DwgUnsupportedError } from "@/lib/ky-thuat/cad/dxf-parser";
import { queryOne } from "@/lib/db";
import { storageGet } from "@/lib/nen/storage";
import { GIOI_HAN_TEP_CAD, uocLuongByteTuBase64 } from "@/lib/ky-thuat/cad/gioi-han";
import {
  timTepBanVeTrenDia,
  chonTepDuyNhat,
  duongDanAnToan,
  type TepUngVien,
} from "@/lib/ky-thuat/cad/tim-ban-ve";

export const dynamic = "force-dynamic";

const UPLOADS_DIR = join(process.cwd(), "data", "uploads");
const DRAWINGS_DIR = join(UPLOADS_DIR, "drawings");

/**
 * Nhiều tệp cùng khớp → trả 409 kèm danh sách để người dùng chỉ đích danh qua `filePath`.
 * Tuyệt đối không tự chọn hộ: chọn nhầm nghĩa là kỹ sư thi công theo bản vẽ của hệ khác.
 */
function traLoiNhapNhang(danhSach: TepUngVien[]): NextResponse {
  return NextResponse.json(
    {
      error:
        `Tìm thấy ${danhSach.length} tệp cùng khớp — không thể tự chọn vì chọn nhầm nghĩa là ` +
        `thi công theo bản vẽ sai. Hãy chỉ rõ tệp cần dùng.`,
      candidates: danhSach.map((u) => u.relativePath),
    },
    { status: 409 },
  );
}

// POST /api/engineering/cad/parse-dxf — Phân tích tệp CAD thật (DXF/DWG/PDF) hoặc nội dung tải lên
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringGraph(user.role)) {
    return NextResponse.json({ error: "Không có quyền truy cập module CAD/BIM" }, { status: 403 });
  }

  try {
    const body = await req.json();
    let dxfContent: string = body.dxfContent || "";
    let fileBase64: string = body.fileBase64 || "";
    let fileName = body.fileName || "drawing_model.dxf";
    let realFileFound = false;
    let sourcePath = fileName;
    let fileBuffer: Buffer | null = null;

    // 1. Nếu client truyền tệp Base64 (upload tệp nhị phân DWG / PDF / DXF trực tiếp)
    if (fileBase64) {
      // Ước lượng kích thước thật TỪ CHUỖI base64 trước khi giải mã — giải mã rồi mới đo thì
      // đã tốn đúng số bộ nhớ đang muốn tránh.
      const uocLuong = uocLuongByteTuBase64(fileBase64);
      if (uocLuong > GIOI_HAN_TEP_CAD) {
        return NextResponse.json(
          {
            error:
              `Tệp lớn hơn giới hạn ${Math.round(GIOI_HAN_TEP_CAD / 1024 / 1024)} MB ` +
              `(tệp của bạn khoảng ${Math.round(uocLuong / 1024 / 1024)} MB). Hãy tách bản vẽ ` +
              `theo tầng/hệ rồi chuẩn hoá từng phần.`,
          },
          { status: 413 },
        );
      }
      fileBuffer = Buffer.from(fileBase64, "base64");
      realFileFound = true;
    }

    // 2. Nếu truyền đường dẫn tệp cụ thể trên đĩa (filePath)
    if (!fileBuffer && body.filePath) {
      const explicitPath = duongDanAnToan(DRAWINGS_DIR, body.filePath);
      if (explicitPath && existsSync(explicitPath) && statSync(explicitPath).isFile()) {
        fileBuffer = readFileSync(explicitPath);
        fileName = basename(explicitPath);
        sourcePath = body.filePath;
        realFileFound = true;
      }
    }

    // 3. Nếu chọn từ bản vẽ thiết kế trong cơ sở dữ liệu (drawingId)
    if (!fileBuffer && body.drawingId) {
      const drawing = await queryOne<{
        id: number;
        code: string;
        name: string;
        system_group: string | null;
      }>(`SELECT id, code, name, system_group FROM drawings WHERE id = ?`, Number(body.drawingId));

      if (drawing) {
        fileName = `${drawing.code}.dwg`;
        // Kiểm tra trong drawing_revisions
        const rev = await queryOne<{
          file_name: string;
          iso_path: string | null;
          original_name: string | null;
        }>(
          `SELECT file_name, iso_path, original_name FROM drawing_revisions WHERE drawing_id = ? ORDER BY id DESC LIMIT 1`,
          drawing.id,
        );

        if (rev?.file_name) {
          // Lớp storage nhận tên tệp PHẲNG (chặn path traversal). Bản ghi cũ lưu đường dẫn cây
          // ISO 19650 (`HVAC/design/iso/....dxf`) thì bỏ qua storage, đọc thẳng theo cây thư mục
          // bên dưới — không thì storageGet ném lỗi và cả route hỏng.
          const revBuf = rev.file_name.includes("/")
            ? null
            : await storageGet(user.orgId, rev.file_name);
          if (revBuf) {
            fileBuffer = Buffer.from(revBuf);
            fileName = rev.original_name || rev.file_name;
            sourcePath = rev.file_name;
            realFileFound = true;
          } else {
            // Thử đọc trực tiếp trên đĩa cục bộ: bản tải lên thường nằm phẳng trong
            // data/uploads/, còn bản chuẩn hoá do save-drawing ghi nằm trong cây
            // data/uploads/drawings/<hệ>/<loại>/…
            // Giá trị lấy từ DB nên rủi ro thấp hơn body client, nhưng vẫn đi qua cùng một cửa
            // chặn thoát thư mục — phòng khi bản ghi cũ (trước khi save-drawing lọc tên) mang
            // đường dẫn lạ.
            // Bản tải lên nằm phẳng trong data/uploads/, bản chuẩn hoá nằm trong cây
            // data/uploads/drawings/<hệ>/<loại>/… — hai thư mục gốc khác nhau nên kiểm theo
            // đúng gốc của từng ứng viên, không gộp làm một.
            const diskCandidates = [
              duongDanAnToan(UPLOADS_DIR, rev.file_name),
              duongDanAnToan(DRAWINGS_DIR, rev.file_name),
              rev.iso_path ? duongDanAnToan(DRAWINGS_DIR, rev.iso_path) : null,
            ].filter((x): x is string => x !== null);
            for (const localFile of diskCandidates) {
              if (existsSync(localFile) && statSync(localFile).isFile()) {
                fileBuffer = readFileSync(localFile);
                fileName = rev.original_name || basename(localFile);
                sourcePath = rev.file_name;
                realFileFound = true;
                break;
              }
            }
          }
        }

        // Nếu chưa có trong storage, tìm kiếm đệ quy trong thư mục data/uploads/drawings
        if (!fileBuffer) {
          // Tìm theo MÃ bản vẽ trước; chỉ khi mã không ra gì mới thử theo tên. Nhập nhằng ở
          // bước nào thì dừng ngay ở bước đó — không rơi xuống bước sau để "may ra ra một cái",
          // vì như thế là quay lại đúng kiểu đoán bừa vừa bỏ.
          let ungVien = timTepBanVeTrenDia(DRAWINGS_DIR, drawing.code);
          if (ungVien.length === 0) ungVien = timTepBanVeTrenDia(DRAWINGS_DIR, drawing.name);
          const chon = chonTepDuyNhat(ungVien);
          if (chon.loai === "nhap_nhang") return traLoiNhapNhang(chon.danhSach);
          if (chon.loai === "duy_nhat") {
            fileBuffer = readFileSync(chon.tep.fullPath);
            fileName = chon.tep.fileName;
            sourcePath = chon.tep.relativePath;
            realFileFound = true;
          }
        }
      }
    }

    // 4. Nếu truyền fileName hoặc chưa tìm thấy, thử tìm trên đĩa theo fileName
    if (!fileBuffer && !dxfContent && fileName) {
      const chon = chonTepDuyNhat(timTepBanVeTrenDia(DRAWINGS_DIR, fileName));
      if (chon.loai === "nhap_nhang") return traLoiNhapNhang(chon.danhSach);
      if (chon.loai === "duy_nhat") {
        fileBuffer = readFileSync(chon.tep.fullPath);
        fileName = chon.tep.fileName;
        sourcePath = chon.tep.relativePath;
        realFileFound = true;
      }
    }

    // Không tìm thấy tệp thật thì báo thẳng, KHÔNG sinh bản vẽ mẫu rồi gắn cờ isRealDrawing:
    // trước đây trang chuẩn hoá hiển thị một bản vẽ MEPF do máy chế ra như thể là bản vẽ của
    // người dùng (M98/M99 — không bịa dữ liệu).
    if (!fileBuffer && !dxfContent) {
      return NextResponse.json(
        {
          error:
            "Không tìm thấy tệp bản vẽ tương ứng trên máy chủ. Hãy tải lên tệp DXF, hoặc chọn bản vẽ đã có bản phát hành đính kèm.",
        },
        { status: 404 },
      );
    }

    let result;
    if (fileBuffer) {
      const ext = extname(fileName).toLowerCase();
      if (ext === ".dwg" || fileBuffer.subarray(0, 4).toString("ascii").startsWith("AC10")) {
        result = parseDwgBinary(fileBuffer, fileName);
      } else {
        // Truyền thẳng buffer: parseDxf tự nhận DXF nhị phân và tự chọn bảng mã. Ép sẵn
        // `toString("utf8")` như trước làm hỏng mọi bản vẽ ghi bằng TCVN3/VNI/CP1258 — chữ có dấu
        // biến thành ký tự thay thế ngay ở bước đọc tệp, Bác Sĩ Font không còn gì để cứu.
        result = parseDxf(fileBuffer, fileName);
      }
      result.isRealDrawing = result.entities.length > 0;
      result.sourcePath = sourcePath;
      result.fileSizeBytes = fileBuffer.length;
    } else {
      result = parseDxf(dxfContent, fileName);
      // Nội dung do client gửi lên vẫn là bản vẽ thật của người dùng, nhưng chỉ đánh dấu khi
      // parse ra được thực thể — tệp rác không được coi là bản vẽ hợp lệ.
      result.isRealDrawing = result.entities.length > 0;
      result.sourcePath = sourcePath;
      result.fileSizeBytes = dxfContent.length;
    }

    return NextResponse.json({
      success: true,
      data: result,
      realFileFound,
      sourcePath,
    });
  } catch (err: unknown) {
    if (err instanceof DwgUnsupportedError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
