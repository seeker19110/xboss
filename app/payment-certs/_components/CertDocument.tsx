"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  FileDown,
  FileSpreadsheet,
  FileText,
  Save,
  Send,
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
  rejectReason: string | null;
  createdByName: string | null;
  createdAt: string | null;
  items: CertItem[];
};

/** Dòng IPC có khối lượng luỹ kế vượt khối lượng hợp đồng (route trả kèm, chỉ để cảnh báo). */
export type DongVuot = {
  boqItemId: number;
  code: string;
  name: string;
  unit: string;
  qtyContract: number;
  qtyCumulative: number;
};

/** Tổng hợp tiền do API tính (SQL) — từng ô có thể bị che (null) khi thiếu viewPayments. */
export type CertTotalsView = {
  periodValue: number | null;
  cumulativeValue: number | null;
  advanceDeduct: number | null;
  retentionDeduct: number | null;
  approvedValue: number | null;
};

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
  /** Tạm tính theo KL đang nhập (chưa lưu) — chỉ để đối chiếu, không thay số của API. */
  tamTinh: number | null;
  saveItems: () => Promise<void>;
  submitCert: () => Promise<void>;
  decide: (decision: "approved" | "rejected") => Promise<void>;
  close: () => void;
};

// Toàn bộ state + lời gọi API của chứng từ gom vào một hook để thanh công cụ TRÊN và
// thanh hành động ĐÁY (render bởi AppHeader ở tầng trang) dùng chung đúng một bộ hàm.
export function useCertDocument({
  cert,
  canManage,
  canDecide,
  contractValue,
  onSaved,
  onClose,
}: {
  cert: Cert | null;
  canManage: boolean;
  canDecide: boolean;
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
  const [totals, setTotals] = useState<CertTotalsView | null>(null);

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
    if (id == null) {
      setApprovalStatus(null);
      setVuotHopDong([]);
      setTotals(null);
      return;
    }
    let huy = false;
    setDangTaiChiTiet(true);
    fetch(`/api/payment-certs/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (huy) return;
        setApprovalStatus(j?.approvalStatus ?? null);
        setVuotHopDong(j?.vuotHopDong ?? []);
        setTotals(j?.totals ?? null);
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

  const decide = useCallback(
    async (decision: "approved" | "rejected") => {
      if (!cert) return;
      let rejectReason: string | null = null;
      if (decision === "rejected") {
        rejectReason = await appPrompt("Lý do từ chối:");
        if (!rejectReason?.trim()) return;
      } else {
        // qty_cumulative của mỗi dòng trong đợt này đã là luỹ kế tính tới hết đợt này —
        // nếu duyệt, đây sẽ là luỹ kế mới của hợp đồng (thay cho luỹ kế đợt duyệt trước đó).
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
      }
      setBusy(true);
      // try/catch/finally: mất sóng ngoài công trường không được để nút kẹt
      // "Đang lưu..." mà không báo gì (audit 2026-09-05).
      let res: Response;
      try {
        res = await fetch(`/api/payment-certs/${cert.id}/decide`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision, rejectReason }),
        });
      } catch {
        appAlert("Mất kết nối — chưa lưu được, thử lại khi có mạng");
        return;
      } finally {
        setBusy(false);
      }
      if (!res.ok) {
        showToast((await res.json().catch(() => null))?.error ?? "Quyết định thất bại", "error");
        return;
      }
      await onSaved();
    },
    [cert, contractValue, onSaved],
  );

  // Phím tắt (FR7): Ctrl/⌘+S lưu KL, Esc đóng chứng từ. Bỏ qua khi đang mở hộp thoại
  // xác nhận (appConfirm/appPrompt tự xử lý Esc của nó) để không đóng nhầm 2 lớp.
  useEffect(() => {
    if (!cert) return;
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        if (!canEdit || busy) return;
        e.preventDefault();
        void saveItems();
        return;
      }
      if (e.key === "Escape") {
        if (document.querySelector('[role="dialog"]')) return;
        onClose();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cert, canEdit, busy, saveItems, onClose]);

  return {
    cert,
    canManage,
    canDecide,
    canEdit: !!canEdit,
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
    tamTinh,
    saveItems,
    submitCert,
    decide,
    close: onClose,
  };
}

/** Bộ nút hành động của chứng từ — dùng chung cho thanh công cụ trên và thanh đáy. */
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
    tamTinh,
    dangTaiChiTiet,
  } = ctrl;
  if (!cert) return null;

  const totalRows: DocTotalRow[] = [
    {
      label: "Giá trị đợt này",
      value: <MaskedValue value={totals?.periodValue ?? null} format={fmtVND} />,
    },
    {
      label: "Luỹ kế tới hết đợt",
      value: <MaskedValue value={totals?.cumulativeValue ?? null} format={fmtVND} />,
    },
    {
      label: "Khấu trừ tạm ứng",
      value: <MaskedValue value={totals?.advanceDeduct ?? null} format={fmtVND} />,
      negative: true,
    },
    {
      label: "Giữ lại bảo hành",
      value: <MaskedValue value={totals?.retentionDeduct ?? null} format={fmtVND} />,
      negative: true,
    },
  ];

  return (
    <div className="space-y-4">
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
        <div className="bento-card border-rose-900/60 bg-rose-950/20 px-4 py-3 text-xs text-rose-200 space-y-1.5">
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
          <p className="text-rose-300/80">
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

      <div className="grid lg:grid-cols-[1fr_1.1fr] gap-4 items-start">
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
          {dangTaiChiTiet && !totals ? (
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
                value: <MaskedValue value={totals?.approvedValue ?? null} format={fmtVND} />,
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
    </div>
  );
}
