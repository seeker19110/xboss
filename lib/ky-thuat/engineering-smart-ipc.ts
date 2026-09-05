// lib/ky-thuat/engineering-smart-ipc.ts — Smart IPC: thẩm định 4 cổng gating + phát hành
// chứng chỉ thanh toán tạm (Module M94).
//
// ⚠️ TRUNG THỰC HOÁ DỮ LIỆU (V5, 2026-08-24): trước đây 4 cổng gating nhận trực tiếp từ
// body request với default "pass hết" (`bbntSigned3Parties !== false`, `grossClaimedVnd`
// mặc định 500 triệu…) — tức client tự khai là qua cổng thì hệ thống tin ngay. Nay mỗi cổng
// PHẢI truy vấn nguồn dữ liệu thật trong DB; thiếu dữ liệu tham chiếu → cổng đó trả trạng thái
// `khong_du_du_lieu` và CHẶN giải ngân (không bao giờ mặc định pass). Số tài khoản ngân hàng
// hardcode đã bị xoá — hệ thống hiện chưa có cột lưu thông tin ngân hàng nhà thầu nên để trống
// kèm ghi chú "chưa cấu hình", không bịa số.
//
// ⚠️ GATE 4 CHỈ CÒN LÀ CẢNH BÁO (Đợt 6, quyết định nghiệp vụ của chủ dự án 2026-09-05):
// `allGatesCleared` nay tính từ gate 1–3; gate 4 vẫn được thẩm định và trả về đầy đủ cho người
// duyệt xem nhưng KHÔNG tham gia quyết định tự động thông qua, và lý do của nó nằm ở trường
// riêng `gate4WarningReasons` (không trộn vào `blockedGateReasons` để người duyệt khỏi hiểu
// nhầm hồ sơ bị chặn vì kho). Lý do: nửa "đối soát kho" của gate 4 là BẤT KHẢ THI về cấu trúc —
// `migrations/0029_boq_codes.sql` giữ một registry BOQCODE duy nhất XUYÊN BẢNG (tasks,
// work_packages, materials, boq_items), nên `materials.boq_code` không bao giờ trùng được
// `boq_items.code` (trigger `boq_codes_sync` raise 23505). Nửa "khối lượng ≤ hạn mức BOQ" thì
// VẪN chạy đúng và vẫn là một chốt kiểm soát tiền thật — theo quyết định trên nó cũng thành
// cảnh báo, người duyệt phải tự kiểm trước khi phê duyệt.
import { query, queryOne } from "@/lib/db";
import { createHash } from "node:crypto";
import { parseMoney, mulRate, moneyToNumber } from "@/lib/nen/money";

// ============================================================================
// 1. THAM CHIẾU NGUỒN DỮ LIỆU CHO TỪNG CỔNG (client chỉ được khai định danh tham
//    chiếu — id/mã — KHÔNG được khai kết quả đạt/không đạt hay số liệu đo đạc)
// ============================================================================

export interface SmartIpcGatingRefs {
  /** Mã lượt quét Scan-to-BIM cần đối chiếu (bỏ trống → lấy lượt mới nhất của dự án). */
  scanCode?: string;
  /** UUID envelope e-Sign loại BBNT cần đối chiếu chữ ký 3 bên. */
  bbntEnvelopeId?: string;
  /** UUID thiết bị IoT đo áp lực thử thủy tĩnh. */
  iotDeviceId?: string;
  /** Cửa sổ thời gian đọc log IoT (giờ) — mặc định 2h theo tiêu chuẩn thử áp tối thiểu. */
  iotWindowHours?: number;
  /** Mã BOQ cần đối soát khối lượng nghiệm thu với kho/hợp đồng. */
  boqCode?: string;
  /** Khối lượng đang xin thanh toán (do PM/kỹ sư khai báo thủ công, không phải số đo tự động). */
  claimedQty?: number;
}

export interface SmartIpcCalculationInput {
  ipcNumber: string;
  periodMonth: string;
  contractorName: string;
  /** Chuỗi số tiền (đồng) — bắt buộc, không có giá trị mặc định. */
  grossClaimedVnd: string;
  retentionPercent?: number; // default 5.0%
  refs: SmartIpcGatingRefs;
}

// ============================================================================
// 1b. VALIDATE BODY POST — HÀM THUẦN (route chỉ gọi + trả 422, không tự parse rải rác)
// ============================================================================

export type SmartIpcValidationResult =
  { ok: true; value: SmartIpcCalculationInput } | { ok: false; error: string };

/**
 * Validate + chuẩn hoá body POST /api/engineering/smart-ipc. Trước đây `Number(...)` trên các
 * trường số (retentionPercent/iotWindowHours/claimedQty) không kiểm biên → chuỗi rác thành
 * `NaN` chảy thẳng vào tính tiền/khoảng thời gian thay vì báo lỗi rõ ràng. Hàm thuần để test
 * không cần DB/session.
 */
export function validateSmartIpcPostBody(body: unknown): SmartIpcValidationResult {
  const b = (body ?? {}) as Record<string, unknown>;

  // grossClaimedVnd trước đây có default 500.000.000 khi client bỏ trống — nay bắt buộc,
  // thiếu → lỗi rõ ràng (không tự bịa số tiền xin thanh toán).
  if (b.grossClaimedVnd == null || String(b.grossClaimedVnd).trim() === "") {
    return { ok: false, error: "Thiếu grossClaimedVnd — không thể tự động điền giá trị mặc định" };
  }
  const grossClaimedVndText = String(b.grossClaimedVnd).trim();
  if (!/^-?\d+(\.\d+)?$/.test(grossClaimedVndText)) {
    return {
      ok: false,
      error: 'grossClaimedVnd phải là chuỗi số hợp lệ (vd "1000000" hoặc "1000000.50")',
    };
  }

  if (!b.ipcNumber || !b.periodMonth || !b.contractorName) {
    return { ok: false, error: "Thiếu ipcNumber/periodMonth/contractorName" };
  }

  let retentionPercent: number | undefined;
  if (b.retentionPercent != null) {
    retentionPercent = Number(b.retentionPercent);
    if (!Number.isFinite(retentionPercent) || retentionPercent < 0 || retentionPercent > 100) {
      return { ok: false, error: "retentionPercent phải là số hữu hạn trong khoảng 0–100" };
    }
  }

  const refsRaw = (b.refs ?? {}) as Record<string, unknown>;

  let iotWindowHours: number | undefined;
  if (refsRaw.iotWindowHours != null) {
    iotWindowHours = Number(refsRaw.iotWindowHours);
    if (!Number.isFinite(iotWindowHours) || iotWindowHours <= 0) {
      return { ok: false, error: "refs.iotWindowHours phải là số hữu hạn lớn hơn 0" };
    }
  }

  let claimedQty: number | undefined;
  if (refsRaw.claimedQty != null) {
    claimedQty = Number(refsRaw.claimedQty);
    if (!Number.isFinite(claimedQty) || claimedQty < 0) {
      return { ok: false, error: "refs.claimedQty phải là số hữu hạn không âm" };
    }
  }

  return {
    ok: true,
    value: {
      ipcNumber: String(b.ipcNumber),
      periodMonth: String(b.periodMonth),
      contractorName: String(b.contractorName),
      grossClaimedVnd: grossClaimedVndText,
      retentionPercent,
      refs: {
        scanCode: refsRaw.scanCode ? String(refsRaw.scanCode) : undefined,
        bbntEnvelopeId: refsRaw.bbntEnvelopeId ? String(refsRaw.bbntEnvelopeId) : undefined,
        iotDeviceId: refsRaw.iotDeviceId ? String(refsRaw.iotDeviceId) : undefined,
        iotWindowHours,
        boqCode: refsRaw.boqCode ? String(refsRaw.boqCode) : undefined,
        claimedQty,
      },
    },
  };
}

// ============================================================================
// 2. BỐI CẢNH CỔNG — DỮ LIỆU THẬT ĐỌC TỪ DB (không lẫn logic thẩm định)
// ============================================================================

export interface SmartIpcGateContext {
  gate1: { available: boolean; maxDeviationMm: number | null; scanCode?: string };
  gate2: { available: boolean; signedCount: number; totalCount: number };
  gate3: {
    available: boolean;
    pressureDropBar: number | null;
    durationHours: number | null;
    requiredHours: number;
  };
  gate4: {
    available: boolean;
    claimedQty: number | null;
    approvedBoqQty: number | null;
    /** Luôn `null`: hệ thống chưa có liên kết dữ liệu để tính khối lượng xuất kho theo mã BOQ. */
    warehouseUsedQty: number | null;
    /**
     * Chỉ số của gate 4 chưa có nguồn dữ liệu thật, kèm lý do hiển thị nguyên văn cho người
     * duyệt (bám khuôn `thieuDuLieu` của `lib/hien-truong/subcon-metrics.ts`: chỉ số nào chưa
     * có nguồn thì trả `null` kèm lý do, TUYỆT ĐỐI không thay bằng số mặc định như 0).
     */
    thieuDuLieu: { chiSo: string; lyDo: string }[];
  };
}

/**
 * Gate 1 — Scan-to-BIM: sai lệch hình học lớn nhất của lượt quét tham chiếu.
 *
 * LƯU Ý sau khi gỡ cụm CAD/BIM: bảng `engineering_scan_to_bim_runs` vẫn còn (migration là
 * append-only) nhưng KHÔNG còn nơi nào ghi vào nó, nên cổng này luôn trả `available: false`
 * với dữ liệu mới. Cố ý KHÔNG xoá nhánh đọc: dữ liệu lịch sử đã ghi vẫn đọc được, và bỏ một
 * cổng của chuỗi IPC là thay đổi nghiệp vụ tài chính, không phải việc dọn dẹp.
 */
async function fetchGate1Context(
  projectId: number,
  scanCode?: string,
): Promise<SmartIpcGateContext["gate1"]> {
  const row = scanCode
    ? await queryOne<{ maxDeviationMm: string; scanCode: string }>(
        `SELECT max_deviation_mm::text AS "maxDeviationMm", scan_code AS "scanCode"
         FROM engineering_scan_to_bim_runs WHERE project_id = ? AND scan_code = ?`,
        projectId,
        scanCode,
      )
    : await queryOne<{ maxDeviationMm: string; scanCode: string }>(
        `SELECT max_deviation_mm::text AS "maxDeviationMm", scan_code AS "scanCode"
         FROM engineering_scan_to_bim_runs WHERE project_id = ?
         ORDER BY created_at DESC LIMIT 1`,
        projectId,
      );

  if (!row) return { available: false, maxDeviationMm: null };
  return { available: true, maxDeviationMm: Number(row.maxDeviationMm), scanCode: row.scanCode };
}

/** Gate 2 — BBNT: envelope e-Sign loại BBNT có đủ chữ ký hợp lệ của 3 bên chưa. */
async function fetchGate2Context(
  projectId: number,
  envelopeId?: string,
): Promise<SmartIpcGateContext["gate2"]> {
  if (!envelopeId) return { available: false, signedCount: 0, totalCount: 0 };

  const envelope = await queryOne<{ status: string }>(
    `SELECT status FROM engineering_esign_envelopes
     WHERE id = ? AND project_id = ? AND document_type = 'BBNT'`,
    envelopeId,
    projectId,
  );
  if (!envelope) return { available: false, signedCount: 0, totalCount: 0 };

  const signatories = await query<{ status: string }>(
    `SELECT status FROM engineering_esign_signatories WHERE envelope_id = ? AND project_id = ?`,
    envelopeId,
    projectId,
  );
  const signedCount = signatories.filter((s) => s.status === "signed").length;
  return { available: true, signedCount, totalCount: signatories.length };
}

/** Gate 3 — Thử áp thủy tĩnh IoT: sụt áp + thời lượng giữ áp thật đo được trong cửa sổ yêu cầu. */
async function fetchGate3Context(
  projectId: number,
  deviceId?: string,
  windowHours?: number,
): Promise<SmartIpcGateContext["gate3"]> {
  const requiredHours = windowHours && windowHours > 0 ? windowHours : 2.0;
  if (!deviceId)
    return { available: false, pressureDropBar: null, durationHours: null, requiredHours };

  const device = await queryOne<{ id: string }>(
    `SELECT id FROM engineering_iot_devices WHERE id = ? AND project_id = ?`,
    deviceId,
    projectId,
  );
  if (!device)
    return { available: false, pressureDropBar: null, durationHours: null, requiredHours };

  const logs = await query<{ metricValue: string; measuredAt: string }>(
    `SELECT metric_value::text AS "metricValue", measured_at AS "measuredAt"
     FROM engineering_iot_telemetry_logs
     WHERE device_id = ? AND project_id = ?
       AND measured_at >= NOW() - (?::text || ' hours')::interval
     ORDER BY measured_at ASC`,
    deviceId,
    projectId,
    requiredHours,
  );
  if (logs.length < 2) {
    return { available: false, pressureDropBar: null, durationHours: null, requiredHours };
  }

  const values = logs.map((l) => Number(l.metricValue));
  const pressureDropBar = Math.max(...values) - Math.min(...values);
  const firstMs = new Date(logs[0].measuredAt).getTime();
  const lastMs = new Date(logs[logs.length - 1].measuredAt).getTime();
  const durationHours = (lastMs - firstMs) / 3_600_000;

  return { available: true, pressureDropBar, durationHours, requiredHours };
}

/**
 * Lý do cố định vì sao chỉ số "vật tư đã xuất kho theo mã BOQ" chưa có nguồn dữ liệu thật.
 *
 * Trước đây hàm này chạy `SELECT SUM(qty_used) FROM materials WHERE boq_code = ?` với chính mã
 * lấy từ `boq_items.code` — câu truy vấn hợp lệ nhưng KHÔNG BAO GIỜ khớp dòng nào, vì
 * `migrations/0029_boq_codes.sql` gắn trigger registry BOQCODE lên cả 4 bảng (tasks,
 * work_packages, materials, boq_items) với khoá chính là `code`: hai bảng không thể cùng giữ
 * một mã. `COALESCE(..., 0)` biến "không khớp dòng nào" thành số 0 — một con số BỊA, khiến mọi
 * khối lượng dương đều trượt cổng. Nay trả thẳng `null` kèm lý do thay vì 0.
 */
const LY_DO_THIEU_DU_LIEU_KHO =
  "Chưa có nguồn dữ liệu: khối lượng vật tư đã xuất kho không tra được theo mã BOQ vì registry " +
  "BOQCODE (migrations/0029_boq_codes.sql) coi mã là duy nhất xuyên bảng tasks/work_packages/" +
  "materials/boq_items, nên materials.boq_code không bao giờ trùng boq_items.code";

/** Một mục `thieuDuLieu` mới cho chỉ số kho (hàm, không hằng dùng chung — tránh chia sẻ mảng). */
function thieuDuLieuKho(): { chiSo: string; lyDo: string }[] {
  return [{ chiSo: "warehouseUsedQty", lyDo: LY_DO_THIEU_DU_LIEU_KHO }];
}

/**
 * Gate 4 — Đối soát định lượng: KL xin thanh toán so với hạn mức hợp đồng (BOQ).
 * Nửa "đối soát kho" luôn thiếu dữ liệu (xem `LY_DO_THIEU_DU_LIEU_KHO`) nên trả `null`.
 */
async function fetchGate4Context(
  projectId: number,
  boqCode: string | undefined,
  claimedQty: number | undefined,
): Promise<SmartIpcGateContext["gate4"]> {
  if (!boqCode || claimedQty == null || !Number.isFinite(claimedQty)) {
    return {
      available: false,
      claimedQty: claimedQty ?? null,
      approvedBoqQty: null,
      warehouseUsedQty: null,
      thieuDuLieu: [
        {
          chiSo: "approvedBoqQty",
          lyDo: "Hồ sơ chưa khai mã BOQ hoặc khối lượng xin thanh toán để đối soát hạn mức",
        },
        ...thieuDuLieuKho(),
      ],
    };
  }

  const boq = await queryOne<{ qtyContract: string }>(
    `SELECT qty_contract::text AS "qtyContract" FROM boq_items
     WHERE lower(code) = lower(?) AND project_id = ?`,
    boqCode,
    projectId,
  );
  if (!boq) {
    return {
      available: false,
      claimedQty,
      approvedBoqQty: null,
      warehouseUsedQty: null,
      thieuDuLieu: [
        {
          chiSo: "approvedBoqQty",
          lyDo: `Không tìm thấy dòng BOQ mã "${boqCode}" trong dự án đang giải ngân`,
        },
        ...thieuDuLieuKho(),
      ],
    };
  }

  return {
    available: true,
    claimedQty,
    approvedBoqQty: Number(boq.qtyContract),
    warehouseUsedQty: null,
    thieuDuLieu: thieuDuLieuKho(),
  };
}

/** Đọc toàn bộ bối cảnh 4 cổng từ DB — điểm vào duy nhất cho route gọi trước khi thẩm định. */
export async function fetchSmartIpcGatingContext(
  projectId: number,
  refs: SmartIpcGatingRefs,
): Promise<SmartIpcGateContext> {
  const [gate1, gate2, gate3, gate4] = await Promise.all([
    fetchGate1Context(projectId, refs.scanCode),
    fetchGate2Context(projectId, refs.bbntEnvelopeId),
    fetchGate3Context(projectId, refs.iotDeviceId, refs.iotWindowHours),
    fetchGate4Context(projectId, refs.boqCode, refs.claimedQty),
  ]);
  return { gate1, gate2, gate3, gate4 };
}

// ============================================================================
// 3. THẨM ĐỊNH 4 CỔNG — HÀM THUẦN (test được không cần DB)
// ============================================================================

export type SmartIpcGateStatus = "passed" | "failed" | "khong_du_du_lieu";

export interface SmartIpcGateOutcome {
  status: SmartIpcGateStatus;
  reason?: string;
}

export interface SmartIpcGateEvaluation {
  gate1: SmartIpcGateOutcome;
  gate2: SmartIpcGateOutcome;
  gate3: SmartIpcGateOutcome;
  gate4: SmartIpcGateOutcome;
  /** CHỈ tính từ gate 1–3 — gate 4 là cảnh báo, không chặn (quyết định nghiệp vụ 2026-09-05). */
  allGatesCleared: boolean;
  /** Lý do của các cổng THỰC SỰ chặn giải ngân (gate 1–3). Không bao giờ chứa lý do gate 4. */
  blockedGateReasons: string[];
  /** Lý do gate 4 chưa đạt — hiển thị cho người duyệt dưới dạng CẢNH BÁO, không phải lý do chặn. */
  gate4WarningReasons: string[];
}

const KHONG_DU_DU_LIEU: (label: string) => SmartIpcGateOutcome = (label) => ({
  status: "khong_du_du_lieu",
  reason: `${label}: chưa có dữ liệu tham chiếu để thẩm định — chặn giải ngân`,
});

export function evaluateSmartIpcGates(ctx: SmartIpcGateContext): SmartIpcGateEvaluation {
  // Gate 1: Hình học Scan-to-BIM sai lệch <= 15mm
  const gate1: SmartIpcGateOutcome = !ctx.gate1.available
    ? KHONG_DU_DU_LIEU("Gate 1 (Scan-to-BIM)")
    : ctx.gate1.maxDeviationMm! <= 15.0
      ? { status: "passed" }
      : {
          status: "failed",
          reason: `Gate 1 thất bại: Sai lệch hình học Scan-to-BIM (${ctx.gate1.maxDeviationMm}mm > 15.0mm)`,
        };

  // Gate 2: Pháp lý BBNT ký số đủ 3 bên (Nhà thầu - TVGS - CĐT)
  const gate2: SmartIpcGateOutcome = !ctx.gate2.available
    ? KHONG_DU_DU_LIEU("Gate 2 (BBNT)")
    : ctx.gate2.totalCount >= 3 && ctx.gate2.signedCount === ctx.gate2.totalCount
      ? { status: "passed" }
      : {
          status: "failed",
          reason: `Gate 2 thất bại: Mới ${ctx.gate2.signedCount}/${ctx.gate2.totalCount} bên đã ký (yêu cầu đủ ≥3 bên)`,
        };

  // Gate 3: Thử nghiệm IoT thủy tĩnh (giữ áp đủ thời lượng yêu cầu, không sụt áp)
  const gate3: SmartIpcGateOutcome = !ctx.gate3.available
    ? KHONG_DU_DU_LIEU("Gate 3 (thử áp IoT)")
    : ctx.gate3.pressureDropBar! <= 0.01 && ctx.gate3.durationHours! >= ctx.gate3.requiredHours
      ? { status: "passed" }
      : {
          status: "failed",
          reason: `Gate 3 thất bại: Thử áp thủy tĩnh IoT không đạt (sụt áp ${ctx.gate3.pressureDropBar} bar, thời gian ${ctx.gate3.durationHours}h)`,
        };

  // Gate 4: Đối soát định lượng — CẢNH BÁO, KHÔNG CHẶN (xem ghi chú đầu file).
  const gate4 = danhGiaGate4(ctx.gate4);

  // Chỉ gate 1–3 quyết định tự động thông qua. Gate 4 vẫn trả về đầy đủ (status + reason) để
  // UI hiển thị, nhưng lý do của nó đi vào `gate4WarningReasons` — trộn vào `blockedGateReasons`
  // sẽ khiến người duyệt hiểu nhầm hồ sơ bị chặn vì kho.
  const gatesChan = [gate1, gate2, gate3];
  const allGatesCleared = gatesChan.every((g) => g.status === "passed");
  const blockedGateReasons = gatesChan.filter((g) => g.status !== "passed").map((g) => g.reason!);
  const gate4WarningReasons = gate4.status === "passed" ? [] : [gate4.reason!];

  return {
    gate1,
    gate2,
    gate3,
    gate4,
    allGatesCleared,
    blockedGateReasons,
    gate4WarningReasons,
  };
}

/** Tiền tố chung để mọi lý do gate 4 tự nói rõ nó là cảnh báo, không phải lý do chặn hồ sơ. */
const CANH_BAO_GATE4 = "Gate 4 (đối soát BOQ/kho) — cảnh báo, KHÔNG chặn giải ngân";

/**
 * Thẩm định gate 4. Tách riêng vì nó có 2 nửa với số phận khác hẳn nhau:
 *  - Nửa "khối lượng ≤ hạn mức BOQ" VỐN CHẠY ĐÚNG và là chốt kiểm soát tiền thật → vượt hạn
 *    mức vẫn kết luận `failed` để người duyệt thấy sai lệch (chỉ khác: không còn chặn tự động).
 *  - Nửa "đối soát kho" bất khả thi về cấu trúc → `khong_du_du_lieu` kèm lý do, KHÔNG phải
 *    `failed` ("failed" nói sai rằng hồ sơ có vấn đề), và tuyệt đối không quy về số 0.
 */
function danhGiaGate4(g4: SmartIpcGateContext["gate4"]): SmartIpcGateOutcome {
  const lyDoThieu = g4.thieuDuLieu.map((t) => t.lyDo).join("; ");

  if (!g4.available || g4.claimedQty == null || g4.approvedBoqQty == null) {
    return { status: "khong_du_du_lieu", reason: `${CANH_BAO_GATE4}: ${lyDoThieu}` };
  }

  if (g4.claimedQty > g4.approvedBoqQty) {
    return {
      status: "failed",
      reason: `${CANH_BAO_GATE4}: Khối lượng xin thanh toán vượt hạn mức BOQ (${g4.claimedQty} > ${g4.approvedBoqQty}) — người duyệt phải tự kiểm tra trước khi phê duyệt`,
    };
  }

  if (g4.warehouseUsedQty == null) {
    return {
      status: "khong_du_du_lieu",
      reason: `${CANH_BAO_GATE4}: Khối lượng ${g4.claimedQty} nằm trong hạn mức BOQ ${g4.approvedBoqQty}, nhưng chưa đối soát được với kho. ${lyDoThieu}`,
    };
  }

  if (g4.claimedQty > g4.warehouseUsedQty) {
    return {
      status: "failed",
      reason: `${CANH_BAO_GATE4}: Khối lượng xin thanh toán vượt vật tư đã xuất kho (${g4.claimedQty} > ${g4.warehouseUsedQty})`,
    };
  }

  return { status: "passed" };
}

// ============================================================================
// 4. TÍNH TIỀN — HÀM THUẦN, dùng lib/nen/money (CẤM parseFloat + * trên tiền)
// ============================================================================

export interface SmartIpcMoney {
  grossClaimedVnd: number;
  retentionAmountVnd: number;
  netPayableVnd: number;
}

export function computeSmartIpcMoney(
  grossClaimedVndText: string,
  retentionPercent: number,
  allGatesCleared: boolean,
): SmartIpcMoney {
  const grossMinor = parseMoney(grossClaimedVndText);
  const retentionMinor = mulRate(grossMinor, retentionPercent / 100);
  const netMinor = allGatesCleared ? grossMinor - retentionMinor : 0n;

  return {
    grossClaimedVnd: moneyToNumber(grossMinor),
    retentionAmountVnd: moneyToNumber(retentionMinor),
    netPayableVnd: moneyToNumber(netMinor),
  };
}

// ============================================================================
// 5. LẮP RÁP KẾT QUẢ CUỐI + PHÁT HÀNH
// ============================================================================

export interface SmartIpcResult {
  ipcNumber: string;
  periodMonth: string;
  contractorName: string;
  grossClaimedVnd: number;
  retentionAmountVnd: number;
  netPayableVnd: number;
  gate1GeometryPassed: boolean;
  gate2BbntSignedPassed: boolean;
  gate3HydroIotPassed: boolean;
  gate4QuadReconcilePassed: boolean;
  gateStatuses: {
    gate1: SmartIpcGateStatus;
    gate2: SmartIpcGateStatus;
    gate3: SmartIpcGateStatus;
    gate4: SmartIpcGateStatus;
  };
  /** CHỈ tính từ gate 1–3 (gate 4 là cảnh báo) — cũng là giá trị ghi vào cột `all_gates_cleared`. */
  allGatesCleared: boolean;
  blockedGateReasons: string[];
  /** Cảnh báo gate 4 cho người duyệt xem — KHÔNG phải lý do hồ sơ bị chặn. */
  gate4WarningReasons: string[];
  merkleSealHash: string;
  bankingPaymentPayload: Record<string, unknown>;
  paymentStatus: "released" | "held_by_gates";
  releasedAt: string;
}

/**
 * Ráp kết quả cuối từ bối cảnh 4 cổng (đã đọc DB) + input tiền — hàm thuần, không tự truy vấn
 * gì thêm để giữ test được độc lập. Route gọi `fetchSmartIpcGatingContext` trước rồi truyền vào.
 */
export function processSmartIpcRelease(
  input: SmartIpcCalculationInput,
  gateCtx: SmartIpcGateContext,
): SmartIpcResult {
  const evaluation = evaluateSmartIpcGates(gateCtx);
  const money = computeSmartIpcMoney(
    input.grossClaimedVnd,
    input.retentionPercent ?? 5.0,
    evaluation.allGatesCleared,
  );

  const releasedAt = new Date().toISOString();
  const rawSeal = `${input.ipcNumber}:${input.contractorName}:${money.grossClaimedVnd}:${money.netPayableVnd}:${evaluation.allGatesCleared}:${releasedAt}`;
  const merkleSealHash = `SEAL-IPC-${createHash("sha256").update(rawSeal).digest("hex").slice(0, 24).toUpperCase()}`;

  // Chưa có bảng lưu thông tin ngân hàng nhà thầu trong schema hiện tại — để trống, không bịa số
  // tài khoản (trước đây hardcode "98877665544", đã xoá).
  const bankingPaymentPayload = evaluation.allGatesCleared
    ? {
        bankCode: "",
        beneficiaryAccount: "",
        beneficiaryAccountNote: "Chưa cấu hình thông tin ngân hàng nhà thầu trong hệ thống",
        beneficiaryName: input.contractorName.toUpperCase(),
        amountVnd: money.netPayableVnd,
        referenceMessage: `THANH TOAN SMART IPC ${input.ipcNumber} THANG ${input.periodMonth}`,
        merkleSeal: merkleSealHash,
        authorizedAt: releasedAt,
      }
    : {};

  return {
    ipcNumber: input.ipcNumber,
    periodMonth: input.periodMonth,
    contractorName: input.contractorName,
    ...money,
    gate1GeometryPassed: evaluation.gate1.status === "passed",
    gate2BbntSignedPassed: evaluation.gate2.status === "passed",
    gate3HydroIotPassed: evaluation.gate3.status === "passed",
    gate4QuadReconcilePassed: evaluation.gate4.status === "passed",
    gateStatuses: {
      gate1: evaluation.gate1.status,
      gate2: evaluation.gate2.status,
      gate3: evaluation.gate3.status,
      gate4: evaluation.gate4.status,
    },
    allGatesCleared: evaluation.allGatesCleared,
    blockedGateReasons: evaluation.blockedGateReasons,
    gate4WarningReasons: evaluation.gate4WarningReasons,
    merkleSealHash,
    bankingPaymentPayload,
    paymentStatus: evaluation.allGatesCleared ? "released" : "held_by_gates",
    releasedAt,
  };
}

// ============================================================================
// 6. LƯU TRỮ & TRUY VẤN
// ============================================================================

/**
 * Lưu bản ghi Smart IPC.
 *
 * ⚠️ Ý NGHĨA CỘT ĐÃ ĐỔI (Đợt 6, 2026-09-05) — tên cột giữ nguyên (không migration, không đổi
 * tên cột): `all_gates_cleared` nay là kết luận của **3 cổng** (gate 1–3), không còn là 4.
 * `gate4_quad_reconcile_passed` vẫn ghi đúng trạng thái thật của gate 4 (chỉ `true` khi
 * `status === "passed"`), nhưng nó chỉ là số liệu tham khảo/cảnh báo cho người duyệt, không
 * tham gia quyết định giải ngân. Đọc dữ liệu lịch sử cần lưu ý mốc thời gian này.
 */
export async function saveSmartIpcRecord(
  projectId: number,
  result: SmartIpcResult,
  userId?: number,
): Promise<{ id: string }> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO engineering_smart_ipc_records (
      project_id, ipc_number, period_month, contractor_name,
      gross_claimed_vnd, net_payable_vnd, retention_amount_vnd,
      gate1_geometry_passed, gate2_bbnt_signed_passed, gate3_hydro_iot_passed,
      gate4_quad_reconcile_passed, all_gates_cleared, merkle_seal_hash,
      banking_payment_payload, payment_status, released_at, created_by
    ) VALUES (
      ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?,
      ?::jsonb, ?, ?::timestamptz, ?
    )
    ON CONFLICT (project_id, ipc_number) DO UPDATE SET
      net_payable_vnd = EXCLUDED.net_payable_vnd,
      all_gates_cleared = EXCLUDED.all_gates_cleared,
      payment_status = EXCLUDED.payment_status,
      merkle_seal_hash = EXCLUDED.merkle_seal_hash
    RETURNING id`,

    projectId,
    result.ipcNumber,
    result.periodMonth,
    result.contractorName,
    result.grossClaimedVnd,
    result.netPayableVnd,
    result.retentionAmountVnd,
    result.gate1GeometryPassed,
    result.gate2BbntSignedPassed,
    result.gate3HydroIotPassed,
    result.gate4QuadReconcilePassed,
    result.allGatesCleared,
    result.merkleSealHash,
    JSON.stringify(result.bankingPaymentPayload),
    result.paymentStatus,
    result.releasedAt,
    userId || null,
  );

  if (!row) throw new Error("Failed to save smart IPC record");
  return row;
}

export async function listSmartIpcRecords(
  projectId: number,
): Promise<Array<Record<string, unknown>>> {
  return query<Record<string, unknown>>(
    `SELECT * FROM engineering_smart_ipc_records
     WHERE project_id = ?
     ORDER BY created_at DESC
     LIMIT 50`,
    projectId,
  );
}
