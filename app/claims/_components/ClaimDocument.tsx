"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  FileText,
  Gavel,
  Lock,
  Paperclip,
  X,
  XCircle,
} from "lucide-react";
import MaskedValue from "@/app/components/MaskedValue";
import { mSub } from "@/app/lib/masked";
import { appAlert, appConfirm } from "@/app/components/dialogs";
import { showToast } from "@/app/components/Toast";
import EmptyState from "@/app/components/EmptyState";
import {
  Button,
  buttonClass,
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

// Khối "chứng từ" của một claim (M126) — tách ra từ hộp thoại chi tiết cũ trong
// `app/claims/page.tsx`: cùng dữ liệu, cùng các hàm gọi API, nhưng hiển thị TOÀN TRANG ở
// cột phải (master–detail) thay vì Modal max-w-xl chật. Chuỗi `appPrompt` hỏi giá trị chốt
// → ghi chú (3 hộp thoại liên tiếp, không xem lại được) đổi thành khối "Quyết định" nhập
// thẳng trên chứng từ, nhìn thấy giá trị đề xuất trong lúc gõ.

export type ClaimKind = "cost" | "eot";
export type ClaimStatus = "notice" | "quantified" | "negotiating" | "settled" | "rejected";

export const KIND_LABEL: Record<ClaimKind, string> = { cost: "Chi phí", eot: "Gia hạn (EOT)" };

export const STATUS_LABEL: Record<ClaimStatus, string> = {
  notice: "Đã thông báo",
  quantified: "Đã định lượng",
  negotiating: "Đang đàm phán",
  settled: "Đã chốt",
  rejected: "Từ chối",
};

/** Màu chip trạng thái — dùng chung cho cả danh sách trái và chứng từ phải. */
export const STATUS_TONE: Record<ClaimStatus, ChipTone> = {
  notice: "warning",
  quantified: "warning",
  negotiating: "warning",
  settled: "success",
  rejected: "danger",
};

/** Claim còn mở (chưa có quyết định) — còn sửa/chốt/từ chối được. */
export const OPEN_STATUSES: ClaimStatus[] = ["notice", "quantified", "negotiating"];

export type Claim = {
  id: number;
  code: string;
  kind: ClaimKind;
  title: string;
  contractId: number | null;
  contractCode: string | null;
  voId: number | null;
  voCode: string | null;
  noticeDate: string;
  cause: string;
  amountRequested: number | null;
  daysRequested: number | null;
  amountSettled: number | null;
  daysSettled: number | null;
  status: ClaimStatus;
  settlementNote: string | null;
  settledByName: string | null;
  settledAt: string | null;
  createdByName: string | null;
  createdAt: string;
  documentCount: number;
  deletedAt: string | null;
};

export type ClaimDocumentFile = {
  id: number;
  title: string | null;
  originalName: string | null;
  uploadedBy: number | null;
  sha256: string | null;
};

export function fmtVND(n: number) {
  if (!n) return "—";
  return Math.round(n).toLocaleString("vi-VN") + " đ";
}

/** Chênh lệch tiền — luôn kèm dấu để đọc được hướng lệch mà không cần suy từ màu. */
function fmtChenhLech(n: number) {
  if (!n) return "0 đ";
  return (n > 0 ? "+" : "") + Math.round(n).toLocaleString("vi-VN") + " đ";
}

const soNgay = (n: number | null) => (n == null ? "—" : `${n} ngày`);

// Cột DATE của Postgres về đây vẫn là chuỗi 'YYYY-MM-DD' (parser riêng trong lib/db) —
// `noticeDate` thuộc loại này, không được gắn thêm giờ 00:00 giả.
function fmtLuc(s: string | null) {
  if (!s) return "—";
  const chiNgay = /^\d{4}-\d{2}-\d{2}$/.test(s);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return chiNgay
    ? d.toLocaleDateString("vi-VN")
    : d.toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" });
}

/** Ô nhập của chứng từ — `text-base sm:text-sm` để iOS không tự phóng to khi gõ. */
const O_NHAP =
  "w-full min-h-10 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-base sm:text-sm text-zinc-100 outline-none focus:border-emerald-500 transition";

export type ClaimDocumentCtrl = {
  claim: Claim | null;
  isAdminOrPm: boolean;
  /** Claim còn mở → còn chốt/từ chối/tải hồ sơ lên được. */
  isOpen: boolean;
  busy: boolean;
  /** Ô nhập của khối "Quyết định" (giá trị chốt / số ngày chốt / ghi chú). */
  giaTriChot: string;
  setGiaTriChot: (v: string) => void;
  soNgayChot: string;
  setSoNgayChot: (v: string) => void;
  ghiChu: string;
  setGhiChu: (v: string) => void;
  /** Khối quyết định đang hiện và ô chốt hợp lệ (Ctrl+S mới chạy). */
  coTheChot: boolean;
  documents: ClaimDocumentFile[];
  uploading: boolean;
  /** Người dùng hiện tại được xoá hồ sơ này không (người tải lên hoặc Admin/PM). */
  coTheXoaHoSo: (d: ClaimDocumentFile) => boolean;
  settle: () => Promise<void>;
  reject: () => Promise<void>;
  uploadFile: (file: File) => Promise<void>;
  deleteFile: (id: number) => Promise<void>;
  close: () => void;
};

// Toàn bộ state + lời gọi API của chứng từ gom vào một hook để thanh công cụ TRÊN, khối
// "Quyết định" giữa chứng từ và thanh hành động ĐÁY (render bởi AppHeader ở tầng trang)
// dùng chung đúng một bộ hàm.
export function useClaimDocument({
  claim,
  meId,
  isAdminOrPm,
  onSaved,
  onClose,
}: {
  claim: Claim | null;
  meId: number | null;
  isAdminOrPm: boolean;
  onSaved: () => void | Promise<void>;
  onClose: () => void;
}): ClaimDocumentCtrl {
  const [giaTriChot, setGiaTriChot] = useState("");
  const [soNgayChot, setSoNgayChot] = useState("");
  const [ghiChu, setGhiChu] = useState("");
  const [busy, setBusy] = useState(false);
  const [documents, setDocuments] = useState<ClaimDocumentFile[]>([]);
  const [uploading, setUploading] = useState(false);

  const claimId = claim?.id ?? null;
  const isOpen = !!claim && OPEN_STATUSES.includes(claim.status);

  // Đổi claim → nạp lại ô nhập theo số đề xuất (đúng giá trị mặc định mà appPrompt cũ gợi ý).
  // Chỉ phụ thuộc `claimId`: refresh danh sách sau khi lưu không được xoá chữ đang gõ dở.
  useEffect(() => {
    setGiaTriChot(claim?.amountRequested != null ? String(claim.amountRequested) : "");
    setSoNgayChot(claim?.daysRequested != null ? String(claim.daysRequested) : "");
    setGhiChu("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claimId]);

  const loadDocs = useCallback(() => {
    if (claimId == null) {
      setDocuments([]);
      return;
    }
    fetch(`/api/claims/${claimId}/documents`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setDocuments(j?.documents ?? []));
  }, [claimId]);

  useEffect(() => {
    loadDocs();
  }, [loadDocs]);

  const oChotHopLe = useMemo(() => {
    if (!claim) return false;
    const raw = claim.kind === "cost" ? giaTriChot : soNgayChot;
    if (!raw.trim()) return false;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0;
  }, [claim, giaTriChot, soNgayChot]);

  const coTheChot = isOpen && isAdminOrPm && oChotHopLe;

  const settle = useCallback(async () => {
    if (!claim || !isOpen || !isAdminOrPm) return;
    // Chặn gọi lặp khi cùng action render ở nhiều vị trí (toolbar/khối inline/thanh đáy)
    // và bị bấm rất nhanh 2 nơi trước khi React kịp re-render `disabled={busy}`.
    if (busy) return;
    if (!oChotHopLe) {
      showToast(
        claim.kind === "cost"
          ? "Nhập giá trị chốt trước khi chốt"
          : "Nhập số ngày chốt trước khi chốt",
        "error",
      );
      return;
    }
    setBusy(true);
    // try/catch/finally: mất sóng ngoài công trường không được để nút kẹt "Đang lưu…"
    // mà không báo gì (audit 2026-09-05).
    let res: Response;
    try {
      res = await fetch(`/api/claims/${claim.id}/settle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountSettled: claim.kind === "cost" ? Number(giaTriChot) : null,
          daysSettled: claim.kind === "eot" ? Number(soNgayChot) : null,
          settlementNote: ghiChu.trim() || null,
        }),
      });
    } catch {
      appAlert("Mất kết nối — chưa lưu được, thử lại khi có mạng");
      return;
    } finally {
      setBusy(false);
    }
    if (!res.ok) {
      showToast((await res.json().catch(() => null))?.error ?? "Chốt claim thất bại", "error");
      return;
    }
    showToast(`Đã chốt claim ${claim.code}`, "success");
    await onSaved();
  }, [claim, isOpen, isAdminOrPm, busy, oChotHopLe, giaTriChot, soNgayChot, ghiChu, onSaved]);

  const reject = useCallback(async () => {
    if (!claim || !isOpen || !isAdminOrPm) return;
    // Chặn gọi lặp khi cùng action render ở nhiều vị trí (toolbar/khối inline/thanh đáy)
    // và bị bấm rất nhanh 2 nơi trước khi React kịp re-render `disabled={busy}`.
    if (busy) return;
    // Route trả 422 khi thiếu lý do — chặn sớm ở đây kèm đúng câu nhắc của server.
    if (!ghiChu.trim()) {
      showToast("Từ chối claim cần ghi rõ lý do — nhập vào ô Ghi chú", "error");
      return;
    }
    if (!(await appConfirm(`Từ chối claim ${claim.code}?`, { danger: true }))) return;
    setBusy(true);
    let res: Response;
    try {
      res = await fetch(`/api/claims/${claim.id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settlementNote: ghiChu.trim() }),
      });
    } catch {
      appAlert("Mất kết nối — chưa lưu được, thử lại khi có mạng");
      return;
    } finally {
      setBusy(false);
    }
    if (!res.ok) {
      showToast((await res.json().catch(() => null))?.error ?? "Từ chối thất bại", "error");
      return;
    }
    await onSaved();
  }, [claim, isOpen, isAdminOrPm, busy, ghiChu, onSaved]);

  const uploadFile = useCallback(
    async (file: File) => {
      if (!claim) return;
      setUploading(true);
      try {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch(`/api/claims/${claim.id}/documents`, {
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
    [claim, loadDocs],
  );

  const deleteFile = useCallback(
    async (id: number) => {
      if (!(await appConfirm("Xoá hồ sơ này?", { danger: true, confirmLabel: "Xoá" }))) return;
      const res = await fetch(`/api/claim-documents/${id}`, { method: "DELETE" });
      if (!res.ok) {
        appAlert((await res.json().catch(() => null))?.error ?? "Xoá thất bại");
        return;
      }
      loadDocs();
    },
    [loadDocs],
  );

  const coTheXoaHoSo = useCallback(
    (d: ClaimDocumentFile) => d.uploadedBy === meId || isAdminOrPm,
    [meId, isAdminOrPm],
  );

  // Phím tắt (M124 FR7): Ctrl/⌘+S = Chốt khi khối quyết định đang hiện và ô chốt hợp lệ,
  // Esc đóng chứng từ. Bỏ qua khi đang mở hộp thoại xác nhận (appConfirm tự xử lý Esc của
  // nó) để không đóng nhầm 2 lớp.
  //
  // Pattern "latest ref": handler đọc state mới nhất qua ref thay vì qua closure — effect
  // chỉ gắn listener MỘT LẦN thay vì gỡ/gắn lại mỗi lần `settle` đổi (đổi mỗi phím gõ vì
  // phụ thuộc ô nhập), tránh mất/nhân đôi phím tắt lúc đang gõ dở.
  const latestRef = useRef({ claim, coTheChot, busy, settle, onClose });
  latestRef.current = { claim, coTheChot, busy, settle, onClose };

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const { claim, coTheChot, busy, settle, onClose } = latestRef.current;
      if (!claim) return;
      // Ctrl/⌘+S phải luôn chặn hành vi mặc định của trình duyệt (mở hộp "Lưu trang"),
      // kể cả lúc không chốt được — nếu return sớm trước preventDefault, trình duyệt vẫn
      // mở hộp thoại lưu file.
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        // Có modal con (Add*Modal/appConfirm) đang mở thì chỉ chặn hộp lưu trang mặc định,
        // không chốt nhầm bản ghi nền phía sau.
        if (document.querySelector('[role="dialog"]')) return;
        if (!coTheChot || busy) return;
        void settle();
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
        onClose();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return {
    claim,
    isAdminOrPm,
    isOpen,
    busy,
    giaTriChot,
    setGiaTriChot,
    soNgayChot,
    setSoNgayChot,
    ghiChu,
    setGhiChu,
    coTheChot,
    documents,
    uploading,
    coTheXoaHoSo,
    settle,
    reject,
    uploadFile,
    deleteFile,
    close: onClose,
  };
}

/** Bộ nút quyết định — dùng chung cho thanh công cụ trên, khối "Quyết định" và thanh đáy. */
function ClaimActions({ ctrl }: { ctrl: ClaimDocumentCtrl }) {
  const { claim, isOpen, isAdminOrPm, busy, coTheChot } = ctrl;
  if (!claim || !isOpen || !isAdminOrPm) return null;
  return (
    <>
      <Button
        icon={Check}
        variant="primary"
        disabled={busy || !coTheChot}
        onClick={() => void ctrl.settle()}
      >
        {busy ? "Đang lưu…" : "Chốt"}
        <Kbd onAccent className="ml-1.5">
          Ctrl S
        </Kbd>
      </Button>
      <Button icon={XCircle} variant="danger" disabled={busy} onClick={() => void ctrl.reject()}>
        Từ chối
      </Button>
    </>
  );
}

/**
 * Thanh hành động đáy — truyền qua `bottomActions` của `AppHeader`. Hiện ở MỌI breakpoint
 * khi đang mở một claim (quyết định người dùng ở M124: đáy ưu tiên thao tác trên điện thoại).
 */
export function ClaimBottomActions({ ctrl }: { ctrl: ClaimDocumentCtrl }) {
  if (!ctrl.claim) return null;
  return (
    <>
      <ClaimActions ctrl={ctrl} />
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

export type ClaimNav = {
  /** Vị trí claim đang mở trong danh sách (0-based) và tổng số claim của bộ lọc. */
  index: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  /** Quay về danh sách (dưới lg danh sách bị ẩn khi đang mở chứng từ). */
  onBackToList: () => void;
};

export default function ClaimDocument({ ctrl, nav }: { ctrl: ClaimDocumentCtrl; nav: ClaimNav }) {
  const { claim, isOpen, isAdminOrPm, documents, uploading } = ctrl;
  if (!claim) return null;

  const laChiPhi = claim.kind === "cost";
  const daChot = claim.amountSettled != null || claim.daysSettled != null;
  const EM_DASH = <span className="text-zinc-500">—</span>;

  const totalRows: DocTotalRow[] = laChiPhi
    ? [
        {
          label: "Giá trị đề xuất",
          value: <MaskedValue value={claim.amountRequested} format={fmtVND} />,
        },
        {
          label: "Giá trị đã chốt",
          value:
            claim.amountSettled == null ? (
              EM_DASH
            ) : (
              <MaskedValue value={claim.amountSettled} format={fmtVND} />
            ),
        },
      ]
    : [
        { label: "Số ngày đề xuất", value: soNgay(claim.daysRequested) },
        { label: "Số ngày đã chốt", value: soNgay(claim.daysSettled) },
      ];

  // Chênh lệch = chốt − đề xuất. Chưa có quyết định thì để "—", KHÔNG dùng MaskedValue cho
  // ô rỗng: "•••" của MaskedValue mang nghĩa "không có quyền xem", không phải "chưa có số".
  const chenhLech = laChiPhi ? (
    claim.amountSettled == null ? (
      EM_DASH
    ) : (
      <MaskedValue value={mSub(claim.amountSettled, claim.amountRequested)} format={fmtChenhLech} />
    )
  ) : claim.daysSettled == null ? (
    EM_DASH
  ) : (
    `${(claim.daysSettled ?? 0) - (claim.daysRequested ?? 0) > 0 ? "+" : ""}${
      (claim.daysSettled ?? 0) - (claim.daysRequested ?? 0)
    } ngày`
  );

  return (
    <div className="space-y-4">
      <DocToolbar
        trailing={
          nav.total > 1 && nav.index >= 0 ? (
            <>
              <Button
                size="icon"
                variant="ghost"
                icon={ChevronLeft}
                aria-label="Claim trước"
                disabled={nav.index <= 0}
                onClick={nav.onPrev}
              />
              <span className="text-xs text-zinc-400 tabular-nums whitespace-nowrap">
                claim {nav.index + 1} / {nav.total}
              </span>
              <Button
                size="icon"
                variant="ghost"
                icon={ChevronRight}
                aria-label="Claim sau"
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
        <ClaimActions ctrl={ctrl} />
      </DocToolbar>

      <header className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-mono text-lg font-semibold text-zinc-100">{claim.code}</h2>
          <Chip tone={STATUS_TONE[claim.status]}>{STATUS_LABEL[claim.status]}</Chip>
          <Chip tone={laChiPhi ? "neutral" : "info"}>{KIND_LABEL[claim.kind]}</Chip>
        </div>
        <p className="text-sm text-zinc-200">{claim.title}</p>
        <p className="text-xs text-zinc-400">
          {claim.contractCode ?? "Không gắn hợp đồng"} · Thông báo {fmtLuc(claim.noticeDate)} ·{" "}
          {claim.createdByName ?? "—"} · {fmtLuc(claim.createdAt)}
        </p>
      </header>

      <Section title="Thông tin claim" icon={FileText}>
        <Card tone="raised" pad="md" className="space-y-3">
          <DocFieldGroup>
            <div className="space-y-3">
              <DocField label="Mã claim" readOnly>
                <span className="font-mono">{claim.code}</span>
              </DocField>
              <DocField label="Loại" readOnly>
                {KIND_LABEL[claim.kind]}
              </DocField>
              <DocField label="Tiêu đề" readOnly>
                {claim.title}
              </DocField>
              <DocField label="Hợp đồng" readOnly>
                {claim.contractCode ? <span className="font-mono">{claim.contractCode}</span> : "—"}
              </DocField>
              <DocField label="Phát sinh/VO" readOnly>
                {claim.voCode ? <span className="font-mono">{claim.voCode}</span> : "—"}
              </DocField>
            </div>
            <div className="space-y-3">
              <DocField label="Ngày thông báo" readOnly>
                {fmtLuc(claim.noticeDate)}
              </DocField>
              <DocField label={laChiPhi ? "Giá trị đề xuất" : "Số ngày đề xuất"} readOnly>
                {laChiPhi ? (
                  <MaskedValue value={claim.amountRequested} format={fmtVND} />
                ) : (
                  soNgay(claim.daysRequested)
                )}
              </DocField>
              <DocField label="Người tạo" readOnly>
                {claim.createdByName ?? "—"}
              </DocField>
              <DocField label="Ngày tạo" readOnly>
                {fmtLuc(claim.createdAt)}
              </DocField>
            </div>
          </DocFieldGroup>

          <DocField label="Nguyên nhân" htmlFor="claim-nguyen-nhan">
            <textarea
              id="claim-nguyen-nhan"
              readOnly
              rows={3}
              value={claim.cause}
              className={`${O_NHAP} resize-y`}
            />
          </DocField>
        </Card>
      </Section>

      {isOpen && isAdminOrPm && (
        <Section
          title="Quyết định"
          icon={Gavel}
          description="Nhập giá trị chốt rồi bấm Chốt; từ chối thì ghi rõ lý do vào ô Ghi chú."
        >
          <Card tone="raised" pad="md" className="space-y-3">
            <DocFieldGroup>
              <div className="space-y-3">
                {laChiPhi ? (
                  <DocField
                    label="Giá trị chốt"
                    required
                    htmlFor="claim-gia-tri-chot"
                    hint={`Đề xuất: ${claim.amountRequested == null ? "—" : fmtVND(claim.amountRequested)}`}
                  >
                    <input
                      id="claim-gia-tri-chot"
                      type="number"
                      min={0}
                      inputMode="numeric"
                      value={ctrl.giaTriChot}
                      onChange={(e) => ctrl.setGiaTriChot(e.target.value)}
                      className={`${O_NHAP} text-right tabular-nums`}
                    />
                  </DocField>
                ) : (
                  <DocField
                    label="Số ngày chốt"
                    required
                    htmlFor="claim-so-ngay-chot"
                    hint={`Đề xuất: ${soNgay(claim.daysRequested)}`}
                  >
                    <input
                      id="claim-so-ngay-chot"
                      type="number"
                      min={0}
                      inputMode="numeric"
                      value={ctrl.soNgayChot}
                      onChange={(e) => ctrl.setSoNgayChot(e.target.value)}
                      className={`${O_NHAP} text-right tabular-nums`}
                    />
                  </DocField>
                )}
              </div>
              <div className="space-y-3">
                <DocField
                  label="Ghi chú"
                  htmlFor="claim-ghi-chu"
                  hint="Bắt buộc khi từ chối — lưu làm lý do của quyết định."
                >
                  <textarea
                    id="claim-ghi-chu"
                    rows={3}
                    value={ctrl.ghiChu}
                    onChange={(e) => ctrl.setGhiChu(e.target.value)}
                    className={`${O_NHAP} resize-y`}
                  />
                </DocField>
              </div>
            </DocFieldGroup>
            <div className="flex flex-wrap items-center gap-2 border-t border-zinc-800 pt-3">
              <ClaimActions ctrl={ctrl} />
            </div>
          </Card>
        </Section>
      )}

      {!isOpen && (
        <Section
          title="Quyết định"
          icon={Gavel}
          description="Claim đã có quyết định — không thể sửa thêm."
        >
          <Card tone="raised" pad="md">
            <DocFieldGroup>
              <div className="space-y-3">
                <DocField label={laChiPhi ? "Giá trị chốt" : "Số ngày chốt"} readOnly>
                  {laChiPhi ? (
                    claim.amountSettled == null ? (
                      EM_DASH
                    ) : (
                      <MaskedValue value={claim.amountSettled} format={fmtVND} />
                    )
                  ) : (
                    soNgay(claim.daysSettled)
                  )}
                </DocField>
                <DocField label="Ghi chú" readOnly>
                  <span className="whitespace-pre-wrap">{claim.settlementNote ?? "—"}</span>
                </DocField>
              </div>
              <div className="space-y-3">
                <DocField label="Trạng thái" readOnly>
                  <Chip tone={STATUS_TONE[claim.status]}>{STATUS_LABEL[claim.status]}</Chip>
                </DocField>
                <DocField label="Người xử lý" readOnly>
                  {claim.settledByName ?? "—"}
                </DocField>
                <DocField label="Quyết định lúc" readOnly>
                  {fmtLuc(claim.settledAt)}
                </DocField>
              </div>
            </DocFieldGroup>
          </Card>
        </Section>
      )}

      <Card tone="raised" pad="md" className="space-y-3 lg:max-w-md lg:ml-auto">
        <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-300">
          {laChiPhi ? "Tổng hợp giá trị" : "Tổng hợp số ngày"}
        </h3>
        <DocTotals rows={totalRows} total={{ label: "Chênh lệch", value: chenhLech }} />
        {isOpen && (
          <p className="text-[11px] text-zinc-400 border-t border-zinc-800 pt-2">
            Chưa có quyết định — chênh lệch chỉ hiện sau khi chốt.
          </p>
        )}
        {!isOpen && !daChot && (
          <p className="text-[11px] text-zinc-400 border-t border-zinc-800 pt-2">
            Claim bị từ chối — không có giá trị chốt.
          </p>
        )}
      </Card>

      <Section title="Hồ sơ đính kèm" icon={Paperclip}>
        <Card tone="raised" pad="md" className="space-y-3">
          {documents.length ? (
            <ul className="space-y-1.5">
              {documents.map((d) => (
                <li key={d.id} className="flex items-center gap-2 text-sm">
                  <Paperclip className="w-3.5 h-3.5 text-zinc-500 shrink-0" aria-hidden="true" />
                  <a
                    href={`/api/claim-documents/${d.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 min-w-0 truncate text-sky-300 hover:underline"
                  >
                    {d.title || d.originalName || "File"}
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
                  {ctrl.coTheXoaHoSo(d) && (
                    <Button
                      size="icon"
                      variant="ghost"
                      icon={X}
                      aria-label={`Xoá hồ sơ ${d.title ?? d.originalName ?? d.id}`}
                      onClick={() => void ctrl.deleteFile(d.id)}
                    />
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState message="Chưa có hồ sơ đính kèm nào." compact />
          )}
          {isOpen && (
            <label className={`${buttonClass({ variant: "secondary" })} cursor-pointer w-fit`}>
              <Paperclip className="w-4 h-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
              {uploading ? "Đang tải lên…" : "Tải hồ sơ lên"}
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
