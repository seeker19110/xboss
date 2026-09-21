"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  Layers,
  Link2,
  Lock,
  Paperclip,
  Receipt,
  Save,
  Trash2,
  X,
} from "lucide-react";
import MaskedValue from "@/app/components/MaskedValue";
import { mSum, mSub } from "@/app/lib/masked";
import EmptyState from "@/app/components/EmptyState";
import { appAlert, appConfirm } from "@/app/components/dialogs";
import { showToast } from "@/app/components/Toast";
import CustomFieldsSection from "@/app/components/CustomFieldsSection";
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
  Tabs,
  TabPanel,
  type DocTotalRow,
  type TabItem,
} from "@/app/components/ui";
import type { ChipTone } from "@/app/components/ui/Chip";

// Khối "chứng từ" của một hợp đồng — M126. Tách ra từ hộp thoại chi tiết cũ trong
// `app/contracts/page.tsx`: cùng dữ liệu, cùng các hàm gọi API, nhưng hiển thị TOÀN
// TRANG ở cột phải (master–detail) thay vì hộp thoại max-w-xl chật, và 5 nhóm nội dung
// đi qua `Tabs` dùng chung (M125) với tab đang mở ghi vào URL `?tab=`.

export type ContractKind = "nhan_thau" | "giao_thau" | "ncc";
export type ContractStatus = "draft" | "active" | "completed" | "terminated";

export const KIND_LABEL: Record<ContractKind, string> = {
  nhan_thau: "Nhận thầu",
  giao_thau: "Giao thầu",
  ncc: "Nhà cung cấp",
};
export const STATUS_LABEL: Record<ContractStatus, string> = {
  draft: "Nháp",
  active: "Hiệu lực",
  completed: "Hoàn thành",
  terminated: "Chấm dứt",
};
/** Màu chip trạng thái — dùng chung cho cả danh sách trái và chứng từ phải. */
export const STATUS_TONE: Record<ContractStatus, ChipTone> = {
  draft: "neutral",
  active: "success",
  completed: "info",
  terminated: "danger",
};

export type Contract = {
  id: number;
  code: string;
  kind: ContractKind;
  title: string;
  partySupplierId: number | null;
  partySupplierName: string | null;
  partyName: string | null;
  systemId: number | null;
  systemCode: string | null;
  systemName: string | null;
  systemColor: string | null;
  value: number;
  advancePct: number;
  retentionPct: number;
  signedDate: string | null;
  validFrom: string | null;
  validTo: string | null;
  status: ContractStatus;
  note: string | null;
  addendaTotal: number;
  paid: number;
  poCommitted: number;
  custom: Record<string, unknown>;
  deletedAt: string | null;
};
export type Supplier = { id: number; name: string };
export type SystemOption = { id: number; code: string; name: string };

export type ContractDetail = {
  contract: Contract;
  addenda: {
    id: number;
    code: string;
    title: string | null;
    valueDelta: number;
    signedDate: string | null;
    note: string | null;
    createdByName: string | null;
  }[];
  documents: {
    id: number;
    originalName: string | null;
    mimeType: string;
    sizeBytes: number | null;
    caption: string | null;
    createdAt: string;
    uploaderName: string | null;
    sha256: string | null;
  }[];
  bills: { id: number; responsible: string; type: string; amount: number; paidDate: string }[];
  purchaseOrders: {
    id: number;
    poCode: string;
    status: string;
    expectedDate: string | null;
    supplierName: string | null;
  }[];
  floorContracts: {
    id: number;
    floorLabel: string;
    contractValue: number;
    sheetName: string;
    sheetSlug: string | null;
  }[];
};

type IpcCert = { id: number; code: string; periodNo: number; status: string };

const IPC_STATUS_LABEL: Record<string, string> = {
  draft: "Nháp",
  submitted: "Đã trình",
  approved: "Được duyệt",
  rejected: "Từ chối",
};
const IPC_STATUS_TONE: Record<string, ChipTone> = {
  draft: "neutral",
  submitted: "warning",
  approved: "success",
  rejected: "danger",
};

export function fmtVND(n: number) {
  if (!n) return "—";
  return Math.round(n).toLocaleString("vi-VN") + " đ";
}

export const CONTRACT_TABS: TabItem[] = [
  { id: "info", label: "Thông tin", icon: FileText },
  { id: "addenda", label: "Phụ lục", icon: Layers },
  { id: "documents", label: "File", icon: Paperclip },
  { id: "links", label: "Liên kết", icon: Link2 },
  { id: "ipc", label: "Đợt IPC", icon: Receipt },
];
export type ContractTab = (typeof CONTRACT_TABS)[number]["id"];

/** Ô nhập của chứng từ — `text-base` dưới sm để iOS Safari không tự phóng to trang. */
const O_NHAP =
  "w-full min-h-10 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-base sm:text-sm text-zinc-100 outline-none focus:border-emerald-500 transition";

/** Phần thông tin sửa được của hợp đồng (PATCH gửi nguyên bộ này). */
type InfoForm = {
  title: string;
  value: string;
  advancePct: string;
  retentionPct: string;
  status: ContractStatus;
  signedDate: string;
  validFrom: string;
  validTo: string;
};

// Giá trị/tỷ lệ có thể bị che (null) với user thiếu viewPayments — `?? ""` để ô nhập
// không hiện chuỗi "null"; thực tế chỉ Admin/PM (có viewPayments) mới thấy ô nhập.
function taoForm(c: Contract | null): InfoForm {
  return {
    title: c?.title ?? "",
    value: c?.value == null ? "" : String(c.value),
    advancePct: c?.advancePct == null ? "" : String(c.advancePct),
    retentionPct: c?.retentionPct == null ? "" : String(c.retentionPct),
    status: c?.status ?? "draft",
    signedDate: c?.signedDate ?? "",
    validFrom: c?.validFrom ?? "",
    validTo: c?.validTo ?? "",
  };
}

export type ContractDocumentCtrl = {
  contract: Contract | null;
  detail: ContractDetail | null;
  certs: IpcCert[];
  canManage: boolean;
  busy: boolean;
  /** Còn thay đổi chưa lưu ở tab Thông tin. */
  dirty: boolean;
  tab: ContractTab;
  setTab: (tab: ContractTab) => void;
  form: InfoForm;
  setField: <K extends keyof InfoForm>(key: K, value: InfoForm[K]) => void;
  infoErr: string;
  addCode: string;
  setAddCode: (v: string) => void;
  addDelta: string;
  setAddDelta: (v: string) => void;
  savingAddendum: boolean;
  uploading: boolean;
  loadDetail: () => void;
  /** Nạp lại cả danh sách (tầng trang) lẫn chi tiết — dùng sau khi lưu trường tuỳ biến. */
  reload: () => void;
  saveInfo: () => Promise<void>;
  addAddendum: () => Promise<void>;
  removeAddendum: (aid: number) => Promise<void>;
  uploadFile: (file: File) => Promise<void>;
  deleteFile: (id: number) => Promise<void>;
  deleteContract: () => Promise<void>;
  close: () => void;
};

// Toàn bộ state + lời gọi API của chứng từ gom vào một hook để thanh công cụ TRÊN và
// thanh hành động ĐÁY (render bởi AppHeader ở tầng trang) dùng chung đúng một bộ hàm.
export function useContractDocument({
  contract,
  canManage,
  tab,
  setTab,
  onSaved,
  onDeleted,
  onClose,
}: {
  contract: Contract | null;
  canManage: boolean;
  tab: ContractTab;
  setTab: (tab: ContractTab) => void;
  onSaved: () => void | Promise<void>;
  onDeleted: () => void;
  onClose: () => void;
}): ContractDocumentCtrl {
  const [detail, setDetail] = useState<ContractDetail | null>(null);
  const [certs, setCerts] = useState<IpcCert[]>([]);
  const [form, setForm] = useState<InfoForm>(() => taoForm(contract));
  const [busy, setBusy] = useState(false);
  const [infoErr, setInfoErr] = useState("");
  const [addCode, setAddCode] = useState("");
  const [addDelta, setAddDelta] = useState("0");
  const [savingAddendum, setSavingAddendum] = useState(false);
  const [uploading, setUploading] = useState(false);

  const contractId = contract?.id ?? null;

  const loadDetail = useCallback(() => {
    if (contractId == null) {
      setDetail(null);
      return;
    }
    fetch(`/api/contracts/${contractId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setDetail(j));
  }, [contractId]);

  // Đổi hợp đồng (hoặc tải lại danh sách sau khi lưu) → nạp lại ô nhập theo số của server.
  const banDau = useMemo(() => taoForm(contract), [contract]);
  useEffect(() => {
    setForm(banDau);
    setInfoErr("");
  }, [banDau]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  useEffect(() => {
    if (contractId == null) {
      setCerts([]);
      return;
    }
    let huy = false;
    fetch(`/api/payment-certs?contractId=${contractId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!huy) setCerts(j?.certs ?? []);
      });
    return () => {
      huy = true;
    };
  }, [contractId]);

  const dirty = useMemo(
    () => (Object.keys(banDau) as (keyof InfoForm)[]).some((k) => banDau[k] !== form[k]),
    [banDau, form],
  );

  const setField = useCallback(
    <K extends keyof InfoForm>(key: K, value: InfoForm[K]) =>
      setForm((f) => ({ ...f, [key]: value })),
    [],
  );

  const saveInfo = useCallback(async () => {
    if (!contract) return;
    setBusy(true);
    setInfoErr("");
    try {
      const res = await fetch(`/api/contracts/${contract.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title.trim(),
          value: Number(form.value) || 0,
          advancePct: Number(form.advancePct) || 0,
          retentionPct: Number(form.retentionPct) || 0,
          status: form.status,
          signedDate: form.signedDate || null,
          validFrom: form.validFrom || null,
          validTo: form.validTo || null,
        }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        setInfoErr(j?.error ?? "Lưu thất bại");
        return;
      }
      await onSaved();
      loadDetail();
    } catch {
      setInfoErr("Mất kết nối — kiểm tra mạng rồi thử lại");
    } finally {
      setBusy(false);
    }
  }, [contract, form, onSaved, loadDetail]);

  const addAddendum = useCallback(async () => {
    if (!contract || !addCode.trim()) return;
    setSavingAddendum(true);
    try {
      const res = await fetch(`/api/contracts/${contract.id}/addenda`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: addCode.trim(), valueDelta: Number(addDelta) || 0 }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        showToast(j?.error ?? "Không thêm được phụ lục", "error");
        return;
      }
      setAddCode("");
      setAddDelta("0");
      await onSaved();
      loadDetail();
    } catch {
      showToast("Mất kết nối — kiểm tra mạng rồi thử lại", "error");
    } finally {
      setSavingAddendum(false);
    }
  }, [contract, addCode, addDelta, onSaved, loadDetail]);

  const removeAddendum = useCallback(
    async (aid: number) => {
      if (!contract) return;
      if (!(await appConfirm("Xoá phụ lục này?", { danger: true, confirmLabel: "Xoá" }))) return;
      const res = await fetch(`/api/contracts/${contract.id}/addenda/${aid}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        showToast((await res.json().catch(() => null))?.error ?? "Xoá thất bại", "error");
        return;
      }
      await onSaved();
      loadDetail();
    },
    [contract, onSaved, loadDetail],
  );

  const uploadFile = useCallback(
    async (file: File) => {
      if (!contract) return;
      setUploading(true);
      try {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch(`/api/contracts/${contract.id}/documents`, {
          method: "POST",
          body: form,
        });
        if (!res.ok) {
          showToast((await res.json().catch(() => null))?.error ?? "Upload thất bại", "error");
          return;
        }
        loadDetail();
      } catch {
        showToast("Mất kết nối — kiểm tra mạng rồi thử lại", "error");
      } finally {
        setUploading(false);
      }
    },
    [contract, loadDetail],
  );

  const deleteFile = useCallback(
    async (id: number) => {
      if (!(await appConfirm("Xoá file đính kèm này?", { danger: true, confirmLabel: "Xoá" })))
        return;
      const res = await fetch(`/api/contract-documents/${id}`, { method: "DELETE" });
      if (!res.ok) {
        showToast((await res.json().catch(() => null))?.error ?? "Xoá thất bại", "error");
        return;
      }
      loadDetail();
    },
    [loadDetail],
  );

  const reload = useCallback(() => {
    void onSaved();
    loadDetail();
  }, [onSaved, loadDetail]);

  const deleteContract = useCallback(async () => {
    if (!contract) return;
    if (
      !(await appConfirm(`Xoá hợp đồng "${contract.code}"? Không thể hoàn tác.`, {
        danger: true,
        confirmLabel: "Xoá",
      }))
    )
      return;
    const res = await fetch(`/api/contracts/${contract.id}`, { method: "DELETE" });
    if (!res.ok) {
      appAlert((await res.json().catch(() => null))?.error ?? "Xoá thất bại");
      return;
    }
    onDeleted();
  }, [contract, onDeleted]);

  // Phím tắt: Ctrl/⌘+S lưu thông tin (tab Thông tin), Esc đóng chứng từ. Bỏ qua khi đang
  // mở hộp thoại xác nhận (appConfirm tự xử lý Esc của nó) để không đóng nhầm 2 lớp.
  //
  // Pattern "latest ref": handler đọc state mới nhất qua ref thay vì qua closure — effect
  // chỉ gắn listener MỘT LẦN thay vì gỡ/gắn lại mỗi lần `saveInfo` đổi (đổi mỗi phím gõ
  // vì phụ thuộc `form`), tránh mất/nhân đôi phím tắt lúc đang gõ dở.
  const latestRef = useRef({ contract, canManage, tab, busy, dirty, saveInfo, onClose });
  latestRef.current = { contract, canManage, tab, busy, dirty, saveInfo, onClose };

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const { contract, canManage, tab, busy, dirty, saveInfo, onClose } = latestRef.current;
      if (!contract) return;
      // Ctrl/⌘+S phải luôn chặn hành vi mặc định của trình duyệt (mở hộp "Lưu trang"),
      // kể cả lúc không có gì để lưu — nếu return sớm trước preventDefault, trình duyệt
      // vẫn mở hộp thoại lưu file.
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (!canManage || tab !== "info" || busy || !dirty) return;
        void saveInfo();
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
    contract,
    detail,
    certs,
    canManage,
    busy,
    dirty,
    tab,
    setTab,
    form,
    setField,
    infoErr,
    addCode,
    setAddCode,
    addDelta,
    setAddDelta,
    savingAddendum,
    uploading,
    loadDetail,
    reload,
    saveInfo,
    addAddendum,
    removeAddendum,
    uploadFile,
    deleteFile,
    deleteContract,
    close: onClose,
  };
}

/** Bộ nút hành động của chứng từ — dùng chung cho thanh công cụ trên và thanh đáy. */
function ContractActions({ ctrl }: { ctrl: ContractDocumentCtrl }) {
  const { contract, canManage, busy, dirty, tab } = ctrl;
  if (!contract) return null;
  return (
    <>
      {canManage && tab === "info" && (
        <Button
          icon={Save}
          variant={dirty ? "primary" : "secondary"}
          disabled={busy || !dirty}
          onClick={() => void ctrl.saveInfo()}
        >
          {busy ? "Đang lưu…" : "Lưu"}
          <Kbd onAccent={dirty} className="ml-1.5">
            Ctrl S
          </Kbd>
        </Button>
      )}
      {canManage && (
        <Button
          icon={Trash2}
          variant="danger"
          aria-label={`Xoá hợp đồng ${contract.code}`}
          onClick={() => void ctrl.deleteContract()}
        >
          Xoá hợp đồng
        </Button>
      )}
    </>
  );
}

/**
 * Thanh hành động đáy — truyền qua `bottomActions` của `AppHeader`. Hiện ở MỌI breakpoint
 * khi đang mở một hợp đồng (đáy ưu tiên thao tác trên điện thoại, như M124).
 */
export function ContractBottomActions({ ctrl }: { ctrl: ContractDocumentCtrl }) {
  if (!ctrl.contract) return null;
  return (
    <>
      <ContractActions ctrl={ctrl} />
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

export type ContractNav = {
  /** Vị trí hợp đồng đang mở trong danh sách (0-based) và tổng số hợp đồng. */
  index: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  /** Quay về danh sách (dưới lg danh sách bị ẩn khi đang mở chứng từ). */
  onBackToList: () => void;
};

export default function ContractDocument({
  ctrl,
  nav,
}: {
  ctrl: ContractDocumentCtrl;
  nav: ContractNav;
}) {
  const { contract, detail, certs, canManage, form, setField, infoErr, tab } = ctrl;
  if (!contract) return null;

  // M50 PR2: che (null) lan truyền — tổng/còn lại "bị che" khi value/addendaTotal/paid
  // bị che, không ngầm thành 0.
  const tong = mSum(contract.value, contract.addendaTotal);
  const conLai = mSub(tong, contract.paid);
  const totalRows: DocTotalRow[] = [
    { label: "Giá trị hợp đồng", value: <MaskedValue value={contract.value} format={fmtVND} /> },
    { label: "Phụ lục", value: <MaskedValue value={contract.addendaTotal} format={fmtVND} /> },
    { label: "Đã thanh toán", value: <MaskedValue value={contract.paid} format={fmtVND} /> },
    { label: "PO cam kết", value: <MaskedValue value={contract.poCommitted} format={fmtVND} /> },
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
                aria-label="Hợp đồng trước"
                disabled={nav.index <= 0}
                onClick={nav.onPrev}
              />
              <span className="text-xs text-zinc-400 tabular-nums whitespace-nowrap">
                hợp đồng {nav.index + 1} / {nav.total}
              </span>
              <Button
                size="icon"
                variant="ghost"
                icon={ChevronRight}
                aria-label="Hợp đồng sau"
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
        <ContractActions ctrl={ctrl} />
      </DocToolbar>

      <header className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-mono text-lg font-semibold text-zinc-100">{contract.code}</h2>
          <Chip tone={STATUS_TONE[contract.status]}>{STATUS_LABEL[contract.status]}</Chip>
          <Chip>{KIND_LABEL[contract.kind]}</Chip>
        </div>
        <p className="text-xs text-zinc-400">
          {contract.title} · {contract.partySupplierName ?? contract.partyName ?? "—"}
          {contract.systemName ? ` · ${contract.systemName}` : ""}
        </p>
      </header>

      <Card pad="none">
        <Tabs
          group="contract-doc"
          label="Nhóm nội dung hợp đồng"
          items={CONTRACT_TABS}
          value={tab}
          onChange={(id) => ctrl.setTab(id as ContractTab)}
          className="px-2"
        />
        <TabPanel group="contract-doc" value={tab} className="p-3 sm:p-4">
          {tab === "info" && (
            <div className="space-y-4">
              <Section title="Thông tin hợp đồng" icon={FileText}>
                <Card tone="sunken" pad="md">
                  <DocFieldGroup>
                    <div className="space-y-3">
                      <DocField label="Số hợp đồng" readOnly>
                        <span className="font-mono">{contract.code}</span>
                      </DocField>
                      <DocField label="Loại" readOnly>
                        {KIND_LABEL[contract.kind]}
                      </DocField>
                      <DocField
                        label="Tên hợp đồng"
                        readOnly={!canManage}
                        htmlFor={canManage ? "hd-title" : undefined}
                      >
                        {canManage ? (
                          <input
                            id="hd-title"
                            value={form.title}
                            onChange={(e) => setField("title", e.target.value)}
                            className={O_NHAP}
                          />
                        ) : (
                          contract.title
                        )}
                      </DocField>
                      <DocField label="Đối tác" readOnly>
                        {contract.partySupplierName ?? contract.partyName ?? "—"}
                      </DocField>
                      <DocField label="Hệ" readOnly>
                        {contract.systemName ? (
                          <span className="inline-flex items-center gap-1.5">
                            <span
                              className={`w-2 h-2 rounded-full bg-${contract.systemColor}-400`}
                            />
                            {contract.systemName}
                          </span>
                        ) : (
                          "—"
                        )}
                      </DocField>
                      <DocField
                        label="Trạng thái"
                        readOnly={!canManage}
                        htmlFor={canManage ? "hd-status" : undefined}
                      >
                        {canManage ? (
                          <select
                            id="hd-status"
                            value={form.status}
                            onChange={(e) => setField("status", e.target.value as ContractStatus)}
                            className={O_NHAP}
                          >
                            {(Object.keys(STATUS_LABEL) as ContractStatus[]).map((s) => (
                              <option key={s} value={s}>
                                {STATUS_LABEL[s]}
                              </option>
                            ))}
                          </select>
                        ) : (
                          STATUS_LABEL[contract.status]
                        )}
                      </DocField>
                    </div>
                    <div className="space-y-3">
                      <DocField
                        label="Giá trị"
                        readOnly={!canManage}
                        htmlFor={canManage ? "hd-value" : undefined}
                      >
                        {canManage ? (
                          <input
                            id="hd-value"
                            type="number"
                            value={form.value}
                            onChange={(e) => setField("value", e.target.value)}
                            className={O_NHAP}
                          />
                        ) : (
                          <MaskedValue value={contract.value} format={fmtVND} />
                        )}
                      </DocField>
                      <DocField
                        label="% tạm ứng"
                        readOnly={!canManage}
                        htmlFor={canManage ? "hd-advance" : undefined}
                      >
                        {canManage ? (
                          <input
                            id="hd-advance"
                            type="number"
                            value={form.advancePct}
                            onChange={(e) => setField("advancePct", e.target.value)}
                            className={O_NHAP}
                          />
                        ) : (
                          <MaskedValue value={contract.advancePct} format={(n) => `${n}%`} />
                        )}
                      </DocField>
                      <DocField
                        label="% giữ lại bảo hành"
                        readOnly={!canManage}
                        htmlFor={canManage ? "hd-retention" : undefined}
                      >
                        {canManage ? (
                          <input
                            id="hd-retention"
                            type="number"
                            value={form.retentionPct}
                            onChange={(e) => setField("retentionPct", e.target.value)}
                            className={O_NHAP}
                          />
                        ) : (
                          <MaskedValue value={contract.retentionPct} format={(n) => `${n}%`} />
                        )}
                      </DocField>
                      <DocField
                        label="Ký ngày"
                        readOnly={!canManage}
                        htmlFor={canManage ? "hd-signed" : undefined}
                      >
                        {canManage ? (
                          <input
                            id="hd-signed"
                            type="date"
                            value={form.signedDate}
                            onChange={(e) => setField("signedDate", e.target.value)}
                            className={O_NHAP}
                          />
                        ) : (
                          (contract.signedDate ?? "—")
                        )}
                      </DocField>
                      <DocField
                        label="Hiệu lực từ"
                        readOnly={!canManage}
                        htmlFor={canManage ? "hd-valid-from" : undefined}
                      >
                        {canManage ? (
                          <input
                            id="hd-valid-from"
                            type="date"
                            value={form.validFrom}
                            onChange={(e) => setField("validFrom", e.target.value)}
                            className={O_NHAP}
                          />
                        ) : (
                          (contract.validFrom ?? "—")
                        )}
                      </DocField>
                      <DocField
                        label="Hiệu lực đến"
                        readOnly={!canManage}
                        htmlFor={canManage ? "hd-valid-to" : undefined}
                      >
                        {canManage ? (
                          <input
                            id="hd-valid-to"
                            type="date"
                            value={form.validTo}
                            onChange={(e) => setField("validTo", e.target.value)}
                            className={O_NHAP}
                          />
                        ) : (
                          (contract.validTo ?? "Không thời hạn")
                        )}
                      </DocField>
                    </div>
                  </DocFieldGroup>
                  {infoErr && <p className="mt-3 text-sm text-rose-300">{infoErr}</p>}
                </Card>
              </Section>

              <div className="grid lg:grid-cols-[1.4fr_1fr] gap-4 items-start">
                <CustomFieldsSection
                  entityType="contract"
                  apiPath={`/api/contracts/${contract.id}`}
                  value={detail?.contract.custom}
                  canEdit={canManage}
                  onSaved={ctrl.reload}
                />
                <Card tone="raised" pad="md" className="space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-300">
                    Tổng hợp giá trị
                  </h3>
                  <DocTotals
                    rows={totalRows}
                    total={{
                      label: "Còn lại",
                      value: <MaskedValue value={conLai} format={fmtVND} />,
                    }}
                  />
                </Card>
              </div>
            </div>
          )}

          {tab === "addenda" && <AddendaTab ctrl={ctrl} />}

          {tab === "documents" && <DocumentsTab ctrl={ctrl} />}

          {tab === "links" && <LinksTab detail={detail} />}

          {tab === "ipc" && (
            <div className="space-y-3 text-sm">
              {certs.length ? (
                <ul className="divide-y divide-zinc-800/60">
                  {certs.map((c) => (
                    <li
                      key={c.id}
                      className="flex items-center justify-between gap-2 py-2 text-zinc-300"
                    >
                      <span>
                        <span className="font-mono text-xs">{c.code}</span> — Đợt {c.periodNo}
                      </span>
                      <Chip tone={IPC_STATUS_TONE[c.status] ?? "neutral"}>
                        {IPC_STATUS_LABEL[c.status] ?? c.status}
                      </Chip>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState message="Chưa có đợt thanh toán khối lượng nào." compact />
              )}
              <a
                href={`/payment-certs?contractId=${contract.id}`}
                className="inline-block text-xs text-sky-300 hover:underline"
              >
                Quản lý đợt thanh toán khối lượng (IPC) →
              </a>
            </div>
          )}
        </TabPanel>
      </Card>
    </div>
  );
}

function AddendaTab({ ctrl }: { ctrl: ContractDocumentCtrl }) {
  const { detail, canManage } = ctrl;
  return (
    <div className="space-y-3">
      {detail?.addenda.length ? (
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Bảng phụ lục">
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="text-xs text-zinc-400 border-b border-zinc-800">
                <th className="text-left p-2">MÃ</th>
                <th className="text-left p-2">TIÊU ĐỀ</th>
                <th className="text-right p-2">GIÁ TRỊ ±</th>
                <th className="text-left p-2">KÝ NGÀY</th>
                <th className="text-left p-2">NGƯỜI TẠO</th>
                {canManage && <th className="p-2" />}
              </tr>
            </thead>
            <tbody>
              {detail.addenda.map((a) => (
                <tr key={a.id} className="border-b border-zinc-800/60 last:border-0">
                  <td className="p-2 font-mono text-xs">{a.code}</td>
                  <td className="p-2">{a.title ?? "—"}</td>
                  <td
                    className={`p-2 text-right font-mono tabular-nums ${
                      a.valueDelta == null
                        ? ""
                        : a.valueDelta >= 0
                          ? "text-emerald-300"
                          : "text-rose-300"
                    }`}
                  >
                    {a.valueDelta != null && a.valueDelta >= 0 ? "+" : ""}
                    <MaskedValue value={a.valueDelta} format={fmtVND} />
                  </td>
                  <td className="p-2 text-zinc-300">{a.signedDate ?? "—"}</td>
                  <td className="p-2 text-zinc-300">{a.createdByName ?? "—"}</td>
                  {canManage && (
                    <td className="p-2 text-right">
                      <Button
                        size="icon"
                        variant="ghost"
                        icon={X}
                        aria-label={`Xoá phụ lục ${a.code}`}
                        onClick={() => void ctrl.removeAddendum(a.id)}
                      />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState message="Chưa có phụ lục nào." compact />
      )}
      {canManage && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={ctrl.addCode}
            onChange={(e) => ctrl.setAddCode(e.target.value)}
            placeholder="Số phụ lục"
            aria-label="Số phụ lục"
            className={`${O_NHAP} flex-1 min-w-[160px]`}
          />
          <input
            type="number"
            value={ctrl.addDelta}
            onChange={(e) => ctrl.setAddDelta(e.target.value)}
            placeholder="Giá trị +/-"
            aria-label="Giá trị tăng giảm"
            className={`${O_NHAP} w-36`}
          />
          <Button
            variant="primary"
            disabled={ctrl.savingAddendum || !ctrl.addCode.trim()}
            onClick={() => void ctrl.addAddendum()}
          >
            Thêm
          </Button>
        </div>
      )}
    </div>
  );
}

function DocumentsTab({ ctrl }: { ctrl: ContractDocumentCtrl }) {
  const { detail, canManage, uploading } = ctrl;
  return (
    <div className="space-y-3">
      {detail?.documents.length ? (
        <ul className="divide-y divide-zinc-800/60">
          {detail.documents.map((d) => (
            <li key={d.id} className="flex items-center gap-2 py-2 text-sm">
              <Paperclip className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
              <a
                href={`/api/contract-documents/${d.id}`}
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
              {canManage && (
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
      {canManage && (
        // Ô chọn file vẫn là <label> bọc input file (cách gắn nhãn chuẩn của trình duyệt),
        // chỉ mượn hình thức nút thứ cấp qua `buttonClass` — không chế class nút riêng.
        <label className={`${buttonClass({ variant: "secondary" })} cursor-pointer`}>
          <Paperclip className="w-4 h-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
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
    </div>
  );
}

function LinksTab({ detail }: { detail: ContractDetail | null }) {
  return (
    <div className="grid md:grid-cols-2 gap-4 text-sm">
      <Section title={`Đơn đặt hàng (${detail?.purchaseOrders.length ?? 0})`}>
        {detail?.purchaseOrders.length ? (
          <ul className="space-y-1">
            {detail.purchaseOrders.map((po) => (
              <li key={po.id} className="flex justify-between gap-2 text-zinc-300">
                <span className="font-mono text-xs">{po.poCode}</span>
                <span className="text-zinc-400">{po.status}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-zinc-500">Chưa có PO nào gắn hợp đồng này.</p>
        )}
      </Section>
      <Section title={`Thanh toán (${detail?.bills.length ?? 0})`}>
        {detail?.bills.length ? (
          <ul className="space-y-1">
            {detail.bills.map((b) => (
              <li key={b.id} className="flex justify-between gap-2 text-zinc-300">
                <span>{b.paidDate}</span>
                <span className="font-mono tabular-nums">
                  <MaskedValue value={b.amount} format={fmtVND} />
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-zinc-500">Chưa có phiếu thanh toán nào gắn hợp đồng này.</p>
        )}
      </Section>
      <Section title={`Giá trị giao thầu theo tầng (${detail?.floorContracts.length ?? 0})`}>
        {detail?.floorContracts.length ? (
          <ul className="space-y-1">
            {detail.floorContracts.map((fc) => (
              <li key={fc.id} className="flex justify-between gap-2 text-zinc-300">
                <span>
                  {fc.sheetName} — {fc.floorLabel}
                </span>
                <span className="font-mono tabular-nums">
                  <MaskedValue value={fc.contractValue} format={fmtVND} />
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-zinc-500">Chưa gắn tầng nào.</p>
        )}
      </Section>
    </div>
  );
}
