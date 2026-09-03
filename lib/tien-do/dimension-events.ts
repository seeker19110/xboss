import { run } from "@/lib/db";

// Giới hạn độ dài ghi chú theo ô (M120 §12) — ghi chú là gợi ý ngắn tại hiện trường
// ("chờ vật tư", "lệch cao độ"); nội dung dài thuộc về bình luận task.
export const MAX_NOTE_LEN = 500;

// Chuẩn hoá `note` client gửi lên thành giá trị cho `ghiDauVetTick`.
//
// PHẢI phân biệt 3 trạng thái, không gộp làm 2:
//   - field vắng mặt (`undefined`) → `undefined` = GIỮ NGUYÊN ghi chú đang có;
//   - `null` hoặc chuỗi rỗng      → `null`      = xoá có chủ đích;
//   - chuỗi                        → chuỗi đã trim = ghi đè.
// Gộp "không gửi" vào `null` là bug đã bắt trong review M120: `toggle`/`setAllInRow` của lưới
// chỉ gửi `{ installed }`, mà "tick cả hàng" PATCH luôn cả các ô ĐANG tick — gộp nhầm thì cả
// hàng mất sạch ghi chú dù người dùng không đụng tới ghi chú nào.
export function chuanHoaGhiChuO(
  raw: unknown,
): { ok: true; note: string | null | undefined } | { ok: false; error: string } {
  if (raw === undefined) return { ok: true, note: undefined };
  if (raw === null) return { ok: true, note: null };
  const t = String(raw).trim();
  if (t.length > MAX_NOTE_LEN) return { ok: false, error: `Ghi chú tối đa ${MAX_NOTE_LEN} ký tự` };
  return { ok: true, note: t || null };
}

// Dữ liệu sự kiện theo ô tick (M120) — ai lắp / lúc nào / ghi chú tại ô.
//
// Đây là NƠI DUY NHẤT quyết định 3 cột `installed_at`/`installed_by`/`note` mang giá trị gì,
// dùng chung cho mọi đường ghi ô (PATCH /api/dimensions/:id, /api/dimensions/batch, upload
// tracking M64). Gom về một chỗ vì luật dưới đây phải giống hệt nhau ở mọi đường — hai bản
// SQL song song là cách chắc chắn nhất để chúng trôi khỏi nhau (bài học `progressFromChecks`).
//
// Luật (M120 §7, quyết định D2 chốt 2026-09-03):
//   - Tick (installed = true): đóng dấu `installed_at = NOW()` và `installed_by` = người thao
//     tác. Cả hai LUÔN do server quyết định — không nhận từ body request, nếu không ai cũng
//     khai được "ô này do người khác tick lúc khác" (§12 chống giả mạo).
//   - Bỏ tick (installed = false): xoá cả 3 cột. Ô không ở trạng thái đã lắp thì không giữ dấu
//     vết lắp — giữ bất biến `installed = 0 ⇒ installed_at/by/note đều NULL`.
//
// `note`: truyền `undefined` = GIỮ NGUYÊN ghi chú đang có (đường batch — ghi chú là việc của
// từng ô, gán chung cả vùng chọn sẽ ra dữ liệu vô nghĩa); truyền `string | null` = ghi đè.
// Khi bỏ tick thì `note` luôn bị xoá bất kể tham số này.
export async function ghiDauVetTick(
  dimIds: number[],
  installed: boolean,
  opts: { userId?: number | null; note?: string | null } = {},
): Promise<void> {
  if (!dimIds.length) return;

  const cot = installed ? 1 : 0;
  const ph = dimIds.map(() => "?").join(", ");
  // Ghi chú: `undefined` → giữ giá trị cũ (biểu thức SQL là chính cột `note`).
  const noteExpr = opts.note === undefined ? "note" : "?";
  const noteParams = opts.note === undefined ? [] : [opts.note];

  // Ghi trong CHÍNH câu UPDATE đã có của mỗi đường gọi — không thêm round-trip DB nào ở
  // đường nóng nhất của app (M120 NFR1). `value` giữ nguyên hành vi cũ (= installed): cột
  // chết từ 0001, không đường nào đọc, nhưng không đổi để khỏi làm lệch dữ liệu lịch sử.
  await run(
    `UPDATE progress_dimensions
        SET installed = ?, value = ?, updated_at = CURRENT_TIMESTAMP,
            installed_at = ${installed ? "NOW()" : "NULL"},
            installed_by = ${installed ? "?" : "NULL"},
            note = ${installed ? noteExpr : "NULL"}
      WHERE id IN (${ph})`,
    cot,
    cot,
    ...(installed ? [opts.userId ?? null] : []),
    ...(installed ? noteParams : []),
    ...dimIds,
  );
}
