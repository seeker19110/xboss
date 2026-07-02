"use client";
import { useCallback, useEffect, useRef, useState } from "react";
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
} from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import { Modal, appAlert, appConfirm } from "@/app/components/dialogs";
import { PageSkeleton } from "@/app/components/Skeleton";

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
const fmtDate = (s: string) =>
  new Date(s).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });

export default function ApprovalsPage() {
  const [pending, setPending] = useState<FloorGroup[]>([]);
  const [approved, setApproved] = useState<FloorGroup[]>([]);
  const [canApprove, setCanApprove] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
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
      window.location.href = "/login";
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

  useEffect(() => {
    load();
  }, [load]);

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

  if (loading) return <PageSkeleton />;

  function row(g: FloorGroup, isPending: boolean) {
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
        <td className="p-3 font-medium text-sm">{g.sheetType}</td>
        <td className="p-3 text-sm">{g.floorLabel}</td>
        <td className="p-3 text-sm text-zinc-300">{g.wpName ?? "—"}</td>
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
            {g.approvedAt && <span className="block text-zinc-600">{fmtDate(g.approvedAt)}</span>}
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
                  ? "bg-emerald-950/60 border-emerald-900 text-emerald-300 hover:bg-emerald-900/60"
                  : "bg-zinc-800 border-zinc-700 text-zinc-500 hover:bg-zinc-700"
              }`}
            >
              <Paperclip className="w-3 h-3" /> {g.docCount} biên bản
            </button>
            <button
              onClick={() => pickFileForGroup(g)}
              disabled={isBusy}
              title="Upload PDF/ảnh"
              className="flex items-center gap-1 text-xs bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 border border-zinc-700 rounded-lg px-2 py-1 transition"
            >
              <Upload className="w-3 h-3" />
            </button>
            <button
              onClick={() => openLinkFormForGroup(g)}
              disabled={isBusy}
              title="Thêm link"
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
                  className="flex items-center gap-1 text-xs bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-lg px-2.5 py-1.5 transition font-medium"
                >
                  <CheckSquare className="w-3 h-3" /> Duyệt nghiệm thu
                </button>
              ) : (
                <span className="flex items-center gap-1 text-xs text-zinc-600">
                  <Clock className="w-3 h-3" /> Chờ {g.totalTasks - g.doneTasks} task
                </span>
              )
            ) : (
              canApprove &&
              g.approvalId && (
                <button
                  onClick={() => unapproveFloor(g)}
                  disabled={isBusy}
                  className="text-xs bg-red-950/60 hover:bg-red-900/60 disabled:opacity-50 border border-red-900 text-red-300 rounded-lg px-2 py-1 transition"
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
        {/* Chờ nghiệm thu */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl">
          <div className="p-4 border-b border-zinc-800">
            <h2 className="font-semibold text-sm">Chờ nghiệm thu ({pending.length} tầng · hệ)</h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Chỉ duyệt được khi tất cả task trong tầng đạt 100%
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead>
                <tr className="text-xs text-zinc-400 border-b border-zinc-800">
                  <th className="text-left p-3">HỆ</th>
                  <th className="text-left p-3">TẦNG</th>
                  <th className="text-left p-3">TÊN CÔNG VIỆC</th>
                  <th className="text-left p-3">TIẾN ĐỘ</th>
                  <th className="text-left p-3">BIÊN BẢN</th>
                  <th className="text-left p-3"></th>
                </tr>
              </thead>
              <tbody>
                {pending.map((g) => row(g, true))}
                {pending.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-zinc-500">
                      Không có tầng nào chờ nghiệm thu — tất cả đã được duyệt hoặc chưa đủ tiến độ.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Đã nghiệm thu */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl">
          <div className="p-4 border-b border-zinc-800">
            <h2 className="font-semibold text-sm text-emerald-400">
              Đã nghiệm thu ({approved.length} tầng · hệ)
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead>
                <tr className="text-xs text-zinc-400 border-b border-zinc-800">
                  <th className="text-left p-3">HỆ</th>
                  <th className="text-left p-3">TẦNG</th>
                  <th className="text-left p-3">TÊN CÔNG VIỆC</th>
                  <th className="text-left p-3">TIẾN ĐỘ</th>
                  <th className="text-left p-3">NGƯỜI DUYỆT</th>
                  <th className="text-left p-3">BIÊN BẢN</th>
                  <th className="text-left p-3"></th>
                </tr>
              </thead>
              <tbody>
                {approved.map((g) => row(g, false))}
                {approved.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-zinc-500">
                      Chưa có tầng nào được nghiệm thu.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
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
                      <span className="text-xs text-zinc-500 shrink-0">{fmtSize(d.sizeBytes)}</span>
                    )}
                    <span className="text-xs text-zinc-600 shrink-0">{d.uploaderName ?? "—"}</span>
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
              <p className="text-sm text-zinc-500 text-center py-4">Chưa có biên bản nào.</p>
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
                    className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg py-2 text-sm font-medium transition"
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
