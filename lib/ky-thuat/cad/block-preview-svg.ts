// M103 §3 — dựng ảnh xem trước (SVG) cho một định nghĩa block lấy từ DXF sidecar.
/**
 * Module **thuần**: nhận thực thể đã parse (`DxfEntityRaw` của `lib/ky-thuat/cad/dxf-parser`) và
 * trả về chuỗi SVG — không chạm DB, không chạm tệp, test đơn vị được.
 *
 * Vì sao chỉ vẽ được một phần: đây là ảnh **nhận diện** để người duyệt biết mình đang duyệt cái
 * gì, không phải bộ dựng hình CAD. Nên chọn đúng nhóm thực thể hình học phổ biến trong block MEP
 * (LINE / LWPOLYLINE / POLYLINE / CIRCLE / ARC / TEXT / MTEXT); thực thể lạ (HATCH, SPLINE,
 * INSERT lồng…) **bỏ qua im lặng** thay vì làm hỏng cả ảnh — đúng tinh thần "best-effort, lỗi thì
 * preview = null, KHÔNG chặn đề xuất" của M103 §3.
 *
 * Quy ước hiển thị:
 *   - Toạ độ CAD có trục Y hướng LÊN, SVG hướng XUỐNG → mọi điểm ghi ra dùng `y' = -y` (không bọc
 *     `transform="scale(1,-1)"` vì làm vậy chữ sẽ bị lộn ngược).
 *   - Nét vẽ dùng `currentColor`, **không hardcode mã màu** (CLAUDE.md: dark-first, light mode đảo
 *     màu qua biến CSS — ảnh phải ăn theo màu chữ của khối chứa nó ở cả hai theme).
 *   - `viewBox` tự khớp khung bao nội dung nên block to/nhỏ bao nhiêu cũng vừa khung.
 */
import type { DxfEntityRaw } from "@/lib/ky-thuat/cad/dxf-parser";

/** Trần số thực thể đưa vào ảnh — block khung tên có thể có vài nghìn nét, vẽ hết thì chuỗi SVG
 *  lưu trong cột `preview_svg` phình vô ích (ảnh xem trước chỉ cần nhận ra hình dáng). */
const TRAN_THUC_THE = 4000;

/** Số điểm lấy mẫu trên một cung tròn khi tính khung bao (chỉ dùng để đo, không dùng để vẽ). */
const MAU_CUNG = 24;

type Diem = [number, number];

type Hinh =
  | { loai: "duong"; diem: Diem[]; kin: boolean }
  | { loai: "tron"; tam: Diem; r: number }
  | { loai: "cung"; tam: Diem; r: number; gocDau: number; gocCuoi: number }
  | { loai: "chu"; diem: Diem; cao: number; noiDung: string; xoay: number };

function diemHopLe(p: readonly number[] | undefined): Diem | null {
  if (!p || p.length < 2) return null;
  const [x, y] = p;
  return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null;
}

/** Gom thực thể DXF về tập hình vẽ được. Thực thể không hiểu / thiếu toạ độ → bỏ qua. */
function gomHinh(entities: readonly DxfEntityRaw[]): Hinh[] {
  const hinh: Hinh[] = [];
  for (const e of entities) {
    if (hinh.length >= TRAN_THUC_THE) break;
    const c = e.coordinates ?? {};
    switch (e.type) {
      case "LINE": {
        const a = diemHopLe(c.start);
        const b = diemHopLe(c.end);
        if (a && b) hinh.push({ loai: "duong", diem: [a, b], kin: false });
        break;
      }
      case "LWPOLYLINE":
      case "POLYLINE": {
        // Bulge (cung trong đa tuyến) bị bỏ qua — vẽ dây cung thay cho cung; sai lệch không đáng
        // kể ở cỡ ảnh xem trước.
        const diem = (c.points ?? []).map(diemHopLe).filter((p): p is Diem => p !== null);
        if (diem.length >= 2) hinh.push({ loai: "duong", diem, kin: c.closed === true });
        break;
      }
      case "CIRCLE": {
        const tam = diemHopLe(c.center);
        const r = c.radius;
        if (tam && typeof r === "number" && Number.isFinite(r) && r > 0) {
          hinh.push({ loai: "tron", tam, r });
        }
        break;
      }
      case "ARC": {
        const tam = diemHopLe(c.center);
        const r = c.radius;
        const gocDau = c.startAngle;
        const gocCuoi = c.endAngle;
        if (
          tam &&
          typeof r === "number" &&
          Number.isFinite(r) &&
          r > 0 &&
          typeof gocDau === "number" &&
          typeof gocCuoi === "number" &&
          Number.isFinite(gocDau) &&
          Number.isFinite(gocCuoi)
        ) {
          hinh.push({ loai: "cung", tam, r, gocDau, gocCuoi });
        }
        break;
      }
      case "TEXT":
      case "MTEXT": {
        const diem = diemHopLe(c.center);
        const noiDung = (e.decodedText || e.textValue || "").trim();
        if (diem && noiDung) {
          const cao = typeof e.textHeight === "number" && e.textHeight > 0 ? e.textHeight : 2.5;
          const xoay =
            typeof e.rotation === "number" && Number.isFinite(e.rotation) ? e.rotation : 0;
          hinh.push({ loai: "chu", diem, cao, noiDung, xoay });
        }
        break;
      }
      default:
        break; // thực thể lạ: bỏ qua im lặng (best-effort)
    }
  }
  return hinh;
}

type Khung = { minX: number; minY: number; maxX: number; maxY: number };

function moRong(k: Khung, x: number, y: number): void {
  if (x < k.minX) k.minX = x;
  if (y < k.minY) k.minY = y;
  if (x > k.maxX) k.maxX = x;
  if (y > k.maxY) k.maxY = y;
}

/** Khung bao của tập hình (toạ độ CAD, Y hướng lên). */
function khungBao(hinh: readonly Hinh[]): Khung {
  const k: Khung = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const h of hinh) {
    if (h.loai === "duong") {
      for (const [x, y] of h.diem) moRong(k, x, y);
    } else if (h.loai === "tron") {
      moRong(k, h.tam[0] - h.r, h.tam[1] - h.r);
      moRong(k, h.tam[0] + h.r, h.tam[1] + h.r);
    } else if (h.loai === "cung") {
      // Lấy mẫu dọc cung thay vì lấy cả hình tròn: cung 1/4 nằm lọt trong khung nhỏ hơn nhiều,
      // dùng cả đường tròn sẽ đẩy ảnh thu nhỏ vô cớ.
      const quet = quetCung(h.gocDau, h.gocCuoi);
      for (let i = 0; i <= MAU_CUNG; i++) {
        const goc = ((h.gocDau + (quet * i) / MAU_CUNG) * Math.PI) / 180;
        moRong(k, h.tam[0] + h.r * Math.cos(goc), h.tam[1] + h.r * Math.sin(goc));
      }
    } else {
      // Chữ: bề rộng ước lượng theo số ký tự (chỉ để ảnh không bị cắt), không cần chính xác.
      moRong(k, h.diem[0], h.diem[1]);
      moRong(k, h.diem[0] + h.cao * 0.6 * h.noiDung.length, h.diem[1] + h.cao);
    }
  }
  return k;
}

/** Góc quét của cung theo chiều ngược kim đồng hồ của AutoCAD, luôn thuộc (0, 360]. */
function quetCung(gocDau: number, gocCuoi: number): number {
  const d = (((gocCuoi - gocDau) % 360) + 360) % 360;
  return d === 0 ? 360 : d;
}

/** Số làm tròn 3 chữ số thập phân cho chuỗi SVG gọn. */
function s(v: number): string {
  return String(Math.round(v * 1000) / 1000);
}

function thoatXml(t: string): string {
  return t
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function veHinh(h: Hinh): string {
  if (h.loai === "duong") {
    const diem = h.diem.map(([x, y]) => `${s(x)},${s(-y)}`).join(" ");
    return h.kin ? `<polygon points="${diem}"/>` : `<polyline points="${diem}"/>`;
  }
  if (h.loai === "tron") {
    return `<circle cx="${s(h.tam[0])}" cy="${s(-h.tam[1])}" r="${s(h.r)}"/>`;
  }
  if (h.loai === "cung") {
    const rad = (g: number) => (g * Math.PI) / 180;
    const x1 = h.tam[0] + h.r * Math.cos(rad(h.gocDau));
    const y1 = h.tam[1] + h.r * Math.sin(rad(h.gocDau));
    const x2 = h.tam[0] + h.r * Math.cos(rad(h.gocCuoi));
    const y2 = h.tam[1] + h.r * Math.sin(rad(h.gocCuoi));
    const quet = quetCung(h.gocDau, h.gocCuoi);
    const cungLon = quet > 180 ? 1 : 0;
    // sweep-flag = 0: cung AutoCAD chạy ngược kim đồng hồ, sau khi lật trục Y thì thành thuận
    // kim đồng hồ trong hệ toạ độ SVG.
    return `<path d="M ${s(x1)} ${s(-y1)} A ${s(h.r)} ${s(h.r)} 0 ${cungLon} 0 ${s(x2)} ${s(-y2)}"/>`;
  }
  // Chữ tô đặc thay vì viền nét (kế thừa `stroke` của thẻ `svg` sẽ làm chữ nhỏ bết lại).
  const [x, y] = h.diem;
  const xoay = h.xoay ? ` transform="rotate(${s(-h.xoay)} ${s(x)} ${s(-y)})"` : "";
  return (
    `<text x="${s(x)}" y="${s(-y)}" font-size="${s(h.cao)}" fill="currentColor" stroke="none"` +
    `${xoay}>${thoatXml(h.noiDung)}</text>`
  );
}

/**
 * Dựng SVG xem trước từ danh sách thực thể của **một định nghĩa block**.
 *
 * @returns chuỗi SVG, hoặc `null` khi không có thực thể nào vẽ được (gọi phía trên coi như
 *          "chưa có ảnh xem trước" và hiển thị icon khối thay thế — M103 §5).
 */
export function dungPreviewSvg(
  entities: readonly DxfEntityRaw[] | undefined,
  nhan?: string,
): string | null {
  if (!entities || entities.length === 0) return null;
  const hinh = gomHinh(entities);
  if (hinh.length === 0) return null;

  const k = khungBao(hinh);
  if (!Number.isFinite(k.minX) || !Number.isFinite(k.minY)) return null;

  const rong = Math.max(k.maxX - k.minX, 1e-6);
  const cao = Math.max(k.maxY - k.minY, 1e-6);
  const lon = Math.max(rong, cao);
  const le = lon * 0.05;
  // Nét vẽ tỉ lệ theo cỡ hình để block cỡ mm hay cỡ mét đều nhìn được (không có nét cố định nào
  // hợp cho cả hai). `vector-effect` giữ nét không dày lên khi ảnh bị phóng to trong trang.
  const netVe = lon * 0.004;

  const viewBox = [s(k.minX - le), s(-k.maxY - le), s(rong + le * 2), s(cao + le * 2)].join(" ");

  const than = hinh.map(veHinh).join("");
  const aria = nhan ? ` role="img" aria-label="${thoatXml(`Xem trước block ${nhan}`)}"` : "";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}"${aria} ` +
    `fill="none" stroke="currentColor" stroke-width="${s(netVe)}" vector-effect="non-scaling-stroke" ` +
    `stroke-linecap="round" stroke-linejoin="round">${than}</svg>`
  );
}
