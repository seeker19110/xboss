"use client";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckSquare,
  FileText,
  Paperclip,
  Upload,
  X,
  CheckCircle2,
  Clock,
  Link2,
  Image as ImageIcon,
  SearchX,
} from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import { Modal, appAlert, appConfirm, appPrompt } from "@/app/components/dialogs";
import { PageSkeleton } from "@/app/components/Skeleton";
import { redirectToLogin } from "@/app/lib/me";
import { formatDateVN } from "@/lib/date";
import { formatVnd } from "@/lib/money";
import { sortFloorsAsc } from "@/lib/floors";
import TableToolbar, {
  SortableHeader,
  highlightMatch,
  type ToolbarFilter,
} from "@/app/components/TableToolbar";
import { Inbox, ThumbsUp, ThumbsDown } from "lucide-react";

type FloorGroup = {
  sheetTypeId: number;
  sheetType: string;
  floorLabel: string;
  wpName: string | null;
  totalTasks: number;
  doneTasks: number;
  approvalId: number | null;
  isApproved: boolean;
  approvedByName: string | null;
  approvedAt: string | null;
  docCount: number;
};
// M46 PR3 — hộp thư "chờ tôi duyệt" hợp nhất (VO/IPC/đề xuất/nghiệm thu task qua Approval
// Engine, xem docs/nang-cap/M46-approval-engine.md). Chỉ xuất hiện khi Admin đã cấu hình
// flow (PR4) — trống khi chưa có flow nào, không đổi trải nghiệm hiện có.
type PendingApproval = {
  id: number;
  entityType: "variation" | "payment_cert" | "proposal" | "task_acceptance";
  entityId: number;
  amount: number | null;
  currentSeq: number;
  stepRole: string;
  slaDays: number | null;
  createdAt: string;
  flowName: string;
  label: string;
  linkUrl: string;
};

const ENTITY_TYPE_LABEL: Record<PendingApproval["entityType"], string> = {
  variation: "Phát sinh (VO)",
  payment_cert: "Đợt thanh toán (IPC)",
  proposal: "Đề xuất",
  task_acceptance: "Nghiệm thu task",
};

// Endpoint quyết định theo loại — mỗi entity_type giữ nguyên body/route decide riêng đã có
// (VO/IPC/proposal) để không đụng logic nghiệp vụ cuối chuỗi (boq_items/payment_bills/...),
// engine chỉ chen vào bước TRUNG GIAN của các route đó (xem app/api/*/decide).
function decideBody(entityType: PendingApproval["entityType"], approve: boolean, note: string) {
  if (entityType === "task_acceptance") return { decision: approve ? "approve" : "reject", note };
  return { decision: approve ? "approved" : "rejected", rejectReason: note };
}
function decideUrl(item: PendingApproval): string {
  switch (item.entityType) {
    case "variation":
      return `/api/variations/${item.entityId}/decide`;
    case "payment_cert":
      return `/api/payment-certs/${item.entityId}/decide`;
    case "proposal":
      return `/api/proposals/${item.entityId}/decide`;
    case "task_acceptance":
      return `/api/tasks/${item.entityId}/approve`;
  }
}

type Doc = {
  id: number;
  originalName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  caption: string | null;
  uploaderName: string | null;
  createdAt: string;
  linkUrl: string | null;
};

const fmtSize = (b: number) =>
  b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)}MB` : `${Math.round(b / 1024)}KB`;

// Bucket % tiến độ cho preset filter (0% / 1-49% / 50-99% / 100%). Bucket "100" chỉ khi
// TẤT CẢ task đã xong (không dùng Math.round — tránh làm tròn gần-xong, vd 199/200 = 99.5%,
// thành "100%" như lớp lỗi đã từng sửa ở recomputeTask/recomputePackage).
function pctBucketOf(g: FloorGroup): string {
  if (g.totalTasks <= 0) return "0";
  if (g.doneTasks === g.totalTasks) return "100";
  const pct = Math.round((g.doneTasks / g.totalTasks) * 100);
  if (pct <= 0) return "0";
  if (pct < 50) return "1-49";
  return "50-99";
}
const PCT_OPTIONS = [
  { value: "0", label: "0%" },
  { value: "1-49", label: "1-49%" },
  { value: "50-99", label: "50-99%" },
  { value: "100", label: "100%" },
];
// Sort mặc định: theo tầng vật lý (sortFloorsAsc), tie-break theo hệ.
const compareFloorGroup = (a: FloorGroup, b: FloorGroup) =>
  sortFloorsAsc(a.floorLabel, b.floorLabel) || a.sheetType.localeCompare(b.sheetType);

export default function ApprovalsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ApprovalsPageInner />
    </Suspense>
  );
}

function ApprovalsPageInner() {
  const [pending, setPending] = useState<FloorGroup[]>([]);
  const [approved, setApproved] = useState<FloorGroup[]>([]);
  const [canApprove, setCanApprove] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [inbox, setInbox] = useState<PendingApproval[]>([]);
  const [inboxBusy, setInboxBusy] = useState<number | null>(null);
  const [openDocs, setOpenDocs] = useState<{ approvalId: number; label: string } | null>(null);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [linkInput, setLinkInput] = useState("");
  const [linkCaption, setLinkCaption] = useState("");
  const [showLinkForm, setShowLinkForm] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadApprovalRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/approvals");
    if (r.status === 401) {
      redirectToLogin();
      return;
    }
    if (!r.ok) {
      const err = await r.json().catch(() => ({ error: `Lỗi server (${r.status})` }));
      appAlert(err.error ?? `Lỗi server (${r.status})`);
      setLoading(false);
      return;
    }
    const j = await r.json();
    setPending(j.pending ?? []);
    setApproved(j.approved ?? []);
    setCanApprove(!!j.canApprove);
    setLoading(false);
  }, []);

  const loadInbox = useCallback(async () => {
    const r = await fetch("/api/approvals/inbox");
    if (r.ok) setInbox((await r.json()).items ?? []);
  }, []);

  useEffect(() => {
    load();
    loadInbox();
  }, [load, loadInbox]);

  async function decideInboxItem(item: PendingApproval, approve: boolean) {
    let note = "";
    if (!approve) {
      const n = await appPrompt("Lý do từ chối (bắt buộc)");
      if (!n?.trim()) return;
      note = n.trim();
    } else if (
      !(await appConfirm(`Duyệt "${item.label}" — bước ${item.currentSeq} (${item.stepRole})?`, {
        confirmLabel: "Duyệt",
      }))
    )
      return;
    setInboxBusy(item.id);
    const r = await fetch(decideUrl(item), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(decideBody(item.entityType, approve, note)),
    });
    const j = await r.json().catch(() => ({}));
    setInboxBusy(null);
    if (!r.ok) {
      appAlert(j.error ?? "Quyết định thất bại");
      return;
    }
    loadInbox();
    load();
  }

  async function getOrCreateApprovalId(g: FloorGroup): Promise<number | null> {
    if (g.approvalId) return g.approvalId;
    const r = await fetch("/api/floor-approvals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sheetTypeId: g.sheetTypeId, floorLabel: g.floorLabel }),
    });
    if (!r.ok) {
      appAlert((await r.json().catch(() => null))?.error ?? "Lỗi tạo biên bản");
      return null;
    }
    const j = await r.json();
    // Cập nhật local state để lần sau không phải tạo lại
    setPending((p) =>
      p.map((x) =>
        x.sheetTypeId === g.sheetTypeId && x.floorLabel === g.floorLabel
          ? { ...x, approvalId: j.id }
          : x,
      ),
    );
    return j.id;
  }

  async function loadDocs(approvalId: number, label: string) {
    setOpenDocs({ approvalId, label });
    setDocs([]);
    setShowLinkForm(false);
    setLinkInput("");
    setLinkCaption("");
    const r = await fetch(`/api/floor-approvals/${approvalId}/documents`);
    if (r.ok) setDocs((await r.json()).documents ?? []);
  }

  async function submitLink() {
    const approvalId = openDocs?.approvalId;
    if (!approvalId || !linkInput.trim()) return;
    setBusy(`upload-${approvalId}`);
    const r = await fetch(`/api/floor-approvals/${approvalId}/documents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: linkInput.trim(), caption: linkCaption.trim() || null }),
    });
    setBusy(null);
    if (!r.ok) {
      appAlert((await r.json().catch(() => null))?.error ?? "Thêm link thất bại");
      return;
    }
    const bumpDoc = (list: FloorGroup[]) =>
      list.map((g) => (g.approvalId === approvalId ? { ...g, docCount: g.docCount + 1 } : g));
    setPending(bumpDoc);
    setApproved(bumpDoc);
    setLinkInput("");
    setLinkCaption("");
    setShowLinkForm(false);
    loadDocs(approvalId, openDocs.label);
  }

  async function openDocsForGroup(g: FloorGroup) {
    const approvalId = await getOrCreateApprovalId(g);
    if (!approvalId) return;
    loadDocs(approvalId, g.wpName ?? `${g.sheetType} · ${g.floorLabel}`);
  }

  function pickFile(approvalId: number) {
    uploadApprovalRef.current = approvalId;
    fileRef.current?.click();
  }

  async function pickFileForGroup(g: FloorGroup) {
    const approvalId = await getOrCreateApprovalId(g);
    if (!approvalId) return;
    uploadApprovalRef.current = approvalId;
    fileRef.current?.click();
  }

  async function openLinkFormForGroup(g: FloorGroup) {
    const approvalId = await getOrCreateApprovalId(g);
    if (!approvalId) return;
    setOpenDocs({ approvalId, label: g.wpName ?? `${g.sheetType} · ${g.floorLabel}` });
    setDocs([]);
    setShowLinkForm(true);
    setLinkInput("");
    setLinkCaption("");
    const r = await fetch(`/api/floor-approvals/${approvalId}/documents`);
    if (r.ok) setDocs((await r.json()).documents ?? []);
  }

  async function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const approvalId = uploadApprovalRef.current;
    e.target.value = "";
    if (!file || !approvalId) return;
    const fd = new FormData();
    fd.append("file", file);
    setBusy(`upload-${approvalId}`);
    const r = await fetch(`/api/floor-approvals/${approvalId}/documents`, {
      method: "POST",
      body: fd,
    });
    setBusy(null);
    if (!r.ok) {
      appAlert((await r.json().catch(() => null))?.error ?? "Upload thất bại");
      return;
    }
    const bumpDoc = (list: FloorGroup[]) =>
      list.map((g) => (g.approvalId === approvalId ? { ...g, docCount: g.docCount + 1 } : g));
    setPending(bumpDoc);
    setApproved(bumpDoc);
    if (openDocs?.approvalId === approvalId) loadDocs(approvalId, openDocs.label);
  }

  async function deleteDoc(docId: number) {
    if (!(await appConfirm("Xoá biên bản này?", { danger: true, confirmLabel: "Xoá" }))) return;
    const r = await fetch(`/api/documents/${docId}`, { method: "DELETE" });
    if (!r.ok) {
      appAlert((await r.json().catch(() => null))?.error ?? "Không xoá được");
      return;
    }
    setDocs((d) => d.filter((x) => x.id !== docId));
    if (openDocs) {
      const { approvalId, label } = openDocs;
      const dropDoc = (list: FloorGroup[]) =>
        list.map((g) =>
          g.approvalId === approvalId ? { ...g, docCount: Math.max(0, g.docCount - 1) } : g,
        );
      setPending(dropDoc);
      setApproved(dropDoc);
      loadDocs(approvalId, label);
    }
  }

  async function approveFloor(g: FloorGroup) {
    const key = `${g.sheetTypeId}-${g.floorLabel}`;
    if (
      !(await appConfirm(
        `Duyệt nghiệm thu tầng ${g.floorLabel} — hệ ${g.sheetType}?\n(${g.totalTasks} task sẽ được đánh dấu đã nghiệm thu)`,
        { confirmLabel: "Duyệt nghiệm thu" },
      ))
    )
      return;
    setBusy(`approve-${key}`);
    const r = await fetch("/api/approvals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sheetTypeId: g.sheetTypeId, floorLabel: g.floorLabel }),
    });
    setBusy(null);
    if (!r.ok) {
      appAlert((await r.json().catch(() => null))?.error ?? "Duyệt thất bại");
      return;
    }
    load();
  }

  async function unapproveFloor(g: FloorGroup) {
    if (!g.approvalId) return;
    if (
      !(await appConfirm(
        `Huỷ nghiệm thu tầng ${g.floorLabel} — hệ ${g.sheetType}?\nBiên bản đã đính kèm sẽ được giữ lại.`,
        { danger: true, confirmLabel: "Huỷ nghiệm thu" },
      ))
    )
      return;
    setBusy(`unapprove-${g.approvalId}`);
    const r = await fetch(`/api/floor-approvals/${g.approvalId}`, { method: "DELETE" });
    setBusy(null);
    if (!r.ok) {
      appAlert((await r.json().catch(() => null))?.error ?? "Không huỷ được");
      return;
    }
    load();
  }

  const pendingSheetOptions = useMemo(
    () => Array.from(new Set(pending.map((g) => g.sheetType))).map((s) => ({ value: s, label: s })),
    [pending],
  );
  const approvedSheetOptions = useMemo(
    () =>
      Array.from(new Set(approved.map((g) => g.sheetType))).map((s) => ({ value: s, label: s })),
    [approved],
  );
  const docFilterOptions = [
    { value: "has", label: "Đã có biên bản" },
    { value: "none", label: "Chưa có biên bản" },
  ];
  const pendingFilters: ToolbarFilter<FloorGroup>[] = [
    { key: "he", label: "Hệ", options: pendingSheetOptions, getValue: (g) => g.sheetType },
    {
      key: "status",
      label: "Trạng thái",
      options: [
        { value: "eligible", label: "Đủ điều kiện duyệt" },
        { value: "waiting", label: "Đang chờ" },
      ],
      getValue: (g) => (g.doneTasks === g.totalTasks ? "eligible" : "waiting"),
    },
    {
      key: "doc",
      label: "Biên bản",
      options: docFilterOptions,
      getValue: (g) => (g.docCount > 0 ? "has" : "none"),
    },
    { key: "pct", label: "% tiến độ", options: PCT_OPTIONS, getValue: pctBucketOf },
  ];
  const approvedFilters: ToolbarFilter<FloorGroup>[] = [
    { key: "he", label: "Hệ", options: approvedSheetOptions, getValue: (g) => g.sheetType },
    {
      key: "doc",
      label: "Biên bản",
      options: docFilterOptions,
      getValue: (g) => (g.docCount > 0 ? "has" : "none"),
    },
    { key: "pct", label: "% tiến độ", options: PCT_OPTIONS, getValue: pctBucketOf },
  ];
  const floorSort = [{ key: "floor", label: "Tầng", compare: compareFloorGroup }];

  if (loading) return <PageSkeleton />;

  function row(g: FloorGroup, isPending: boolean, query = "") {
    const key = `${g.sheetTypeId}-${g.floorLabel}`;
    const isBusy =
      busy === `approve-${key}` ||
      busy === `unapprove-${g.approvalId}` ||
      busy === `upload-${g.approvalId}`;
    const allDone = g.doneTasks === g.totalTasks;
    const pct = g.totalTasks > 0 ? Math.round((g.doneTasks / g.totalTasks) * 100) : 0;

    return (
      <tr
        key={key}
        className="border-b border-zinc-800/50 odd:bg-zinc-900/50 even:bg-zinc-800/20 hover:bg-zinc-700/40 transition-colors"
      >
        <td className="p-3 font-medium text-sm">{highlightMatch(g.sheetType, query)}</td>
        <td className="p-3 text-sm">{highlightMatch(g.floorLabel, query)}</td>
        <td className="p-3 text-sm text-zinc-300">
          {g.wpName ? highlightMatch(g.wpName, query) : "—"}
        </td>
        <td className="p-3">
          <div className="flex items-center gap-2">
            <div className="w-20 h-1.5 bg-zinc-700 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${allDone ? "bg-emerald-500" : "bg-blue-500"}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span
              className={`text-xs font-medium ${allDone ? "text-emerald-400" : "text-zinc-400"}`}
            >
              {g.doneTasks}/{g.totalTasks}
              {allDone && <CheckCircle2 className="w-3 h-3 inline ml-1" />}
            </span>
          </div>
        </td>
        {!isPending && (
          <td className="p-3 text-xs text-zinc-400">
            {g.approvedByName ? `${g.approvedByName}` : "—"}
            {g.approvedAt && (
              <span className="block text-zinc-400">{formatDateVN(g.approvedAt)}</span>
            )}
          </td>
        )}
        {/* Cột Biên bản — hiện cho cả pending và approved */}
        <td className="p-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => openDocsForGroup(g)}
              disabled={isBusy}
              className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg border transition ${
                g.docCount > 0
                  ? "bg-emerald-950 border-emerald-900 text-emerald-200 hover:bg-emerald-900"
                  : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:bg-zinc-700"
              }`}
            >
              <Paperclip className="w-3 h-3" /> {g.docCount} biên bản
            </button>
            <button
              onClick={() => pickFileForGroup(g)}
              disabled={isBusy}
              title="Upload PDF/ảnh"
              aria-label="Upload PDF/ảnh"
              className="flex items-center gap-1 text-xs bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 border border-zinc-700 rounded-lg px-2 py-1 transition"
            >
              <Upload className="w-3 h-3" />
            </button>
            <button
              onClick={() => openLinkFormForGroup(g)}
              disabled={isBusy}
              title="Thêm link"
              aria-label="Thêm link"
              className="flex items-center gap-1 text-xs bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 border border-zinc-700 rounded-lg px-2 py-1 transition"
            >
              <Link2 className="w-3 h-3" />
            </button>
          </div>
        </td>
        {/* Cột hành động */}
        <td className="p-3">
          <div className="flex gap-1.5 flex-wrap items-center">
            {isPending ? (
              canApprove && allDone ? (
                <button
                  onClick={() => approveFloor(g)}
                  disabled={isBusy}
                  className="flex items-center gap-1 text-xs bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-on-accent rounded-lg px-2.5 py-1.5 transition font-medium"
                >
                  <CheckSquare className="w-3 h-3" /> Duyệt nghiệm thu
                </button>
              ) : (
                <span className="flex items-center gap-1 text-xs text-zinc-400">
                  <Clock className="w-3 h-3" /> Chờ {g.totalTasks - g.doneTasks} task
                </span>
              )
            ) : (
              canApprove &&
              g.approvalId && (
                <button
                  onClick={() => unapproveFloor(g)}
                  disabled={isBusy}
                  className="text-xs bg-red-700 hover:bg-red-600 disabled:opacity-50 text-on-accent rounded-lg px-2 py-1 transition"
                >
                  Huỷ NT
                </button>
              )
            )}
          </div>
        </td>
      </tr>
    );
  }

  // Biến thể card cho màn hình <640px — cùng logic với row(), chỉ đổi phần hiển thị
  function card(g: FloorGroup, isPending: boolean) {
    const key = `${g.sheetTypeId}-${g.floorLabel}`;
    const isBusy =
      busy === `approve-${key}` ||
      busy === `unapprove-${g.approvalId}` ||
      busy === `upload-${g.approvalId}`;
    const allDone = g.doneTasks === g.totalTasks;
    const pct = g.totalTasks > 0 ? Math.round((g.doneTasks / g.totalTasks) * 100) : 0;

    return (
      <div key={key} className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 space-y-2.5">
        <div>
          <div className="font-semibold text-sm">
            {g.sheetType} · Tầng {g.floorLabel}
          </div>
          {g.wpName && <div className="text-xs text-zinc-400 mt-0.5">{g.wpName}</div>}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-zinc-700 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${allDone ? "bg-emerald-500" : "bg-blue-500"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span
            className={`text-xs font-medium shrink-0 ${allDone ? "text-emerald-400" : "text-zinc-400"}`}
          >
            {g.doneTasks}/{g.totalTasks}
            {allDone && <CheckCircle2 className="w-3 h-3 inline ml-1" />}
          </span>
        </div>

        {!isPending && (
          <div className="text-xs text-zinc-400">
            {g.approvedByName ? `Duyệt bởi ${g.approvedByName}` : "—"}
            {g.approvedAt && <span> · {formatDateVN(g.approvedAt)}</span>}
          </div>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => openDocsForGroup(g)}
            disabled={isBusy}
            className={`flex items-center gap-1 text-xs px-2.5 rounded-lg border transition min-h-[40px] ${
              g.docCount > 0
                ? "bg-emerald-950 border-emerald-900 text-emerald-200"
                : "bg-zinc-800 border-zinc-700 text-zinc-400"
            }`}
          >
            <Paperclip className="w-3.5 h-3.5" /> {g.docCount} biên bản
          </button>
          <button
            onClick={() => pickFileForGroup(g)}
            disabled={isBusy}
            title="Upload PDF/ảnh"
            aria-label="Upload PDF/ảnh"
            className="flex items-center justify-center min-w-[40px] min-h-[40px] bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 border border-zinc-700 rounded-lg transition"
          >
            <Upload className="w-4 h-4" />
          </button>
          <button
            onClick={() => openLinkFormForGroup(g)}
            disabled={isBusy}
            title="Thêm link"
            aria-label="Thêm link"
            className="flex items-center justify-center min-w-[40px] min-h-[40px] bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 border border-zinc-700 rounded-lg transition"
          >
            <Link2 className="w-4 h-4" />
          </button>
        </div>

        {isPending ? (
          canApprove && allDone ? (
            <button
              onClick={() => approveFloor(g)}
              disabled={isBusy}
              className="w-full flex items-center justify-center gap-1.5 text-sm bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-on-accent rounded-lg py-3 font-medium transition min-h-[44px]"
            >
              <CheckSquare className="w-4 h-4" /> Duyệt nghiệm thu
            </button>
          ) : (
            <div className="flex items-center justify-center gap-1 text-xs text-zinc-400 py-2">
              <Clock className="w-3.5 h-3.5" /> Chờ {g.totalTasks - g.doneTasks} task
            </div>
          )
        ) : (
          canApprove &&
          g.approvalId && (
            <button
              onClick={() => unapproveFloor(g)}
              disabled={isBusy}
              className="w-full text-sm bg-red-700 hover:bg-red-600 disabled:opacity-50 text-on-accent rounded-lg py-3 transition min-h-[44px]"
            >
              Huỷ NT
            </button>
          )
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <input
        ref={fileRef}
        type="file"
        accept="application/pdf,image/*"
        className="hidden"
        onChange={onFileChosen}
      />
      <AppHeader />

      <main className="p-4 sm:p-6 space-y-8">
        {/* Chờ tôi duyệt — hộp thư hợp nhất M46 PR3 (VO/IPC/đề xuất/nghiệm thu task).
            Chỉ hiện khi có ít nhất 1 mục — trống nghĩa là chưa cấu hình flow nào (PR4). */}
        {inbox.length > 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl">
            <div className="p-4 border-b border-zinc-800">
              <h2 className="font-semibold text-sm flex items-center gap-2">
                <Inbox className="w-4 h-4 text-sky-400" /> Chờ tôi duyệt ({inbox.length})
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Phát sinh/thanh toán/đề xuất/nghiệm thu đang chờ đúng bước duyệt của bạn.
              </p>
            </div>
            <div className="divide-y divide-zinc-800/70">
              {inbox.map((it) => {
                const deadline =
                  it.slaDays != null
                    ? new Date(new Date(it.createdAt).getTime() + it.slaDays * 86400000)
                    : null;
                const overdue = deadline != null && deadline.getTime() < Date.now();
                const isBusy = inboxBusy === it.id;
                return (
                  <div
                    key={it.id}
                    className="p-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 shrink-0">
                          {ENTITY_TYPE_LABEL[it.entityType]}
                        </span>
                        <a
                          href={it.linkUrl}
                          className="text-sm font-medium hover:underline truncate"
                        >
                          {it.label}
                        </a>
                      </div>
                      <div className="text-xs text-zinc-400 mt-0.5">
                        Bước {it.currentSeq} · vai trò {it.stepRole}
                        {it.amount != null && <> · {formatVnd(it.amount)}</>}
                        {deadline && (
                          <span className={overdue ? "text-red-400 font-medium" : ""}>
                            {" "}
                            · hạn {formatDateVN(deadline)}
                            {overdue && " (quá hạn)"}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => decideInboxItem(it, true)}
                        disabled={isBusy}
                        className="flex items-center gap-1 text-xs bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-on-accent rounded-lg px-2.5 py-1.5 transition font-medium"
                      >
                        <ThumbsUp className="w-3 h-3" /> Duyệt
                      </button>
                      <button
                        onClick={() => decideInboxItem(it, false)}
                        disabled={isBusy}
                        className="flex items-center gap-1 text-xs bg-red-700 hover:bg-red-600 disabled:opacity-50 text-on-accent rounded-lg px-2.5 py-1.5 transition"
                      >
                        <ThumbsDown className="w-3 h-3" /> Từ chối
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Chờ nghiệm thu */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl">
          <div className="p-4 border-b border-zinc-800">
            <h2 className="font-semibold text-sm">Chờ nghiệm thu ({pending.length} tầng · hệ)</h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Chỉ duyệt được khi tất cả task trong tầng đạt 100%
            </p>
          </div>
          <TableToolbar
            data={pending}
            searchFields={(g) => [g.sheetType, g.floorLabel, g.wpName ?? ""]}
            filters={pendingFilters}
            sorts={floorSort}
            defaultSort={{ key: "floor", dir: "asc" }}
            urlPrefix="pending"
          >
            {(filtered, toolbar, sort, query) => (
              <>
                {toolbar}
                <div
                  className="overflow-x-auto hidden sm:block"
                  tabIndex={0}
                  role="region"
                  aria-label="Bảng chờ nghiệm thu"
                >
                  <table className="w-full text-sm min-w-[560px]">
                    <thead>
                      <tr className="text-xs text-zinc-400 border-b border-zinc-800">
                        <th className="text-left p-3">HỆ</th>
                        <th className="text-left p-3">
                          <SortableHeader label="TẦNG" sortKey="floor" sort={sort} />
                        </th>
                        <th className="text-left p-3">TÊN CÔNG VIỆC</th>
                        <th className="text-left p-3">TIẾN ĐỘ</th>
                        <th className="text-left p-3">BIÊN BẢN</th>
                        <th className="text-left p-3"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((g) => row(g, true, query))}
                      {filtered.length === 0 && pending.length > 0 && (
                        <tr>
                          <td colSpan={6} className="p-10 text-center text-zinc-400">
                            <SearchX className="w-8 h-8 mx-auto mb-2 opacity-30" />
                            Không có tầng/hệ nào khớp bộ lọc.
                          </td>
                        </tr>
                      )}
                      {pending.length === 0 && (
                        <tr>
                          <td colSpan={6} className="p-8 text-center text-zinc-400">
                            Không có tầng nào chờ nghiệm thu — tất cả đã được duyệt hoặc chưa đủ
                            tiến độ.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {/* Card view mobile (<640px) — dùng cùng dữ liệu đã lọc/sort ở trên */}
                <div className="sm:hidden p-3 space-y-2">
                  {filtered.map((g) => card(g, true))}
                  {filtered.length === 0 && pending.length > 0 && (
                    <p className="p-4 text-center text-sm text-zinc-400">
                      Không có tầng/hệ nào khớp bộ lọc.
                    </p>
                  )}
                  {pending.length === 0 && (
                    <p className="p-4 text-center text-sm text-zinc-400">
                      Không có tầng nào chờ nghiệm thu — tất cả đã được duyệt hoặc chưa đủ tiến độ.
                    </p>
                  )}
                </div>
              </>
            )}
          </TableToolbar>
        </div>

        {/* Đã nghiệm thu */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl">
          <div className="p-4 border-b border-zinc-800">
            <h2 className="font-semibold text-sm text-emerald-400">
              Đã nghiệm thu ({approved.length} tầng · hệ)
            </h2>
          </div>
          <TableToolbar
            data={approved}
            searchFields={(g) => [g.sheetType, g.floorLabel, g.wpName ?? ""]}
            filters={approvedFilters}
            sorts={floorSort}
            defaultSort={{ key: "floor", dir: "asc" }}
            urlPrefix="approved"
          >
            {(filtered, toolbar, sort, query) => (
              <>
                {toolbar}
                <div
                  className="overflow-x-auto hidden sm:block"
                  tabIndex={0}
                  role="region"
                  aria-label="Bảng đã nghiệm thu"
                >
                  <table className="w-full text-sm min-w-[560px]">
                    <thead>
                      <tr className="text-xs text-zinc-400 border-b border-zinc-800">
                        <th className="text-left p-3">HỆ</th>
                        <th className="text-left p-3">
                          <SortableHeader label="TẦNG" sortKey="floor" sort={sort} />
                        </th>
                        <th className="text-left p-3">TÊN CÔNG VIỆC</th>
                        <th className="text-left p-3">TIẾN ĐỘ</th>
                        <th className="text-left p-3">NGƯỜI DUYỆT</th>
                        <th className="text-left p-3">BIÊN BẢN</th>
                        <th className="text-left p-3"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((g) => row(g, false, query))}
                      {filtered.length === 0 && approved.length > 0 && (
                        <tr>
                          <td colSpan={7} className="p-10 text-center text-zinc-400">
                            <SearchX className="w-8 h-8 mx-auto mb-2 opacity-30" />
                            Không có tầng/hệ nào khớp bộ lọc.
                          </td>
                        </tr>
                      )}
                      {approved.length === 0 && (
                        <tr>
                          <td colSpan={7} className="p-8 text-center text-zinc-400">
                            Chưa có tầng nào được nghiệm thu.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {/* Card view mobile (<640px) — dùng cùng dữ liệu đã lọc/sort ở trên */}
                <div className="sm:hidden p-3 space-y-2">
                  {filtered.map((g) => card(g, false))}
                  {filtered.length === 0 && approved.length > 0 && (
                    <p className="p-4 text-center text-sm text-zinc-400">
                      Không có tầng/hệ nào khớp bộ lọc.
                    </p>
                  )}
                  {approved.length === 0 && (
                    <p className="p-4 text-center text-sm text-zinc-400">
                      Chưa có tầng nào được nghiệm thu.
                    </p>
                  )}
                </div>
              </>
            )}
          </TableToolbar>
        </div>
      </main>

      {/* Modal danh sách biên bản */}
      {openDocs && (
        <Modal onClose={() => setOpenDocs(null)} className="max-w-lg max-h-[80vh] overflow-auto">
          <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <FileText className="w-4 h-4 text-emerald-400" /> Biên bản — {openDocs.label}
            </h3>
            <button
              onClick={() => setOpenDocs(null)}
              aria-label="Đóng"
              className="text-zinc-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="p-4 space-y-2">
            {docs.map((d) => {
              const isImg = d.mimeType?.startsWith("image/");
              const isLink = !!d.linkUrl;
              const href = isLink ? d.linkUrl! : `/api/documents/${d.id}`;
              return (
                <div key={d.id} className="bg-zinc-800/60 rounded-lg overflow-hidden">
                  {/* Preview ảnh inline */}
                  {isImg && !isLink && (
                    <a href={href} target="_blank" rel="noreferrer" className="block">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={href}
                        alt={d.originalName ?? ""}
                        className="w-full max-h-48 object-cover object-top"
                      />
                    </a>
                  )}
                  <div className="flex items-center gap-2 px-3 py-2">
                    {isLink ? (
                      <Link2 className="w-4 h-4 text-blue-400 shrink-0" />
                    ) : isImg ? (
                      <ImageIcon className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : (
                      <FileText className="w-4 h-4 text-zinc-400 shrink-0" />
                    )}
                    <a
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      className={`text-sm hover:underline truncate flex-1 ${isLink ? "text-blue-400" : "text-emerald-400"}`}
                    >
                      {d.caption || d.originalName || (isLink ? d.linkUrl : `Tài liệu #${d.id}`)}
                    </a>
                    {!isLink && d.sizeBytes != null && (
                      <span className="text-xs text-zinc-400 shrink-0">{fmtSize(d.sizeBytes)}</span>
                    )}
                    <span className="text-xs text-zinc-400 shrink-0">{d.uploaderName ?? "—"}</span>
                    {canApprove && (
                      <button
                        onClick={() => deleteDoc(d.id)}
                        aria-label="Xoá biên bản"
                        className="text-zinc-500 hover:text-red-400 shrink-0"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            {docs.length === 0 && (
              <p className="text-sm text-zinc-400 text-center py-4">Chưa có biên bản nào.</p>
            )}

            {/* Form thêm link */}
            {showLinkForm ? (
              <div className="space-y-2 pt-1">
                <input
                  value={linkInput}
                  onChange={(e) => setLinkInput(e.target.value)}
                  placeholder="https://drive.google.com/..."
                  className="w-full bg-zinc-800 border border-zinc-600 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500"
                />
                <input
                  value={linkCaption}
                  onChange={(e) => setLinkCaption(e.target.value)}
                  placeholder="Tên hiển thị (tuỳ chọn)"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500"
                />
                <div className="flex gap-2">
                  <button
                    onClick={submitLink}
                    disabled={!linkInput.trim() || !!busy}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg py-2 text-sm font-medium transition text-on-accent"
                  >
                    Thêm link
                  </button>
                  <button
                    onClick={() => setShowLinkForm(false)}
                    className="px-4 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-sm"
                  >
                    Huỷ
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => pickFile(openDocs.approvalId)}
                  disabled={!!busy}
                  className="flex-1 flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 border border-zinc-700 rounded-lg px-3 py-2 text-sm transition"
                >
                  <Upload className="w-4 h-4" /> Upload PDF/ảnh
                </button>
                <button
                  onClick={() => setShowLinkForm(true)}
                  disabled={!!busy}
                  className="flex-1 flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 border border-zinc-700 rounded-lg px-3 py-2 text-sm transition"
                >
                  <Link2 className="w-4 h-4" /> Thêm link
                </button>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
