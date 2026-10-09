// QUALITY-FINAL-1 / S10c — tiền exact phía client cho trang Thanh toán tiến độ (/payments) và bản
// in (/payments/print). Mọi fetch gửi header decimal-string-v1; amount trên wire là chuỗi canonical
// → đổi NGAY sang bigint đồng×100 tại đây, sau đó cộng/trừ/tỷ lệ đều bằng bigint (không float).
// Thuần, không React — test được trực tiếp (tests/s10c-thanh-toan-money.test.ts).
import { mulRatio } from "@/lib/nen/money";
import {
  chuanHoaTienNhap,
  fmtDongDayDuMinor,
  fmtDongGonMinor,
  minorTuWire,
} from "@/lib/nen/money-dto";

export type FloorRow = {
  sheetTypeId: number;
  sheetType: string;
  sheetSlug: string | null;
  responsible: string | null;
  floorLabel: string;
  progress: number;
  taskCount: number;
  delayed: number;
  contractValue: bigint;
  /** Giá trị tương ứng tiến độ của ô tầng × hệ — server tính trong SQL, đã làm tròn tới xu. */
  earned: bigint;
};
export type DuLieuThanhToan = { rows: FloorRow[]; totalContract: bigint; totalEarned: bigint };

/** M128: 'adjustment' = phiếu sinh từ chứng từ điều chỉnh/huỷ hiệu lực IPC (amount ±). */
export type BillType = "bill" | "advance" | "item" | "adjustment";
export type Bill = {
  id: number;
  responsible: string;
  type: BillType;
  period: string | null;
  amount: bigint;
  description: string | null;
  paidDate: string;
  progressSnapshot: number;
  note: string | null;
  unit: string | null;
  quantity: number | null;
  labor: bigint | null;
  sheetTypeId: number | null;
  floorLabel: string | null;
  sheetCode?: string | null;
  workPackageName?: string | null;
  pctThisPeriod: number;
  createdBy: number | null;
  createdByName: string | null;
  createdAt: string;
  /** M129: trạng thái chi của phiếu — undefined = API cũ/phiếu không có trạng thái. */
  payStatus?: "committed" | "paid" | "void";
  paidAt?: string | null;
};
export type FloorData = {
  sheetTypeId: number;
  sheetType: string;
  floorLabel: string;
  contractValue: bigint;
  pctPaid: number;
  history: { period: string | null; pctThisPeriod: number; amount: bigint; paidDate: string }[];
};

type Obj = Record<string, unknown>;
const laV1 = (body: unknown): body is Obj =>
  body != null && typeof body === "object" && (body as Obj).moneyFormat === "decimal-string-v1";
const tien = (v: unknown): bigint => {
  if (typeof v !== "string") throw new TypeError("tiền không ở dạng chuỗi canonical");
  return minorTuWire(v);
};
const tienHoacNull = (v: unknown): bigint | null => (v == null ? null : tien(v));

/** Đọc body v1 của GET /api/payments; sai định dạng/không phải v1 → null (UI báo lỗi, không đoán). */
export function docDuLieuThanhToan(body: unknown): DuLieuThanhToan | null {
  if (!laV1(body) || !Array.isArray(body.rows)) return null;
  try {
    return {
      rows: (body.rows as Obj[]).map((r) => ({
        ...(r as unknown as FloorRow),
        contractValue: tien(r.contractValue),
        earned: tien(r.earned),
      })),
      totalContract: tien(body.totalContract),
      totalEarned: tien(body.totalEarned),
    };
  } catch {
    return null;
  }
}

/** Đọc body v1 của GET /api/payments/bills; sai định dạng → null. */
export function docBills(body: unknown): Bill[] | null {
  if (!laV1(body) || !Array.isArray(body.bills)) return null;
  try {
    return (body.bills as Obj[]).map((b) => ({
      ...(b as unknown as Bill),
      amount: tien(b.amount),
      labor: tienHoacNull(b.labor),
    }));
  } catch {
    return null;
  }
}

/** Đọc body v1 của GET /api/payments/floors; sai định dạng → null. */
export function docFloors(body: unknown): FloorData[] | null {
  if (!laV1(body) || !Array.isArray(body.floors)) return null;
  try {
    return (body.floors as Obj[]).map((f) => ({
      ...(f as unknown as FloorData),
      contractValue: tien(f.contractValue),
      history: ((f.history as Obj[]) ?? []).map((h) => ({
        ...(h as unknown as FloorData["history"][number]),
        amount: tien(h.amount),
      })),
    }));
  } catch {
    return null;
  }
}

/**
 * Phiếu tính vào KPI/tổng "công việc hoàn thành": phiếu thường/IPC ('bill') + phiếu điều chỉnh
 * IPC ('adjustment', ±, M128). Bỏ phiếu đã huỷ (void). Tạm ứng/phát sinh là nội bộ từng đợt.
 */
export function laPhieuThanhToan(b: Pick<Bill, "type" | "payStatus">): boolean {
  return (b.type === "bill" || b.type === "adjustment") && b.payStatus !== "void";
}

/** Phiếu đã chi thật: paid, hoặc thiếu payStatus (API/phiếu cũ). committed/void bị loại. */
export function daChi(b: Pick<Bill, "payStatus">): boolean {
  return b.payStatus === "paid" || b.payStatus == null;
}

/** KPI phiếu: Σ đã chi + Σ đã duyệt chưa chi (committed) — bigint exact, gồm phiếu điều chỉnh ±. */
export function tongPhieu(bills: readonly Bill[]): { daChi: bigint; chuaChi: bigint } {
  const phieu = bills.filter(laPhieuThanhToan);
  return {
    daChi: tongTien(phieu.filter(daChi), (b) => b.amount),
    chuaChi: tongTien(
      phieu.filter((b) => b.payStatus === "committed"),
      (b) => b.amount,
    ),
  };
}

/** Các mục + tổng của bản in "Bảng khối lượng thanh toán" (/payments/print) — bigint exact. */
export type TongBanIn = {
  /** Mục A: phiếu thường/IPC rồi phiếu điều chỉnh IPC (±), bỏ phiếu void (`laPhieuThanhToan`). */
  mucA: Bill[];
  mucB: Bill[];
  tamUng: Bill[];
  /** Tổng GT công việc hoàn thành = Σ mục A (đã chi + đã duyệt chưa chi, `tongPhieu`). */
  gtthtc: bigint;
  sumB: bigint;
  tuAmount: bigint;
  /** Được thanh toán kỳ này = GTTHTC − khấu trừ − tạm ứng. */
  gtttk: bigint;
};

/**
 * M128: bản in cùng quy tắc KPI /payments — phiếu void (huỷ hiệu lực) không in/không cộng, phiếu
 * điều chỉnh IPC (kể cả phiếu âm) vào mục A để tổng khớp số tiền thật.
 */
export function tongBanIn(bills: readonly Bill[]): TongBanIn {
  const mucA = [
    ...bills.filter((b) => b.type === "bill" && laPhieuThanhToan(b)),
    ...bills.filter((b) => b.type === "adjustment" && laPhieuThanhToan(b)),
  ];
  const mucB = bills.filter((b) => b.type === "item");
  const tamUng = bills.filter((b) => b.type === "advance");
  const { daChi: chi, chuaChi } = tongPhieu(mucA);
  const gtthtc = chi + chuaChi;
  const sumB = tongTien(mucB, (b) => b.amount);
  const tuAmount = tongTien(tamUng, (b) => b.amount);
  return { mucA, mucB, tamUng, gtthtc, sumB, tuAmount, gtttk: gtthtc - sumB - tuAmount };
}

/** Σ tiền bigint theo hàm lấy giá trị. */
export function tongTien<T>(items: readonly T[], lay: (it: T) => bigint): bigint {
  let s = 0n;
  for (const it of items) s += lay(it);
  return s;
}

/** tử/mẫu × 100 (%) với 1 số lẻ, chia bigint (ties xa 0); mẫu ≤ 0 → 0. */
export function phanTram(tu: bigint, mau: bigint): number {
  return mau > 0n ? Number(mulRatio(tu, 1000n, mau)) / 10 : 0;
}

/**
 * Ô nhập tiền → bigint, CÙNG quy tắc với số gửi lên server (`chuanHoaTienNhap`: "1.234.567" là
 * 1.234.567 đồng, không còn bị parseFloat đọc thành 1,23 đ). Rỗng/không hợp lệ → 0n — nơi gửi
 * server phải tự chặn ô không hợp lệ (xem `tienNhapGuiServer`), không gửi 0.
 */
export function tienNhapSangMinor(s: string): bigint {
  const chuan = chuanHoaTienNhap(s);
  return chuan == null ? 0n : minorTuWire(chuan);
}

/**
 * Ô nhập tiền → giá trị gửi server: rỗng → null; hợp lệ → chuỗi canonical 2 số lẻ; sai dạng →
 * undefined (caller báo lỗi, không gửi).
 */
export function tienNhapGuiServer(s: string): string | null | undefined {
  if (s.trim() === "") return null;
  return chuanHoaTienNhap(s) ?? undefined;
}

/**
 * Xem trước thành tiền 1 dòng thanh toán theo tầng = giá trị HĐ × % kỳ, khớp server
 * (POST /api/payments/bills: ROUND(contract_value × ROUND(pct, 4), 2)). `pct` là tỷ lệ 0..1 đúng
 * số gửi lên server; làm tròn 4 số lẻ trên chuỗi thập phân rồi nhân bigint (ties xa 0).
 */
export function thanhTienTheoPct(contractValue: bigint, pct: number): bigint {
  if (!Number.isFinite(pct) || pct <= 0) return 0n;
  const [nguyen, le = ""] = Math.min(pct, 1).toFixed(10).split(".");
  let donVi = BigInt(nguyen) * 10_000n + BigInt(le.slice(0, 4).padEnd(4, "0"));
  if (le[4] >= "5") donVi += 1n;
  return mulRatio(contractValue, donVi, 10_000n);
}

/** Tiền gọn cho thẻ/bảng: 0 → "—"; ≥ 1 triệu "1,23 tỷ"/"5,6 tr"; nhỏ hơn "1.234 đ". */
export function fmtVND(minor: bigint): string {
  if (minor === 0n) return "—";
  const gon = fmtDongGonMinor(minor);
  return /(tỷ|tr)$/.test(gon) ? gon : `${gon} đ`;
}

/** Tiền gọn có dấu: âm → "−" + trị tuyệt đối (dấu trừ chữ, không gạch nối), dương như `fmtVND`. */
export function fmtVNDCoDau(minor: bigint): string {
  return minor < 0n ? `−${fmtVND(-minor)}` : fmtVND(minor);
}

/** Tiền đầy đủ (giữ xu khi khác 0): "1.234.567,5 đ". */
export function fmtFull(minor: bigint): string {
  return `${fmtDongDayDuMinor(minor)} đ`;
}
