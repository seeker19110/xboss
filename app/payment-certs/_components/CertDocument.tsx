"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Banknote,
  Check,
  ChevronLeft,
  ChevronRight,
  FileDown,
  FileSpreadsheet,
  FileText,
  Save,
  Send,
  Undo2,
  X,
  XCircle,
} from "lucide-react";
import MaskedValue from "@/app/components/MaskedValue";
import { mMul, mSumBy } from "@/app/lib/masked";
import { appAlert, appConfirm, appPrompt } from "@/app/components/dialogs";
import { showToast } from "@/app/components/Toast";
import { Skeleton } from "@/app/components/Skeleton";
import {
  Button,
  ButtonLink,
  Card,
  Chip,
  DocField,
  DocFieldGroup,
  DocToolbar,
  DocTotals,
  Kbd,
  Section,
  type DocTotalRow,
} from "@/app/components/ui";
import type { ChipTone } from "@/app/components/ui/Chip";
import type { EntityApprovalStatus } from "@/lib/tien-do/approvals";
import {
  HEADER_DINH_DANG_TIEN,
  docChiTietDot,
  docYeuCauXacNhan,
  fmtVNDExact,
  taoIdempotencyKey,
  type CertTotalsView,
  type DongVuot,
  type TomTatDieuChinhDot,
  type YeuCauXacNhan,
} from "./chiTietDot";
import XacNhanCanhBaoDialog from "./XacNhanCanhBaoDialog";
import DanhDauDaChiDialog from "./DanhDauDaChiDialog";
import DieuChinhDot from "./DieuChinhDot";

// Khối "chứng từ" của một đợt thanh toán (IPC) — M124. Tách ra từ hộp thoại chi tiết đợt
// cũ trong `app/payment-certs/page.tsx`: cùng dữ liệu, cùng các hàm gọi API, nhưng hiển thị
// TOÀN TRANG ở cột phải (master–detail) thay vì hộp thoại max-w-2xl chật.

export type CertStatus = "draft" | "submitted" | "approved" | "rejected";

export const STATUS_LABEL: Record<CertStatus, string> = {
  draft: "Nháp",
  submitted: "Đã trình",
  approved: "Được duyệt",
  rejected: "Từ chối",
};

/** Màu chip trạng thái — dùng chung cho cả danh sách trái và chứng từ phải. */
export const STATUS_TONE: Record<CertStatus, ChipTone> = {
  draft: "neutral",
  submitted: "warning",
  approved: "success",
  rejected: "danger",
};

export type CertItem = {
  id: number;
  boqItemId: number;
  boqCode: string;
  boqName: string;
  boqUnit: string;
  boqQtyContract: number;
  qtyPeriod: number;
  qtyCumulative: number;
  unitPrice: number;
};

/** M129: phiếu thanh toán sinh từ đợt đã duyệt (null = chưa có phiếu). */
export type CertBill = {
  id: number;
  payStatus: "committed" | "paid" | "void";
  paidAt: string | null;
  paidRef: string | null;
};

export type Cert = {
  id: number;
  code: string;
  contractId: number;
  contractCode: string;
  contractTitle: string;
  periodNo: number;
  periodLabel: string | null;
  status: CertStatus;
  submittedAt: string | null;
  decidedAt: string | null;
  /** Người duyệt đợt — API chưa trả thì undefined (server vẫn chặn SoD bằng 403). */
  decidedBy?: number | null;
  bill?: CertBill | null;
  rejectReason: string | null;
  createdByName: string | null;
  createdAt: string | null;
  items: CertItem[];
};

// DongVuot (dòng vượt KL hợp đồng) + CertTotalsView (tổng tiền dạng chuỗi exact, null = bị che)
// khai ở chiTietDot.ts cùng hàm đọc response.
export type { CertTotalsView, DongVuot };

export function fmtVND(n: number) {
  if (!n) return "—";
  return Math.round(n).toLocaleString("vi-VN") + " đ";
}

// Cột DATE của Postgres về đây vẫn là chuỗi 'YYYY-MM-DD' (parser riêng trong lib/db) —
// `submittedAt`/`decidedAt` thuộc loại này, không được gắn thêm giờ 00:00 giả.
function fmtLuc(s: string | null) {
  if (!s) return "—";
  const chiNgay = /^\d{4}-\d{2}-\d{2}$/.test(s);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return chiNgay
    ? d.toLocaleDateString("vi-VN")
    : d.toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" });
}

export type CertDocumentCtrl = {
  cert: Cert | null;
  canManage: boolean;
  canDecide: boolean;
  canEdit: boolean;
  /** Admin/PM, không phải người đã duyệt đợt — được đánh dấu phiếu đã chi (M129). */
  canMarkPaid: boolean;
  /** Id người đăng nhập (null = chưa rõ) — ẩn nút duyệt chứng từ điều chỉnh do chính mình lập. */
  meId: number | null;
  /** M128: tóm tắt chứng từ điều chỉnh của đợt (null = chưa tải/không có). */
  adjustmentsSummary: TomTatDieuChinhDot | null;
  /** Nạp lại danh sách/đợt sau khi đổi dữ liệu. */
  refresh: () => void | Promise<void>;
  busy: boolean;
  /** Còn thay đổi chưa lưu (KL hoặc nhãn kỳ). */
  dirty: boolean;
  dangTaiChiTiet: boolean;
  qtys: Record<number, string>;
  setQty: (itemId: number, value: string) => void;
  periodLabel: string;
  setPeriodLabel: (value: string) => void;
  approvalStatus: EntityApprovalStatus | null;
  vuotHopDong: DongVuot[];
  totals: CertTotalsView | null;
  /** Lỗi tải tổng hợp giá trị (tiếng Việt) — khác "•••" (bị che quyền). */
  loiChiTiet: string | null;
  /** Tạm tính theo KL đang nhập (chưa lưu) — chỉ để đối chiếu, không thay số của API. */
  tamTinh: number | null;
  saveItems: () => Promise<void>;
  submitCert: () => Promise<void>;
  decide: (decision: "approved" | "rejected") => Promise<void>;
  /** Hộp xác nhận cảnh báo vượt HĐ đang mở (S13c) — null = đóng. */
  xacNhan: YeuCauXacNhan | null;
  huyXacNhan: () => void;
  /** Gửi duyệt kèm acknowledged + lý do + warningVersion của đúng bản đang hiển thị. */
  xacNhanDuyet: (lyDo: string) => Promise<void>;
  close: () => void;
};

// Toàn bộ state + lời gọi API của chứng từ gom vào một hook để thanh công cụ TRÊN và
// thanh hành động ĐÁY (render bởi AppHeader ở tầng trang) dùng chung đúng một bộ hàm.
export function useCertDocument({
  cert,
  canManage,
  canDecide,
  meId = null,
  contractValue,
  onSaved,
  onClose,
}: {
  cert: Cert | null;
  canManage: boolean;
  canDecide: boolean;
  /** Id người đang đăng nhập — ẩn nút đánh dấu chi với chính người duyệt đợt. */
  meId?: number | null;
  /** null = bị che (thiếu viewPayments) */
  contractValue: number | null;
  onSaved: () => void | Promise<void>;
  onClose: () => void;
}): CertDocumentCtrl {
  const [qtys, setQtys] = useState<Record<number, string>>({});
  const [periodLabel, setPeriodLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [dangTaiChiTiet, setDangTaiChiTiet] = useState(false);
  // Trạng thái duyệt engine (M46 PR2) — null khi chưa có flow cấu hình cho "payment_cert",
  // giữ UI y hệt trước (không hiện badge/lịch sử) đúng nguyên tắc "dormant" của M46.
  const [approvalStatus, setApprovalStatus] = useState<EntityApprovalStatus | null>(null);
  // Dòng có khối lượng luỹ kế VƯỢT khối lượng hợp đồng. Route cố ý không chặn (thi công vượt
  // trong khi VO/phụ lục còn chờ duyệt là tình huống thật), nhưng người ký duyệt phải nhìn
  // thấy — trước đợt này không có lớp nào so khối lượng với hợp đồng, nhập gấp 10 lần vẫn lưu.
  const [vuotHopDong, setVuotHopDong] = useState<DongVuot[]>([]);
  // S13c (A5-FR07): phiên bản cảnh báo server dựng — duyệt phải gửi kèm để server biết người
  // duyệt đã xem ĐÚNG bản cảnh báo hiện hành (đổi → 409 warning_changed, hộp mở lại).
  const [warningVersion, setWarningVersion] = useState<string | null>(null);
  const [xacNhan, setXacNhan] = useState<YeuCauXacNhan | null>(null);
  // Idempotency-Key của lượt quyết định đang gửi: mất mạng giữa chừng thì bấm lại dùng đúng
  // key cũ → server phát lại kết quả cũ thay vì duyệt/sinh phiếu lần hai.
  const keyQuyetDinh = useRef<string | null>(null);
  const [totals, setTotals] = useState<CertTotalsView | null>(null);
  const [adjustmentsSummary, setAdjustmentsSummary] = useState<TomTatDieuChinhDot | null>(null);
  const [loiChiTiet, setLoiChiTiet] = useState<string | null>(null);

  // Đổi đợt (hoặc tải lại danh sách sau khi lưu) → nạp lại ô nhập theo số của server.
  useEffect(() => {
    setQtys(Object.fromEntries((cert?.items ?? []).map((it) => [it.id, String(it.qtyPeriod)])));
    setPeriodLabel(cert?.periodLabel ?? "");
  }, [cert]);

  // Chi tiết đợt (tổng tiền do SQL tính + trạng thái duyệt + dòng vượt KL hợp đồng).
  // Phụ thuộc vào chính object `cert` nên sau mỗi lần lưu/duyệt (danh sách nạp lại) số
  // tổng cũng được lấy lại, không hiển thị số cũ.
  useEffect(() => {
    const id = cert?.id;
    setXacNhan(null);
    keyQuyetDinh.current = null;
    if (id == null) {
      setApprovalStatus(null);
      setVuotHopDong([]);
      setWarningVersion(null);
      setTotals(null);
      setAdjustmentsSummary(null);
      setLoiChiTiet(null);
      return;
    }
    let huy = false;
    setDangTaiChiTiet(true);
    // decimal-string-v1: tổng tiền exact dạng chuỗi; lỗi HTTP/mạng hiện thông báo, không "•••".
    fetch(`/api/payment-certs/${id}`, { headers: HEADER_DINH_DANG_TIEN })
      .then(docChiTietDot)
      .catch(() => ({
        approvalStatus: null,
        adjustmentsSummary: null,
        vuotHopDong: [],
        warningVersion: null,
        totals: null,
        loi: "Không tải được tổng hợp giá trị đợt — kiểm tra kết nối mạng rồi mở lại đợt",
      }))
      .then((ct) => {
        if (huy) return;
        setApprovalStatus(ct.approvalStatus);
        setVuotHopDong(ct.vuotHopDong);
        setWarningVersion(ct.warningVersion);
        setTotals(ct.totals);
        setAdjustmentsSummary(ct.adjustmentsSummary ?? null);
        setLoiChiTiet(ct.loi);
      })
      .finally(() => {
        if (!huy) setDangTaiChiTiet(false);
      });
    return () => {
      huy = true;
    };
  }, [cert]);

  const canEdit = canManage && cert?.status === "draft";

  const dirty = useMemo(() => {
    if (!cert) return false;
    if ((cert.periodLabel ?? "") !== periodLabel) return true;
    return cert.items.some((it) => (Number(qtys[it.id]) || 0) !== Number(it.qtyPeriod));
  }, [cert, qtys, periodLabel]);

  // M50 PR2: unitPrice có thể bị che (null) — dùng mMul/mSumBy để tổng tạm tính cũng
  // "bị che" (null) thay vì ngầm thành 0.
  const tamTinh = useMemo(
    () => (cert ? mSumBy(cert.items, (it) => mMul(Number(qtys[it.id]) || 0, it.unitPrice)) : null),
    [cert, qtys],
  );

  const setQty = useCallback((itemId: number, value: string) => {
    setQtys((prev) => ({ ...prev, [itemId]: value }));
  }, []);

  const saveItems = useCallback(async () => {
    if (!cert) return;
    setBusy(true);
    // try/catch/finally: mất sóng ngoài công trường không được để nút kẹt
    // "Đang lưu..." mà không báo gì (audit 2026-09-05).
    let res: Response;
    try {
      res = await fetch(`/api/payment-certs/${cert.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: cert.items.map((it) => ({
            boqItemId: it.boqItemId,
            qtyPeriod: Number(qtys[it.id]) || 0,
          })),
          periodLabel: periodLabel.trim() || null,
        }),
      });
    } catch {
      appAlert("Mất kết nối — chưa lưu được, thử lại khi có mạng");
      return;
    } finally {
      setBusy(false);
    }
    if (!res.ok) {
      showToast((await res.json().catch(() => null))?.error ?? "Lưu thất bại", "error");
      return;
    }
    await onSaved();
  }, [cert, qtys, periodLabel, onSaved]);

  const submitCert = useCallback(async () => {
    if (!cert) return;
    if (!(await appConfirm(`Trình đợt ${cert.code} lên CĐT/TVGS?`))) return;
    setBusy(true);
    // try/catch/finally: mất sóng ngoài công trường không được để nút kẹt
    // "Đang lưu..." mà không báo gì (audit 2026-09-05).
    let res: Response;
    try {
      res = await fetch(`/api/payment-certs/${cert.id}/submit`, { method: "POST" });
    } catch {
      appAlert("Mất kết nối — chưa lưu được, thử lại khi có mạng");
      return;
    } finally {
      setBusy(false);
    }
    if (!res.ok) {
      showToast((await res.json().catch(() => null))?.error ?? "Trình thất bại", "error");
      return;
    }
    await onSaved();
  }, [cert, onSaved]);

  // Gửi quyết định. 409 cần (lại) xác nhận cảnh báo → mở hộp xác nhận với danh sách server trả
  // về (không bao giờ tự gửi lại acknowledged=true, không hiểu 409 là "đã duyệt").
  const guiQuyetDinh = useCallback(
    async (body: Record<string, unknown>) => {
      if (!cert) return;
      setBusy(true);
      keyQuyetDinh.current ??= taoIdempotencyKey();
      const key = keyQuyetDinh.current;
      // try/catch/finally: mất sóng ngoài công trường không được để nút kẹt
      // "Đang lưu..." mà không báo gì (audit 2026-09-05).
      let res: Response;
      try {
        res = await fetch(`/api/payment-certs/${cert.id}/decide`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(key ? { "Idempotency-Key": key } : {}),
          },
          body: JSON.stringify(body),
        });
      } catch {
        // Giữ key: lần bấm lại phát lại đúng lượt này nếu server đã kịp ghi.
        appAlert(
          "Mất kết nối — chưa rõ đợt đã được ghi nhận hay chưa. Có mạng lại thì bấm lại, đợt không bị duyệt hai lần",
        );
        return;
      } finally {
        setBusy(false);
      }
      keyQuyetDinh.current = null;
      const j = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (!res.ok) {
        const yeuCau = docYeuCauXacNhan(res.status, j);
        if (yeuCau) {
          setVuotHopDong(yeuCau.vuotHopDong);
          setWarningVersion(yeuCau.warningVersion);
          setXacNhan(yeuCau);
          return;
        }
        if (j?.code === "idempotency_conflict") {
          showToast("Đợt đã được xử lý ở lần gửi trước — đang tải lại trạng thái", "warning");
          await onSaved();
          return;
        }
        showToast(typeof j?.error === "string" ? j.error : "Quyết định thất bại", "error");
        return;
      }
      setXacNhan(null);
      await onSaved();
    },
    [cert, onSaved],
  );

  const decide = useCallback(
    async (decision: "approved" | "rejected") => {
      if (!cert) return;
      if (decision === "rejected") {
        const rejectReason = await appPrompt("Lý do từ chối:");
        if (!rejectReason?.trim()) return;
        await guiQuyetDinh({ decision, rejectReason });
        return;
      }
      // Có dòng vượt khối lượng HĐ → hộp xác nhận (tick đã xem + lý do), không confirm 1 bấm.
      if (vuotHopDong.length > 0 && warningVersion) {
        setXacNhan({ vuotHopDong, warningVersion, doiNguon: false });
        return;
      }
      // qtyCumulative server trả là luỹ kế HIỆU LỰC tới hết đợt này (gồm chứng từ điều chỉnh đã
      // duyệt của các kỳ ≤ đợt, M128 §6) — nếu duyệt, đây sẽ là luỹ kế mới của hợp đồng.
      const projectedCumulative = mSumBy(cert.items, (it) =>
        mMul(Number(it.qtyCumulative), it.unitPrice),
      );
      // Chỉ cảnh báo vượt khi cả hai vế xác định (không bị che) — duyệt là quyền admin/pm
      // (có viewPayments) nên thực tế luôn xác định; guard để đúng kiểu + phòng thủ.
      const wouldBeOver =
        contractValue != null &&
        projectedCumulative != null &&
        contractValue > 0 &&
        projectedCumulative > contractValue;
      const label = wouldBeOver
        ? `Duyệt đợt ${cert.code}? CẢNH BÁO: luỹ kế sẽ vượt giá trị hợp đồng.`
        : `Duyệt đợt ${cert.code}?`;
      if (!(await appConfirm(label, { danger: wouldBeOver }))) return;
      // Gửi kèm phiên bản đang xem: nguồn đổi trong lúc chờ (kỳ trước vừa duyệt…) → 409 thay vì
      // duyệt một bản khác bản người dùng đã nhìn.
      await guiQuyetDinh({ decision, ...(warningVersion ? { warningVersion } : {}) });
    },
    [cert, contractValue, vuotHopDong, warningVersion, guiQuyetDinh],
  );

  const huyXacNhan = useCallback(() => setXacNhan(null), []);
  const xacNhanDuyet = useCallback(
    async (lyDo: string) => {
      if (!xacNhan) return;
      await guiQuyetDinh({
        decision: "approved",
        acknowledged: true,
        reason: lyDo,
        warningVersion: xacNhan.warningVersion,
      });
    },
    [xacNhan, guiQuyetDinh],
  );

  // Phím tắt (FR7): Ctrl/⌘+S lưu KL, Esc đóng chứng từ. Bỏ qua khi đang mở hộp thoại
  // xác nhận (appConfirm/appPrompt tự xử lý Esc của nó) để không đóng nhầm 2 lớp.
  //
  // Pattern "latest ref": handler đọc state mới nhất qua ref thay vì qua closure — effect
  // chỉ gắn listener MỘT LẦN thay vì gỡ/gắn lại mỗi lần `saveItems` đổi (đổi mỗi phím gõ
  // vì phụ thuộc `qtys`), tránh mất/nhân đôi phím tắt lúc đang gõ dở.
  const latestRef = useRef({ cert, canEdit, busy, dirty, saveItems, onClose });
  latestRef.current = { cert, canEdit, busy, dirty, saveItems, onClose };

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const { cert, canEdit, busy, dirty, saveItems, onClose } = latestRef.current;
      if (!cert) return;
      // Ctrl/⌘+S phải luôn chặn hành vi mặc định của trình duyệt (mở hộp "Lưu trang"),
      // kể cả lúc chưa được sửa/đang bận — nếu return sớm trước preventDefault, trình
      // duyệt vẫn mở hộp thoại lưu file.
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (!canEdit || busy) return;
        void saveItems();
        return;
      }
      if (e.key === "Escape") {
        // Modal đã xử lý Esc (preventDefault) thì thôi — không dò [role=dialog] vì Modal
        // gỡ DOM trước khi listener này chạy.
        if (e.defaultPrevented || document.querySelector('[role="dialog"]')) return;
        // Đang gõ dở trong 1 ô nhập thì Esc chỉ thoát focus ô đó (hành vi quen thuộc),
        // không đóng luôn cả chứng từ.
        const active = document.activeElement;
        if (
          active instanceof HTMLElement &&
          active.matches("input, textarea, select, [contenteditable]")
        ) {
          active.blur();
          return;
        }
        if (dirty) {
          void (async () => {
            if (await appConfirm("Còn thay đổi chưa lưu — đóng và bỏ thay đổi?")) onClose();
          })();
          return;
        }
        onClose();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return {
    cert,
    canManage,
    canDecide,
    canEdit: !!canEdit,
    canMarkPaid:
      canManage &&
      cert?.status === "approved" &&
      cert.bill?.payStatus === "committed" &&
      !(meId != null && cert.decidedBy != null && cert.decidedBy === meId),
    meId,
    adjustmentsSummary,
    refresh: onSaved,
    busy,
    dirty,
    dangTaiChiTiet,
    qtys,
    setQty,
    periodLabel,
    setPeriodLabel,
    approvalStatus,
    vuotHopDong,
    totals,
    loiChiTiet,
    tamTinh,
    saveItems,
    submitCert,
    decide,
    xacNhan,
    huyXacNhan,
    xacNhanDuyet,
    close: onClose,
  };
}

/** Bộ nút hành động của chứng từ — dùng chung cho thanh công cụ trên và thanh đáy. */
function NutDanhDauDaChi({
  billId,
  maDot,
  ngayDuyet,
  busy,
  onXong,
}: {
  billId: number;
  maDot: string;
  /** Ngày duyệt đợt (DATE 'YYYY-MM-DD') — làm `min` của ô ngày chi; server vẫn chặn 422. */
  ngayDuyet: string | null;
  busy: boolean;
  onXong: () => void | Promise<void>;
}) {
  const [mo, setMo] = useState(false);
  return (
    <>
      <Button
        icon={Banknote}
        variant="primary"
        disabled={busy}
        aria-label={`Đánh dấu đã chi đợt ${maDot}`}
        onClick={() => setMo(true)}
      >
        Đánh dấu đã chi
      </Button>
      {mo && (
        <DanhDauDaChiDialog
          billId={billId}
          maDot={maDot}
          ngayDuyet={ngayDuyet}
          onDong={() => setMo(false)}
          onXong={onXong}
        />
      )}
    </>
  );
}

/** Badge trạng thái chi của đợt đã duyệt (kèm chữ, không chỉ màu). */
function ChipTrangThaiChi({ bill }: { bill: CertBill | null | undefined }) {
  if (!bill || bill.payStatus === "void") return null;
  if (bill.payStatus === "paid") return <Chip tone="success">Đã chi {fmtLuc(bill.paidAt)}</Chip>;
  return <Chip tone="warning">Đã duyệt · chưa chi</Chip>;
}

function CertActions({ ctrl }: { ctrl: CertDocumentCtrl }) {
  const { cert, canManage, canDecide, canEdit, busy, dirty } = ctrl;
  if (!cert) return null;
  // Nút chính đổi theo trạng thái: còn KL chưa lưu → Lưu KL; đã lưu xong → Trình;
  // đợt đã trình → Duyệt.
  const luuLaChinh = canEdit && dirty;
  return (
    <>
      {canEdit && (
        <Button
          icon={Save}
          variant={luuLaChinh ? "primary" : "secondary"}
          disabled={busy}
          onClick={() => void ctrl.saveItems()}
        >
          {busy ? "Đang lưu…" : "Lưu KL"}
          <Kbd onAccent={luuLaChinh} className="ml-1.5">
            Ctrl S
          </Kbd>
        </Button>
      )}
      {canManage && cert.status === "draft" && (
        <Button
          icon={Send}
          variant={luuLaChinh ? "secondary" : "primary"}
          disabled={busy}
          onClick={() => void ctrl.submitCert()}
        >
          Trình lên CĐT/TVGS
        </Button>
      )}
      {canDecide && cert.status === "submitted" && (
        <>
          <Button
            icon={Check}
            variant="primary"
            disabled={busy}
            onClick={() => void ctrl.decide("approved")}
          >
            Duyệt
          </Button>
          <Button
            icon={XCircle}
            variant="danger"
            disabled={busy}
            onClick={() => void ctrl.decide("rejected")}
          >
            Từ chối
          </Button>
        </>
      )}
      {ctrl.canMarkPaid && cert.bill && (
        <NutDanhDauDaChi
          billId={cert.bill.id}
          maDot={cert.code}
          ngayDuyet={cert.decidedAt}
          busy={busy}
          onXong={ctrl.refresh}
        />
      )}
      {cert.status === "approved" && (
        <>
          <ButtonLink
            icon={FileDown}
            href={`/api/payment-certs/${cert.id}/pdf`}
            target="_blank"
            rel="noreferrer"
          >
            PDF
          </ButtonLink>
          <ButtonLink
            icon={FileSpreadsheet}
            href={`/api/payment-certs/${cert.id}/excel`}
            target="_blank"
            rel="noreferrer"
          >
            Excel
          </ButtonLink>
        </>
      )}
    </>
  );
}

/**
 * Thanh hành động đáy — truyền qua `bottomActions` của `AppHeader`. Hiện ở MỌI breakpoint
 * khi đang mở một đợt (quyết định người dùng: đáy ưu tiên thao tác trên điện thoại).
 */
export function CertBottomActions({ ctrl }: { ctrl: CertDocumentCtrl }) {
  if (!ctrl.cert) return null;
  return (
    <>
      <CertActions ctrl={ctrl} />
      <span className="ml-auto flex items-center gap-2 shrink-0">
        <DocToolbar.Sep />
        <Button icon={X} variant="secondary" onClick={ctrl.close}>
          Đóng
          <Kbd className="ml-1.5">Esc</Kbd>
        </Button>
      </span>
    </>
  );
}

export type CertNav = {
  /** Vị trí đợt đang mở trong danh sách (0-based) và tổng số đợt. */
  index: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  /** Quay về danh sách (dưới lg danh sách bị ẩn khi đang mở chứng từ). */
  onBackToList: () => void;
};

/** Ô tiền đợt: null/thiếu = API che quyền → "•••" (MaskedValue); chuỗi exact → "x đ". */
function TienDot({ value, am = false }: { value: string | null | undefined; am?: boolean }) {
  if (value == null) return <MaskedValue value={null} format={fmtVND} />;
  return <>{fmtVNDExact(value, am)}</>;
}

export default function CertDocument({ ctrl, nav }: { ctrl: CertDocumentCtrl; nav: CertNav }) {
  const {
    cert,
    canEdit,
    qtys,
    setQty,
    periodLabel,
    setPeriodLabel,
    approvalStatus,
    vuotHopDong,
    totals,
    loiChiTiet,
    tamTinh,
    dangTaiChiTiet,
  } = ctrl;
  if (!cert) return null;

  const totalRows: DocTotalRow[] = [
    {
      label: "Giá trị đợt này",
      value: <TienDot value={totals?.periodValue} />,
    },
    {
      label: "Luỹ kế tới hết đợt",
      value: <TienDot value={totals?.cumulativeValue} />,
    },
    {
      // Dấu "−" gắn trong TienDot (chỉ khi giá trị không bị che) —
      // không đặt `negative: true` để DocTotals không tự thêm một dấu "−" nữa, tránh
      // hiện "−••• đ" khi người xem không có quyền (giá trị bị che vẫn phải là "••• đ" sạch).
      label: "Khấu trừ tạm ứng",
      value: <TienDot value={totals?.advanceDeduct} am />,
    },
    {
      label: "Giữ lại bảo hành",
      value: <TienDot value={totals?.retentionDeduct} am />,
    },
  ];

  return (
    <div className="space-y-4">
      {ctrl.xacNhan && (
        <XacNhanCanhBaoDialog
          // Đổi phiên bản cảnh báo → dựng lại hộp: ô "đã xem" bỏ tick, phải xác nhận lại.
          key={ctrl.xacNhan.warningVersion}
          yeuCau={ctrl.xacNhan}
          maDot={cert.code}
          busy={ctrl.busy}
          onHuy={ctrl.huyXacNhan}
          onXacNhan={(lyDo) => void ctrl.xacNhanDuyet(lyDo)}
        />
      )}
      <DocToolbar
        trailing={
          nav.total > 1 ? (
            <>
              <Button
                size="icon"
                variant="ghost"
                icon={ChevronLeft}
                aria-label="Đợt trước"
                disabled={nav.index <= 0}
                onClick={nav.onPrev}
              />
              <span className="text-xs text-zinc-400 tabular-nums whitespace-nowrap">
                đợt {nav.index + 1} / {nav.total}
              </span>
              <Button
                size="icon"
                variant="ghost"
                icon={ChevronRight}
                aria-label="Đợt sau"
                disabled={nav.index >= nav.total - 1}
                onClick={nav.onNext}
              />
            </>
          ) : null
        }
      >
        <span className="flex items-center gap-2 lg:hidden">
          <Button icon={ChevronLeft} variant="ghost" onClick={nav.onBackToList}>
            Danh sách
          </Button>
          <DocToolbar.Sep />
        </span>
        <CertActions ctrl={ctrl} />
      </DocToolbar>

      <header className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-mono text-lg font-semibold text-zinc-100">{cert.code}</h2>
          <Chip tone={STATUS_TONE[cert.status]}>{STATUS_LABEL[cert.status]}</Chip>
          {cert.status === "approved" && <ChipTrangThaiChi bill={cert.bill} />}
          {cert.status === "approved" && ctrl.adjustmentsSummary?.reversed && (
            <Chip tone="danger" icon={Undo2}>
              Đã huỷ hiệu lực
            </Chip>
          )}
          {approvalStatus?.status === "pending" && (
            <Chip tone="warning">
              Chờ duyệt (bước {approvalStatus.currentSeq}/{approvalStatus.totalSteps})
            </Chip>
          )}
        </div>
        <p className="text-xs text-zinc-400">
          {cert.contractCode} — {cert.contractTitle} · Đợt {cert.periodNo} ·{" "}
          {cert.createdByName ?? "—"} · {fmtLuc(cert.createdAt)}
        </p>
      </header>

      <Section title="Thông tin chứng từ" icon={FileText}>
        <Card tone="raised" pad="md">
          <DocFieldGroup>
            <div className="space-y-3">
              <DocField label="Mã đợt" readOnly>
                <span className="font-mono">{cert.code}</span>
              </DocField>
              <DocField label="Hợp đồng" readOnly>
                <span className="font-mono">{cert.contractCode}</span> — {cert.contractTitle}
              </DocField>
              <DocField label="Đợt" readOnly>
                Đợt {cert.periodNo}
              </DocField>
              <DocField
                label="Nhãn kỳ"
                readOnly={!canEdit}
                htmlFor={canEdit ? "cert-period-label" : undefined}
                hint={canEdit ? "Lưu cùng lúc khi bấm Lưu KL" : undefined}
              >
                {canEdit ? (
                  <input
                    id="cert-period-label"
                    value={periodLabel}
                    onChange={(e) => setPeriodLabel(e.target.value)}
                    placeholder="VD: Tháng 9/2026"
                    className="w-full min-h-10 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-base sm:text-sm text-zinc-100 outline-none focus:border-emerald-500 transition"
                  />
                ) : (
                  (cert.periodLabel ?? "—")
                )}
              </DocField>
              <DocField label="Người lập" readOnly>
                {cert.createdByName ?? "—"}
              </DocField>
            </div>
            <div className="space-y-3">
              <DocField label="Ngày trình" readOnly>
                {fmtLuc(cert.submittedAt)}
              </DocField>
              <DocField label="Ngày quyết định" readOnly>
                {fmtLuc(cert.decidedAt)}
              </DocField>
              {cert.rejectReason && (
                <DocField label="Lý do từ chối" readOnly>
                  <span className="text-rose-300">{cert.rejectReason}</span>
                </DocField>
              )}
            </div>
          </DocFieldGroup>
        </Card>
      </Section>

      {vuotHopDong.length > 0 && (
        <div className="bento-card border-rose-900/60 bg-rose-950/20 px-4 py-3 text-xs text-rose-300 space-y-1.5">
          <p className="font-semibold">
            {vuotHopDong.length} dòng có khối lượng luỹ kế VƯỢT khối lượng hợp đồng
          </p>
          <ul className="space-y-1">
            {vuotHopDong.map((d) => (
              <li key={d.boqItemId} className="flex gap-2">
                <span className="font-mono shrink-0">{d.code}</span>
                <span className="truncate flex-1">{d.name}</span>
                <span className="font-mono tabular-nums shrink-0">
                  {d.qtyCumulative}/{d.qtyContract} {d.unit}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-rose-300">
            Chỉ là cảnh báo — đợt vẫn lưu được, vì thi công vượt khối lượng trong khi phụ lục/VO còn
            chờ duyệt là tình huống thật. Đối chiếu phụ lục trước khi trình duyệt.
          </p>
        </div>
      )}

      {/* Nói rõ khối lượng gợi ý đến từ đâu: người duyệt IPC rất dễ mặc định đây là khối
          lượng đã nghiệm thu, trong khi nó suy ra từ tiến độ tick trên lưới. */}
      <p className="text-[11px] text-zinc-500">
        KL đợt này được gợi ý từ <strong className="text-zinc-400">tiến độ thi công</strong> (tỷ lệ
        ô đã tick × tỷ trọng BOQ), trừ luỹ kế các đợt đã duyệt — không phải khối lượng lấy từ biên
        bản nghiệm thu. Đối chiếu với hồ sơ nghiệm thu trước khi trình duyệt.
      </p>

      <Card tone="raised" pad="none" className="overflow-hidden">
        <div
          className="overflow-auto max-h-[60vh]"
          tabIndex={0}
          role="region"
          aria-label="Bảng dòng khối lượng của đợt"
        >
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="text-xs text-zinc-400 border-b border-zinc-800">
                <th className="sticky top-0 left-0 z-20 bg-zinc-900 text-right p-2 w-12">STT</th>
                <th className="sticky top-0 left-12 z-20 bg-zinc-900 text-left p-2">MÃ</th>
                <th className="sticky top-0 z-10 bg-zinc-900 text-left p-2">TÊN CÔNG TÁC</th>
                <th className="sticky top-0 z-10 bg-zinc-900 text-right p-2">KL HĐ</th>
                <th className="sticky top-0 z-10 bg-zinc-900 text-right p-2">ĐƠN GIÁ</th>
                <th className="sticky top-0 z-10 bg-zinc-900 text-right p-2">KL ĐỢT NÀY</th>
                <th className="sticky top-0 z-10 bg-zinc-900 text-right p-2">LUỸ KẾ</th>
                <th className="sticky top-0 z-10 bg-zinc-900 text-right p-2">THÀNH TIỀN</th>
              </tr>
            </thead>
            <tbody>
              {cert.items.map((it, i) => (
                <tr key={it.id} className="border-b border-zinc-800/60 last:border-0">
                  <td className="sticky left-0 z-10 bg-zinc-900 p-2 text-right tabular-nums text-zinc-400">
                    {i + 1}
                  </td>
                  <td className="sticky left-12 z-10 bg-zinc-900 p-2 font-mono text-xs">
                    {it.boqCode}
                  </td>
                  <td className="p-2">
                    {it.boqName} <span className="text-zinc-400">({it.boqUnit})</span>
                  </td>
                  <td className="p-2 text-right tabular-nums text-zinc-400">{it.boqQtyContract}</td>
                  <td className="p-2 text-right tabular-nums">
                    <MaskedValue value={it.unitPrice} format={fmtVND} />
                  </td>
                  <td className="p-2 text-right">
                    {canEdit ? (
                      <input
                        type="number"
                        value={qtys[it.id] ?? ""}
                        onChange={(e) => setQty(it.id, e.target.value)}
                        aria-label={`KL đợt này dòng ${it.boqCode}`}
                        min={0}
                        className="w-24 min-h-10 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-base sm:text-sm text-zinc-100 text-right tabular-nums outline-none focus:border-emerald-500 transition"
                      />
                    ) : (
                      <span className="tabular-nums">{it.qtyPeriod}</span>
                    )}
                  </td>
                  <td className="p-2 text-right tabular-nums">{it.qtyCumulative}</td>
                  <td className="p-2 text-right tabular-nums">
                    <MaskedValue
                      value={mMul(Number(qtys[it.id]) || 0, it.unitPrice)}
                      format={fmtVND}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {canEdit && (
          <p className="hidden md:block px-3 py-2 text-xs text-zinc-500 border-t border-zinc-800">
            Enter/Tab chuyển ô · Ctrl+S lưu khối lượng
          </p>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.1fr] gap-4 items-start">
        <Card tone="sunken" pad="md" className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-300">
            Trạng thái &amp; lịch sử duyệt
          </h3>
          <dl className="space-y-1.5 text-xs">
            <div className="flex items-center justify-between gap-2">
              <dt className="text-zinc-400">Trạng thái</dt>
              <dd>
                <Chip tone={STATUS_TONE[cert.status]}>{STATUS_LABEL[cert.status]}</Chip>
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-zinc-400">Người lập</dt>
              <dd className="text-zinc-200">{cert.createdByName ?? "—"}</dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-zinc-400">Lập lúc</dt>
              <dd className="text-zinc-200">{fmtLuc(cert.createdAt)}</dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-zinc-400">Trình lúc</dt>
              <dd className="text-zinc-200">{fmtLuc(cert.submittedAt)}</dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-zinc-400">Quyết định lúc</dt>
              <dd className="text-zinc-200">{fmtLuc(cert.decidedAt)}</dd>
            </div>
          </dl>
          {/* Lịch sử duyệt engine (M46 PR2) — ẩn hoàn toàn khi chưa có flow cấu hình cho
              "payment_cert" (approvalStatus null), giữ UI y hệt trước đây. */}
          {approvalStatus && approvalStatus.actions.length > 0 && (
            <ul className="space-y-1.5 border-t border-zinc-800 pt-3">
              {approvalStatus.actions.map((a) => (
                <li key={a.seq} className="text-xs text-zinc-300 flex flex-wrap gap-x-1.5">
                  <span className="font-medium">{a.actorName ?? `#${a.actorId}`}</span>
                  <span className={a.decision === "approve" ? "text-emerald-300" : "text-rose-300"}>
                    {a.decision === "approve" ? "đã duyệt" : "đã từ chối"}
                  </span>
                  <span className="text-zinc-500">bước {a.seq}</span>
                  {a.note && <span className="text-zinc-400">— {a.note}</span>}
                  <span className="text-zinc-500">({a.at})</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card tone="raised" pad="md" className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-300">
            Tổng hợp giá trị
          </h3>
          {loiChiTiet ? (
            <p role="alert" className="text-xs text-rose-300">
              {loiChiTiet}
            </p>
          ) : dangTaiChiTiet && !totals ? (
            <div className="space-y-2">
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-8 w-1/2" />
            </div>
          ) : (
            <DocTotals
              rows={totalRows}
              total={{
                label: "Đề nghị thanh toán",
                value: <TienDot value={totals?.approvedValue} />,
              }}
            />
          )}
          {ctrl.dirty && (
            <p className="text-[11px] text-zinc-400 border-t border-zinc-800 pt-2">
              Tạm tính theo KL đang nhập: <MaskedValue value={tamTinh} format={fmtVND} /> — số trên
              là của lần lưu gần nhất, bấm Lưu KL để cập nhật.
            </p>
          )}
        </Card>
      </div>

      {/* M128: đợt đã duyệt chỉ đổi được qua chứng từ điều chỉnh/huỷ hiệu lực. */}
      {cert.status === "approved" && (
        <DieuChinhDot
          certId={cert.id}
          maDot={cert.code}
          dongBoq={cert.items.map((it) => ({
            boqItemId: it.boqItemId,
            boqCode: it.boqCode,
            boqName: it.boqName,
            boqUnit: it.boqUnit,
          }))}
          giaTriDuyet={totals?.approvedValue ?? null}
          tomTat={ctrl.adjustmentsSummary}
          canManage={ctrl.canManage}
          meId={ctrl.meId}
          onXong={ctrl.refresh}
        />
      )}
    </div>
  );
}
