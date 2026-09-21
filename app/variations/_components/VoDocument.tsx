"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  FileText,
  ListChecks,
  Lock,
  Paperclip,
  Send,
  X,
  XCircle,
} from "lucide-react";
import MaskedValue from "@/app/components/MaskedValue";
import { mMul, mSumBy } from "@/app/lib/masked";
import { appAlert, appConfirm } from "@/app/components/dialogs";
import { showToast } from "@/app/components/Toast";
import EmptyState from "@/app/components/EmptyState";
import type { Me } from "@/app/lib/me";
import {
  Button,
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

// Khối "chứng từ" của một phát sinh/VO — M126, bám mẫu `CertDocument` của M124. Tách ra
// từ hộp thoại chi tiết VO cũ trong `app/variations/page.tsx`: cùng dữ liệu, cùng các hàm
// gọi API, nhưng hiển thị TOÀN TRANG ở cột phải (master–detail) thay vì hộp thoại max-w-xl
// chật với 3 tab. Lưới khối lượng nhờ đó đủ chỗ hiện cả KL đề xuất, KL duyệt và thành tiền.

export type VoReason = "design_change" | "client_request" | "site_condition" | "other";
export type VoStatus =
  "draft" | "submitted" | "approved" | "partially_approved" | "rejected" | "contract_added";

export const REASON_LABEL: Record<VoReason, string> = {
  design_change: "Thay đổi thiết kế",
  client_request: "Yêu cầu CĐT",
  site_condition: "Điều kiện hiện trường",
  other: "Khác",
};

export const STATUS_LABEL: Record<VoStatus, string> = {
  draft: "Nháp",
  submitted: "Đã trình",
  approved: "Được duyệt",
  partially_approved: "Duyệt một phần",
  rejected: "Từ chối",
  contract_added: "Đã vào phụ lục HĐ",
};

/** Màu chip trạng thái — dùng chung cho cả danh sách trái và chứng từ phải. */
export const STATUS_TONE: Record<VoStatus, ChipTone> = {
  draft: "neutral",
  submitted: "warning",
  approved: "success",
  partially_approved: "info",
  rejected: "danger",
  contract_added: "success",
};

export type VoLine = {
  id: number;
  code: string;
  name: string;
  unit: string;
  qtyProposed: number;
  qtyApproved: number | null;
  unitPrice: number;
};

export type Vo = {
  id: number;
  code: string;
  title: string;
  reason: VoReason;
  description: string | null;
  systemId: number | null;
  systemCode: string | null;
  systemName: string | null;
  systemColor: string | null;
  contractId: number | null;
  contractCode: string | null;
  status: VoStatus;
  submittedAt: string | null;
  decidedAt: string | null;
  createdBy: number | null;
  createdByName: string | null;
  createdAt: string;
  proposedValue: number;
  approvedValue: number;
  lines: VoLine[];
};

export type SystemOption = { id: number; code: string; name: string };
export type Contract = { id: number; code: string; title: string; kind: string };

export type VoDocument = {
  id: number;
  originalName: string | null;
  caption: string | null;
  uploadedBy: number | null;
  sha256: string | null;
};

export function fmtVND(n: number) {
  if (!n) return "—";
  return Math.round(n).toLocaleString("vi-VN") + " đ";
}

/** Tiền cho chuỗi thuần (hộp thoại xác nhận) — giá trị bị che hiện "•••" như MaskedValue. */
function fmtVNDText(n: number | null) {
  return n == null || !Number.isFinite(n) ? "•••" : fmtVND(n);
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

const INPUT_CLS =
  "bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-base sm:text-sm text-zinc-100 outline-none focus:border-emerald-500 transition";

export type VoDocumentCtrl = {
  vo: Vo | null;
  me: Me | null;
  contracts: Contract[];
  isAdminOrPm: boolean;
  busy: boolean;
  uploading: boolean;
  /** Còn ô "KL duyệt" khác số đề xuất (chưa gửi quyết định). */
  dirty: boolean;
  documents: VoDocument[];
  approvals: Record<number, string>;
  setApproval: (lineId: number, value: string) => void;
  approvalStatus: EntityApprovalStatus | null;
  canEditMeta: boolean;
  canSubmit: boolean;
  canDecide: boolean;
  canContractAdd: boolean;
  /** KL duyệt đang hiển thị của 1 dòng (ô nhập khi đang quyết định, số đã chốt khi đã xong). */
  klDuyet: (line: VoLine) => number;
  /** Giá trị duyệt hiển thị — tạm tính theo ô nhập khi đang quyết định, số của API khi đã chốt. */
  giaTriDuyet: number | null;
  addendaCode: string;
  setAddendaCode: (value: string) => void;
  addendaContractId: number | "";
  setAddendaContractId: (value: number | "") => void;
  submitVo: () => Promise<void>;
  decide: (decision: "approved" | "partially_approved" | "rejected") => Promise<void>;
  contractAdd: () => Promise<void>;
  uploadFile: (file: File) => Promise<void>;
  deleteFile: (id: number) => Promise<void>;
  close: () => void;
};

// Toàn bộ state + lời gọi API của chứng từ gom vào một hook để thanh công cụ TRÊN và
// thanh hành động ĐÁY (render bởi AppHeader ở tầng trang) dùng chung đúng một bộ hàm.
export function useVoDocument({
  vo,
  me,
  contracts,
  isAdminOrPm,
  onSaved,
  onClose,
}: {
  vo: Vo | null;
  me: Me | null;
  contracts: Contract[];
  isAdminOrPm: boolean;
  onSaved: () => void | Promise<void>;
  onClose: () => void;
}): VoDocumentCtrl {
  const [documents, setDocuments] = useState<VoDocument[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [approvals, setApprovals] = useState<Record<number, string>>({});
  const [addendaCode, setAddendaCode] = useState("");
  const [addendaContractId, setAddendaContractId] = useState<number | "">("");
  // Trạng thái duyệt engine (M46 PR2) — null khi chưa có flow cấu hình cho "variation",
  // giữ UI y hệt trước (không hiện badge/lịch sử) đúng nguyên tắc "dormant" của M46.
  const [approvalStatus, setApprovalStatus] = useState<EntityApprovalStatus | null>(null);

  const voId = vo?.id ?? null;

  const loadDocs = useCallback(() => {
    if (voId == null) return;
    fetch(`/api/variations/${voId}/documents`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setDocuments(j?.documents ?? []));
  }, [voId]);

  // Phụ thuộc vào chính object `vo` nên sau mỗi lần trình/quyết định (danh sách nạp lại)
  // ô nhập + trạng thái duyệt cũng được lấy lại, không hiển thị số cũ.
  useEffect(() => {
    if (!vo) {
      setDocuments([]);
      setApprovals({});
      setApprovalStatus(null);
      return;
    }
    setApprovals(Object.fromEntries(vo.lines.map((l) => [l.id, String(l.qtyProposed)])));
    loadDocs();
    let huy = false;
    fetch(`/api/variations/${vo.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!huy) setApprovalStatus(j?.approvalStatus ?? null);
      });
    return () => {
      huy = true;
    };
  }, [vo, loadDocs]);

  // Đổi chứng từ → xoá ô "đưa vào phụ lục" đang gõ dở của VO trước.
  useEffect(() => {
    setAddendaCode("");
    setAddendaContractId("");
  }, [voId]);

  const canEditMeta =
    !!vo &&
    ((vo.status === "draft" && (vo.createdBy === me?.id || isAdminOrPm)) ||
      (vo.status === "submitted" && isAdminOrPm));
  const canSubmit = !!vo && vo.status === "draft" && isAdminOrPm;
  const canDecide = !!vo && vo.status === "submitted" && isAdminOrPm;
  const canContractAdd =
    !!vo && (vo.status === "approved" || vo.status === "partially_approved") && isAdminOrPm;

  const dirty = useMemo(
    () =>
      !!vo &&
      canDecide &&
      vo.lines.some((l) => (Number(approvals[l.id]) || 0) !== Number(l.qtyProposed)),
    [vo, canDecide, approvals],
  );

  const klDuyet = useCallback(
    (line: VoLine) =>
      canDecide ? Number(approvals[line.id]) || 0 : (line.qtyApproved ?? line.qtyProposed),
    [canDecide, approvals],
  );

  // M50 PR2: unitPrice/approvedValue có thể bị che (null) — dùng mMul/mSumBy để tổng tạm
  // tính cũng "bị che" (null) thay vì ngầm thành 0.
  const giaTriDuyet = useMemo(() => {
    if (!vo) return null;
    if (!canDecide) return vo.approvedValue;
    return mSumBy(vo.lines, (l) => mMul(Number(approvals[l.id]) || 0, l.unitPrice));
  }, [vo, canDecide, approvals]);

  const setApproval = useCallback((lineId: number, value: string) => {
    setApprovals((prev) => ({ ...prev, [lineId]: value }));
  }, []);

  const submitVo = useCallback(async () => {
    if (!vo) return;
    if (!(await appConfirm(`Trình phát sinh ${vo.code} lên CĐT/TVGS?`))) return;
    setBusy(true);
    // try/catch/finally: mất sóng ngoài công trường không được để nút kẹt
    // "Đang lưu..." mà không báo gì (audit 2026-09-05).
    let res: Response;
    try {
      res = await fetch(`/api/variations/${vo.id}/submit`, { method: "POST" });
    } catch {
      showToast("Mất kết nối — chưa lưu được, thử lại khi có mạng", "error");
      return;
    } finally {
      setBusy(false);
    }
    if (!res.ok) {
      showToast((await res.json().catch(() => null))?.error ?? "Trình thất bại", "error");
      return;
    }
    await onSaved();
  }, [vo, onSaved]);

  const decide = useCallback(
    async (decision: "approved" | "partially_approved" | "rejected") => {
      if (!vo) return;
      // Tiền: mMul/mSumBy để giá trị dẫn xuất từ đơn giá bị che cũng "bị che", không ngầm
      // thành 0 trong câu hỏi xác nhận (M50 PR2).
      const value =
        decision === "rejected"
          ? 0
          : decision === "approved"
            ? mSumBy(vo.lines, (l) => mMul(l.qtyProposed, l.unitPrice))
            : mSumBy(vo.lines, (l) => mMul(Number(approvals[l.id]) || 0, l.unitPrice));
      const label =
        decision === "rejected"
          ? `Từ chối phát sinh ${vo.code}?`
          : `Duyệt phát sinh ${vo.code} — giá trị ${fmtVNDText(value)}?`;
      if (!(await appConfirm(label, { danger: decision === "rejected" }))) return;

      setBusy(true);
      const body: { decision: string; lines?: { id: number; qtyApproved: number }[] } = {
        decision,
      };
      if (decision === "partially_approved")
        body.lines = vo.lines.map((l) => ({ id: l.id, qtyApproved: Number(approvals[l.id]) || 0 }));
      // try/catch/finally: mất sóng ngoài công trường không được để nút kẹt
      // "Đang lưu..." mà không báo gì (audit 2026-09-05).
      let res: Response;
      try {
        res = await fetch(`/api/variations/${vo.id}/decide`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } catch {
        showToast("Mất kết nối — chưa lưu được, thử lại khi có mạng", "error");
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
    [vo, approvals, onSaved],
  );

  const contractAdd = useCallback(async () => {
    if (!vo || !addendaContractId || !addendaCode.trim()) return;
    setBusy(true);
    // try/catch/finally: mất sóng ngoài công trường không được để nút kẹt
    // "Đang lưu..." mà không báo gì (audit 2026-09-05).
    let res: Response;
    try {
      res = await fetch(`/api/variations/${vo.id}/contract-add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contractId: addendaContractId, addendaCode: addendaCode.trim() }),
      });
    } catch {
      showToast("Mất kết nối — chưa lưu được, thử lại khi có mạng", "error");
      return;
    } finally {
      setBusy(false);
    }
    if (!res.ok) {
      showToast((await res.json().catch(() => null))?.error ?? "Thất bại", "error");
      return;
    }
    showToast(`Đã đưa ${vo.code} vào phụ lục hợp đồng`, "success");
    await onSaved();
  }, [vo, addendaContractId, addendaCode, onSaved]);

  const uploadFile = useCallback(
    async (file: File) => {
      if (!vo) return;
      setUploading(true);
      try {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch(`/api/variations/${vo.id}/documents`, {
          method: "POST",
          body: form,
        });
        if (!res.ok) {
          showToast((await res.json().catch(() => null))?.error ?? "Upload thất bại", "error");
          return;
        }
        loadDocs();
      } catch {
        showToast("Mất kết nối — kiểm tra mạng rồi thử lại", "error");
      } finally {
        setUploading(false);
      }
    },
    [vo, loadDocs],
  );

  const deleteFile = useCallback(
    async (id: number) => {
      if (!(await appConfirm("Xoá file đính kèm này?", { danger: true, confirmLabel: "Xoá" })))
        return;
      const res = await fetch(`/api/vo-documents/${id}`, { method: "DELETE" });
      if (!res.ok) {
        appAlert((await res.json().catch(() => null))?.error ?? "Xoá thất bại");
        return;
      }
      loadDocs();
    },
    [loadDocs],
  );

  // Phím tắt (M124 FR7): Ctrl/⌘+S = "Duyệt một phần" (thao tác duy nhất ghi số đang nhập),
  // Esc đóng chứng từ. Bỏ qua khi đang mở hộp thoại xác nhận (appConfirm tự xử lý Esc của
  // nó) để không đóng nhầm 2 lớp.
  //
  // Pattern "latest ref": handler đọc state mới nhất qua ref thay vì qua closure — effect
  // chỉ gắn listener MỘT LẦN thay vì gỡ/gắn lại mỗi lần `decide` đổi (đổi mỗi phím gõ vì
  // phụ thuộc `approvals`), tránh mất/nhân đôi phím tắt lúc đang gõ dở.
  const latestRef = useRef({ vo, canDecide, busy, dirty, decide, onClose });
  latestRef.current = { vo, canDecide, busy, dirty, decide, onClose };

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const { vo, canDecide, busy, dirty, decide, onClose } = latestRef.current;
      if (!vo) return;
      // Ctrl/⌘+S phải luôn chặn hành vi mặc định của trình duyệt (mở hộp "Lưu trang"),
      // kể cả lúc không có gì để gửi — nếu return sớm trước preventDefault, trình duyệt
      // vẫn mở hộp thoại lưu file.
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (!canDecide || busy || !dirty) return;
        void decide("partially_approved");
        return;
      }
      if (e.key === "Escape") {
        if (document.querySelector('[role="dialog"]')) return;
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
            if (await appConfirm("Còn khối lượng duyệt đang nhập — đóng và bỏ thay đổi?"))
              onClose();
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
    vo,
    me,
    contracts,
    isAdminOrPm,
    busy,
    uploading,
    dirty,
    documents,
    approvals,
    setApproval,
    approvalStatus,
    canEditMeta,
    canSubmit,
    canDecide,
    canContractAdd,
    klDuyet,
    giaTriDuyet,
    addendaCode,
    setAddendaCode,
    addendaContractId,
    setAddendaContractId,
    submitVo,
    decide,
    contractAdd,
    uploadFile,
    deleteFile,
    close: onClose,
  };
}

/** Bộ nút hành động của chứng từ — dùng chung cho thanh công cụ trên và thanh đáy. */
function VoActions({ ctrl }: { ctrl: VoDocumentCtrl }) {
  const { vo, busy, dirty, canSubmit, canDecide } = ctrl;
  if (!vo) return null;
  return (
    <>
      {canSubmit && (
        <Button icon={Send} variant="primary" disabled={busy} onClick={() => void ctrl.submitVo()}>
          Trình lên CĐT/TVGS
        </Button>
      )}
      {canDecide && (
        <>
          <Button
            icon={Check}
            variant="primary"
            disabled={busy}
            onClick={() => void ctrl.decide("approved")}
          >
            Duyệt toàn bộ
          </Button>
          <Button
            icon={ListChecks}
            variant="secondary"
            disabled={busy}
            onClick={() => void ctrl.decide("partially_approved")}
          >
            Duyệt một phần
            <Kbd className="ml-1.5">Ctrl S</Kbd>
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
      {/* Nhắc nhẹ khi đã sửa ô KL duyệt: "Duyệt toàn bộ" bỏ qua số đang nhập. */}
      {canDecide && dirty && (
        <span className="hidden lg:inline text-[11px] text-zinc-400 whitespace-nowrap">
          Đã sửa KL duyệt — dùng “Duyệt một phần”
        </span>
      )}
    </>
  );
}

/**
 * Thanh hành động đáy — truyền qua `bottomActions` của `AppHeader`. Hiện ở MỌI breakpoint
 * khi đang mở một phát sinh (đáy ưu tiên thao tác trên điện thoại).
 */
export function VoBottomActions({ ctrl }: { ctrl: VoDocumentCtrl }) {
  if (!ctrl.vo) return null;
  return (
    <>
      <VoActions ctrl={ctrl} />
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

export type VoNav = {
  /** Vị trí phát sinh đang mở trong danh sách (0-based) và tổng số phát sinh. */
  index: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  /** Quay về danh sách (dưới lg danh sách bị ẩn khi đang mở chứng từ). */
  onBackToList: () => void;
};

export default function VoDocumentView({ ctrl, nav }: { ctrl: VoDocumentCtrl; nav: VoNav }) {
  const {
    vo,
    me,
    contracts,
    isAdminOrPm,
    busy,
    uploading,
    dirty,
    documents,
    approvals,
    setApproval,
    approvalStatus,
    canEditMeta,
    canDecide,
    canContractAdd,
    klDuyet,
    giaTriDuyet,
  } = ctrl;
  if (!vo) return null;

  const totalRows: DocTotalRow[] = [
    {
      label: "Giá trị đề xuất",
      value: <MaskedValue value={vo.proposedValue} format={fmtVND} />,
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
                aria-label="Phát sinh trước"
                disabled={nav.index <= 0}
                onClick={nav.onPrev}
              />
              <span className="text-xs text-zinc-400 tabular-nums whitespace-nowrap">
                {nav.index + 1} / {nav.total}
              </span>
              <Button
                size="icon"
                variant="ghost"
                icon={ChevronRight}
                aria-label="Phát sinh sau"
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
        <VoActions ctrl={ctrl} />
      </DocToolbar>

      <header className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-mono text-lg font-semibold text-zinc-100">{vo.code}</h2>
          <Chip tone={STATUS_TONE[vo.status]}>{STATUS_LABEL[vo.status]}</Chip>
          {approvalStatus?.status === "pending" && (
            <Chip tone="warning">
              Chờ duyệt (bước {approvalStatus.currentSeq}/{approvalStatus.totalSteps})
            </Chip>
          )}
        </div>
        <p className="text-sm text-zinc-300">{vo.title}</p>
        <p className="text-xs text-zinc-400">
          {REASON_LABEL[vo.reason]} · {vo.createdByName ?? "—"} · {fmtLuc(vo.createdAt)}
        </p>
      </header>

      <Section title="Thông tin phát sinh" icon={FileText}>
        <Card tone="raised" pad="md">
          <DocFieldGroup>
            <div className="space-y-3">
              <DocField label="Mã" readOnly>
                <span className="font-mono">{vo.code}</span>
              </DocField>
              <DocField label="Tên phát sinh" readOnly>
                {vo.title}
              </DocField>
              <DocField label="Lý do" readOnly>
                {REASON_LABEL[vo.reason]}
              </DocField>
              <DocField label="Hệ" readOnly>
                {vo.systemName ? (
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className={`w-2 h-2 rounded-full bg-${vo.systemColor}-400`}
                      aria-hidden="true"
                    />
                    {vo.systemName}
                  </span>
                ) : (
                  "—"
                )}
              </DocField>
              <DocField label="Mô tả" readOnly>
                {vo.description || "—"}
              </DocField>
            </div>
            <div className="space-y-3">
              <DocField label="Người tạo" readOnly>
                {vo.createdByName ?? "—"}
              </DocField>
              <DocField label="Ngày trình" readOnly>
                {fmtLuc(vo.submittedAt)}
              </DocField>
              <DocField label="Ngày quyết định" readOnly>
                {fmtLuc(vo.decidedAt)}
              </DocField>
              <DocField label="Phụ lục HĐ" readOnly>
                {vo.contractCode ? <span className="font-mono">{vo.contractCode}</span> : "—"}
              </DocField>
            </div>
          </DocFieldGroup>
          {!canEditMeta && vo.status !== "draft" && (
            <p className="mt-3 text-xs text-zinc-500">
              Chỉ Admin/PM sửa được thông tin ở giai đoạn này.
            </p>
          )}
        </Card>
      </Section>

      <Card tone="raised" pad="none" className="overflow-hidden">
        <div
          className="overflow-auto max-h-[60vh]"
          tabIndex={0}
          role="region"
          aria-label="Bảng dòng khối lượng của phát sinh"
        >
          <table className="w-full text-sm min-w-[820px]">
            <thead>
              <tr className="text-xs text-zinc-400 border-b border-zinc-800">
                <th className="sticky top-0 left-0 z-20 bg-zinc-900 text-right p-2 w-12">STT</th>
                <th className="sticky top-0 left-12 z-20 bg-zinc-900 text-left p-2">MÃ</th>
                <th className="sticky top-0 z-10 bg-zinc-900 text-left p-2">TÊN CÔNG TÁC</th>
                <th className="sticky top-0 z-10 bg-zinc-900 text-left p-2">ĐVT</th>
                <th className="sticky top-0 z-10 bg-zinc-900 text-right p-2">KL ĐỀ XUẤT</th>
                <th className="sticky top-0 z-10 bg-zinc-900 text-right p-2">KL DUYỆT</th>
                <th className="sticky top-0 z-10 bg-zinc-900 text-right p-2">ĐƠN GIÁ</th>
                <th className="sticky top-0 z-10 bg-zinc-900 text-right p-2">TT ĐỀ XUẤT</th>
                <th className="sticky top-0 z-10 bg-zinc-900 text-right p-2">TT DUYỆT</th>
              </tr>
            </thead>
            <tbody>
              {vo.lines.map((l, i) => (
                <tr key={l.id} className="border-b border-zinc-800/60 last:border-0">
                  <td className="sticky left-0 z-10 bg-zinc-900 p-2 text-right tabular-nums text-zinc-400">
                    {i + 1}
                  </td>
                  <td className="sticky left-12 z-10 bg-zinc-900 p-2 font-mono text-xs">
                    {l.code}
                  </td>
                  <td className="p-2">{l.name}</td>
                  <td className="p-2 text-zinc-400">{l.unit}</td>
                  <td className="p-2 text-right tabular-nums">{l.qtyProposed}</td>
                  <td className="p-2 text-right">
                    {canDecide ? (
                      <input
                        type="number"
                        value={approvals[l.id] ?? ""}
                        onChange={(e) => setApproval(l.id, e.target.value)}
                        aria-label={`Khối lượng duyệt dòng ${l.code}`}
                        min={0}
                        max={l.qtyProposed}
                        className={`w-24 min-h-10 text-right tabular-nums ${INPUT_CLS}`}
                      />
                    ) : (
                      <span className="tabular-nums">{l.qtyApproved ?? "—"}</span>
                    )}
                  </td>
                  <td className="p-2 text-right tabular-nums">
                    <MaskedValue value={l.unitPrice} format={fmtVND} />
                  </td>
                  <td className="p-2 text-right tabular-nums text-zinc-400">
                    <MaskedValue value={mMul(l.qtyProposed, l.unitPrice)} format={fmtVND} />
                  </td>
                  <td className="p-2 text-right tabular-nums">
                    {/* Chưa quyết định và không phải người duyệt → "—" cho khớp cột KL
                        duyệt, không hiện thành tiền suy từ khối lượng đề xuất. */}
                    {canDecide || l.qtyApproved != null ? (
                      <MaskedValue value={mMul(klDuyet(l), l.unitPrice)} format={fmtVND} />
                    ) : (
                      <span className="text-zinc-500">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {canDecide && (
          <p className="hidden md:block px-3 py-2 text-xs text-zinc-500 border-t border-zinc-800">
            Sửa ô “KL duyệt” rồi bấm “Duyệt một phần” (Ctrl+S) · “Duyệt toàn bộ” luôn duyệt đúng
            khối lượng đề xuất
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
                <Chip tone={STATUS_TONE[vo.status]}>{STATUS_LABEL[vo.status]}</Chip>
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-zinc-400">Người tạo</dt>
              <dd className="text-zinc-200">{vo.createdByName ?? "—"}</dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-zinc-400">Tạo lúc</dt>
              <dd className="text-zinc-200">{fmtLuc(vo.createdAt)}</dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-zinc-400">Trình lúc</dt>
              <dd className="text-zinc-200">{fmtLuc(vo.submittedAt)}</dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-zinc-400">Quyết định lúc</dt>
              <dd className="text-zinc-200">{fmtLuc(vo.decidedAt)}</dd>
            </div>
          </dl>
          {/* Lịch sử duyệt engine (M46 PR2) — ẩn hoàn toàn khi chưa có flow cấu hình
              cho "variation" (approvalStatus null), giữ UI y hệt trước đây. */}
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
          <DocTotals
            rows={totalRows}
            total={{
              label: canDecide ? "Giá trị duyệt (tạm tính)" : "Giá trị duyệt",
              value: <MaskedValue value={giaTriDuyet} format={fmtVND} />,
            }}
          />
          {canDecide && (
            <p className="text-[11px] text-zinc-400 border-t border-zinc-800 pt-2">
              {dirty
                ? "Tạm tính theo khối lượng đang nhập — bấm “Duyệt một phần” để chốt số này."
                : "Tạm tính theo khối lượng đề xuất — sửa ô “KL duyệt” để duyệt một phần."}
            </p>
          )}
        </Card>
      </div>

      {canContractAdd && (
        <Card tone="sunken" pad="md" className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-300">
            Đưa vào phụ lục hợp đồng
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={ctrl.addendaContractId}
              onChange={(e) =>
                ctrl.setAddendaContractId(e.target.value ? Number(e.target.value) : "")
              }
              aria-label="Chọn hợp đồng"
              className={`flex-1 min-w-[200px] min-h-10 px-3 ${INPUT_CLS}`}
            >
              <option value="">— Chọn hợp đồng —</option>
              {contracts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} — {c.title}
                </option>
              ))}
            </select>
            <input
              value={ctrl.addendaCode}
              onChange={(e) => ctrl.setAddendaCode(e.target.value)}
              placeholder="Mã phụ lục"
              aria-label="Mã phụ lục"
              className={`w-36 min-h-10 px-3 ${INPUT_CLS}`}
            />
            <Button
              variant="primary"
              disabled={busy || !ctrl.addendaContractId || !ctrl.addendaCode.trim()}
              onClick={() => void ctrl.contractAdd()}
            >
              Chốt
            </Button>
          </div>
        </Card>
      )}

      <Section title="Hồ sơ đính kèm" icon={Paperclip}>
        <Card tone="raised" pad="md" className="space-y-3">
          {documents.length ? (
            <ul className="space-y-1.5">
              {documents.map((d) => (
                <li key={d.id} className="flex items-center gap-2 text-sm">
                  <Paperclip className="w-3.5 h-3.5 text-zinc-500 shrink-0" aria-hidden="true" />
                  <a
                    href={`/api/vo-documents/${d.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 min-w-0 truncate text-sky-300 hover:underline"
                  >
                    {d.originalName ?? "File"}
                  </a>
                  {d.sha256 && (
                    <span
                      className="flex items-center gap-1 text-[10px] text-zinc-500 shrink-0"
                      title={`SHA-256: ${d.sha256}`}
                    >
                      <Lock className="w-3 h-3" aria-hidden="true" />
                      {d.sha256.slice(0, 8)}...
                    </span>
                  )}
                  {(d.uploadedBy === me?.id || isAdminOrPm) && (
                    <Button
                      size="icon"
                      variant="ghost"
                      icon={X}
                      aria-label={`Xoá file ${d.originalName ?? d.id}`}
                      onClick={() => void ctrl.deleteFile(d.id)}
                    />
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState message="Chưa có file đính kèm nào." compact />
          )}
          {canEditMeta && (
            <label className="inline-flex items-center gap-2 min-h-10 px-3.5 rounded-lg text-sm font-medium text-zinc-100 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 hover:border-zinc-600 cursor-pointer transition">
              <Paperclip className="w-4 h-4" aria-hidden="true" />
              {uploading ? "Đang tải lên…" : "Tải file lên"}
              <input
                type="file"
                accept="application/pdf,image/*"
                className="hidden"
                disabled={uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void ctrl.uploadFile(f);
                  e.target.value = "";
                }}
              />
            </label>
          )}
        </Card>
      </Section>
    </div>
  );
}
