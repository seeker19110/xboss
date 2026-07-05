"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Plus, X, FileDown, FileSpreadsheet, Receipt } from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import EmptyState from "@/app/components/EmptyState";
import { PageSkeleton } from "@/app/components/Skeleton";
import { Modal, appConfirm, appPrompt } from "@/app/components/dialogs";
import { showToast } from "@/app/components/Toast";
import { fetchMe, type Me } from "@/app/lib/me";

type CertStatus = "draft" | "submitted" | "approved" | "rejected";
const STATUS_LABEL: Record<CertStatus, string> = {
  draft: "Nháp",
  submitted: "Đã trình",
  approved: "Được duyệt",
  rejected: "Từ chối",
};
const STATUS_BADGE: Record<CertStatus, string> = {
  draft: "bg-zinc-800 text-zinc-300",
  submitted: "bg-amber-900/40 text-amber-300",
  approved: "bg-emerald-900/40 text-emerald-300",
  rejected: "bg-rose-900/40 text-rose-300",
};

type CertItem = {
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
type Cert = {
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
  items: CertItem[];
};
type Contract = {
  id: number;
  code: string;
  title: string;
  kind: string;
  value: number;
  addendaTotal: number;
  paid: number;
};

function fmtVND(n: number) {
  if (!n) return "—";
  return Math.round(n).toLocaleString("vi-VN") + " đ";
}

export default function PaymentCertsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <PaymentCertsInner />
    </Suspense>
  );
}

function PaymentCertsInner() {
  const searchParams = useSearchParams();
  const preselectContractId = Number(searchParams.get("contractId")) || null;

  const [me, setMe] = useState<Me | null>(null);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [contractId, setContractId] = useState<number | "">("");
  const [certs, setCerts] = useState<Cert[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);

  const canManage = me?.role === "admin" || me?.role === "pm";

  useEffect(() => {
    Promise.all([fetchMe(), fetch("/api/contracts").then((r) => (r.ok ? r.json() : null))])
      .then(([meData, c]) => {
        if (!meData) return;
        setMe(meData);
        const list: Contract[] = c?.contracts ?? [];
        setContracts(list);
        if (preselectContractId && list.some((x) => x.id === preselectContractId))
          setContractId(preselectContractId);
        else if (list.length > 0) setContractId(list[0].id);
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function loadCerts(cid: number) {
    return fetch(`/api/payment-certs?contractId=${cid}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setCerts(j?.certs ?? []));
  }

  useEffect(() => {
    if (contractId) loadCerts(contractId);
  }, [contractId]);

  async function refresh() {
    if (contractId) await loadCerts(contractId);
  }

  const contract = contracts.find((c) => c.id === contractId) ?? null;
  const contractValue = contract ? Number(contract.value) + Number(contract.addendaTotal) : 0;

  const approvedCumulative = useMemo(() => {
    const approved = certs.filter((c) => c.status === "approved");
    if (approved.length === 0) return 0;
    const latest = approved.reduce((a, b) => (a.periodNo > b.periodNo ? a : b));
    return latest.items.reduce((s, it) => s + Number(it.qtyCumulative) * Number(it.unitPrice), 0);
  }, [certs]);

  async function createCert() {
    if (!contractId) return;
    setCreating(true);
    try {
      const res = await fetch("/api/payment-certs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contractId }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        showToast(j?.error ?? "Không lập được đợt mới", "error");
        return;
      }
      await refresh();
      setSelectedId(j.id);
    } catch {
      showToast("Mất kết nối — kiểm tra mạng rồi thử lại", "error");
    } finally {
      setCreating(false);
    }
  }

  const selected = certs.find((c) => c.id === selectedId) ?? null;

  if (loading) return <PageSkeleton />;

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <AppHeader title="Thanh toán khối lượng" subtitle="Nghiệm thu KL theo đợt (IPC)" />

      <main className="p-4 sm:p-6 pb-24 space-y-4">
        {contracts.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="Chưa có hợp đồng nào"
            message="Tạo hợp đồng ở trang Hợp đồng trước khi lập đợt thanh toán."
          />
        ) : (
          <>
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-xs text-zinc-400">
                Hợp đồng
                <select
                  value={contractId}
                  onChange={(e) => {
                    setContractId(Number(e.target.value));
                    setSelectedId(null);
                  }}
                  className="mt-1 min-w-[260px] bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
                >
                  {contracts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} — {c.title}
                    </option>
                  ))}
                </select>
              </label>
              {canManage && (
                <button
                  onClick={createCert}
                  disabled={creating || !contractId}
                  className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 px-3 sm:px-4 py-2 rounded-lg text-sm font-semibold transition shrink-0"
                >
                  <Plus className="w-4 h-4" /> {creating ? "Đang lập…" : "Lập đợt mới"}
                </button>
              )}
            </div>

            {contract && (
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-xs text-zinc-400 uppercase tracking-wide">Giá trị HĐ</p>
                  <p className="text-lg font-semibold mt-1">{fmtVND(contractValue)}</p>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-xs text-zinc-400 uppercase tracking-wide">Luỹ kế đã duyệt</p>
                  <p
                    className={`text-lg font-semibold mt-1 ${approvedCumulative > contractValue ? "text-rose-300" : ""}`}
                  >
                    {fmtVND(approvedCumulative)}
                  </p>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-xs text-zinc-400 uppercase tracking-wide">% dùng</p>
                  <p className="text-lg font-semibold mt-1">
                    {contractValue > 0 ? Math.round((approvedCumulative / contractValue) * 100) : 0}
                    %
                  </p>
                </div>
              </div>
            )}

            {approvedCumulative > contractValue && contractValue > 0 && (
              <div className="bg-rose-950/40 border border-rose-900/60 rounded-xl px-4 py-3 text-xs text-rose-200">
                Luỹ kế đã duyệt vượt giá trị hợp đồng (gồm phụ lục) — kiểm tra lại phụ lục/VO trước
                khi lập đợt tiếp theo.
              </div>
            )}

            {certs.length === 0 ? (
              <EmptyState
                message='Chưa có đợt thanh toán nào. Bấm "Lập đợt mới" để bắt đầu.'
                compact
              />
            ) : (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                <div
                  className="overflow-x-auto"
                  tabIndex={0}
                  role="region"
                  aria-label="Bảng đợt thanh toán"
                >
                  <table className="w-full text-sm sm:min-w-[640px]">
                    <thead>
                      <tr className="text-xs text-zinc-400 border-b border-zinc-800">
                        <th className="text-left p-3">MÃ</th>
                        <th className="text-left p-3">ĐỢT</th>
                        <th className="text-left p-3 hidden sm:table-cell">NGƯỜI LẬP</th>
                        <th className="text-left p-3">TRẠNG THÁI</th>
                        <th className="text-right p-3"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {certs.map((c) => (
                        <tr
                          key={c.id}
                          onClick={() => setSelectedId(c.id)}
                          className="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/40 cursor-pointer"
                        >
                          <td className="p-3 font-mono text-xs">{c.code}</td>
                          <td className="p-3">
                            Đợt {c.periodNo}
                            {c.periodLabel && (
                              <span className="text-zinc-400"> · {c.periodLabel}</span>
                            )}
                          </td>
                          <td className="p-3 hidden sm:table-cell text-zinc-300">
                            {c.createdByName ?? "—"}
                          </td>
                          <td className="p-3">
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${STATUS_BADGE[c.status]}`}
                            >
                              {STATUS_LABEL[c.status]}
                            </span>
                          </td>
                          <td className="p-3 text-right">
                            {c.status === "approved" && (
                              <div className="flex justify-end gap-2">
                                <a
                                  href={`/api/payment-certs/${c.id}/pdf`}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  aria-label={`Xuất PDF đợt ${c.periodNo}`}
                                  className="text-zinc-400 hover:text-white"
                                >
                                  <FileDown className="w-4 h-4" />
                                </a>
                                <a
                                  href={`/api/payment-certs/${c.id}/excel`}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  aria-label={`Xuất Excel đợt ${c.periodNo}`}
                                  className="text-zinc-400 hover:text-white"
                                >
                                  <FileSpreadsheet className="w-4 h-4" />
                                </a>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {selected && (
        <CertDetailModal
          cert={selected}
          canManage={canManage}
          canDecide={!!(me?.role === "admin" || me?.role === "pm")}
          contractValue={contractValue}
          onClose={() => setSelectedId(null)}
          onSaved={refresh}
        />
      )}
    </div>
  );
}

function CertDetailModal({
  cert,
  canManage,
  canDecide,
  contractValue,
  onClose,
  onSaved,
}: {
  cert: Cert;
  canManage: boolean;
  canDecide: boolean;
  contractValue: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [qtys, setQtys] = useState<Record<number, string>>(
    Object.fromEntries(cert.items.map((it) => [it.id, String(it.qtyPeriod)])),
  );
  const [busy, setBusy] = useState(false);

  const canEdit = canManage && cert.status === "draft";

  const totals = useMemo(() => {
    const periodValue = cert.items.reduce(
      (s, it) => s + (Number(qtys[it.id]) || 0) * Number(it.unitPrice),
      0,
    );
    return periodValue;
  }, [cert.items, qtys]);

  async function saveItems() {
    setBusy(true);
    const res = await fetch(`/api/payment-certs/${cert.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: cert.items.map((it) => ({
          boqItemId: it.boqItemId,
          qtyPeriod: Number(qtys[it.id]) || 0,
        })),
      }),
    });
    setBusy(false);
    if (!res.ok) {
      showToast((await res.json().catch(() => null))?.error ?? "Lưu thất bại", "error");
      return;
    }
    onSaved();
  }

  async function submitCert() {
    if (!(await appConfirm(`Trình đợt ${cert.code} lên CĐT/TVGS?`))) return;
    setBusy(true);
    const res = await fetch(`/api/payment-certs/${cert.id}/submit`, { method: "POST" });
    setBusy(false);
    if (!res.ok) {
      showToast((await res.json().catch(() => null))?.error ?? "Trình thất bại", "error");
      return;
    }
    onSaved();
    onClose();
  }

  async function decide(decision: "approved" | "rejected") {
    let rejectReason: string | null = null;
    if (decision === "rejected") {
      rejectReason = await appPrompt("Lý do từ chối:");
      if (!rejectReason?.trim()) return;
    } else {
      // qty_cumulative của mỗi dòng trong đợt này đã là luỹ kế tính tới hết đợt này —
      // nếu duyệt, đây sẽ là luỹ kế mới của hợp đồng (thay cho luỹ kế đợt duyệt trước đó).
      const projectedCumulative = cert.items.reduce(
        (s, it) => s + Number(it.qtyCumulative) * Number(it.unitPrice),
        0,
      );
      const wouldBeOver = contractValue > 0 && projectedCumulative > contractValue;
      const label = wouldBeOver
        ? `Duyệt đợt ${cert.code}? CẢNH BÁO: luỹ kế sẽ vượt giá trị hợp đồng.`
        : `Duyệt đợt ${cert.code}?`;
      if (!(await appConfirm(label, { danger: wouldBeOver }))) return;
    }
    setBusy(true);
    const res = await fetch(`/api/payment-certs/${cert.id}/decide`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, rejectReason }),
    });
    setBusy(false);
    if (!res.ok) {
      showToast((await res.json().catch(() => null))?.error ?? "Quyết định thất bại", "error");
      return;
    }
    onSaved();
    onClose();
  }

  return (
    <Modal onClose={onClose} className="max-w-2xl">
      <div className="p-5 space-y-4 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold font-mono text-sm">{cert.code}</h2>
            <p className="text-sm text-zinc-300">
              Đợt {cert.periodNo} — {cert.contractCode}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${STATUS_BADGE[cert.status]}`}
            >
              {STATUS_LABEL[cert.status]}
            </span>
            <button onClick={onClose} aria-label="Đóng" className="text-zinc-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {cert.rejectReason && (
          <p className="text-xs text-rose-300">Lý do từ chối: {cert.rejectReason}</p>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-zinc-400 border-b border-zinc-800">
                <th className="text-left p-1.5">Mã</th>
                <th className="text-left p-1.5">Tên</th>
                <th className="text-right p-1.5">Đơn giá</th>
                <th className="text-right p-1.5">KL đợt này</th>
                <th className="text-right p-1.5">Luỹ kế</th>
              </tr>
            </thead>
            <tbody>
              {cert.items.map((it) => (
                <tr key={it.id} className="border-b border-zinc-800/60 last:border-0">
                  <td className="p-1.5 font-mono">{it.boqCode}</td>
                  <td className="p-1.5">
                    {it.boqName} <span className="text-zinc-500">({it.boqUnit})</span>
                  </td>
                  <td className="p-1.5 text-right">{fmtVND(it.unitPrice)}</td>
                  <td className="p-1.5 text-right">
                    {canEdit ? (
                      <input
                        type="number"
                        value={qtys[it.id] ?? ""}
                        onChange={(e) => setQtys((prev) => ({ ...prev, [it.id]: e.target.value }))}
                        aria-label={`KL đợt này dòng ${it.boqCode}`}
                        min={0}
                        className="w-20 bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-xs text-white text-right"
                      />
                    ) : (
                      it.qtyPeriod
                    )}
                  </td>
                  <td className="p-1.5 text-right">{it.qtyCumulative}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end text-sm font-semibold">
          Giá trị đợt này (tạm tính): {fmtVND(totals)}
        </div>

        <div className="flex flex-wrap gap-2 border-t border-zinc-800 pt-3">
          {canEdit && (
            <button
              onClick={saveItems}
              disabled={busy}
              className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-white text-xs font-medium px-3 py-2 rounded-lg"
            >
              Lưu khối lượng
            </button>
          )}
          {canManage && cert.status === "draft" && (
            <button
              onClick={submitCert}
              disabled={busy}
              className="bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white text-xs font-medium px-3 py-2 rounded-lg"
            >
              Trình lên CĐT/TVGS
            </button>
          )}
          {canDecide && cert.status === "submitted" && (
            <>
              <button
                onClick={() => decide("approved")}
                disabled={busy}
                className="bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white text-xs font-medium px-3 py-2 rounded-lg"
              >
                Duyệt
              </button>
              <button
                onClick={() => decide("rejected")}
                disabled={busy}
                className="bg-rose-800 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-medium px-3 py-2 rounded-lg"
              >
                Từ chối
              </button>
            </>
          )}
          {cert.status === "approved" && (
            <>
              <a
                href={`/api/payment-certs/${cert.id}/pdf`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-medium px-3 py-2 rounded-lg"
              >
                <FileDown className="w-3.5 h-3.5" /> PDF
              </a>
              <a
                href={`/api/payment-certs/${cert.id}/excel`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-medium px-3 py-2 rounded-lg"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" /> Excel
              </a>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
