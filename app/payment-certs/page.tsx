"use client";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Receipt } from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import MaskedValue from "@/app/components/MaskedValue";
import { mSum, mMul, mSumBy } from "@/app/lib/masked";
import EmptyState from "@/app/components/EmptyState";
import { PageSkeleton } from "@/app/components/Skeleton";
import { showToast } from "@/app/components/Toast";
import { fetchMe, type Me } from "@/app/lib/me";
import { Button, Card, Chip, StatCard } from "@/app/components/ui";
import CertDocument, {
  CertBottomActions,
  useCertDocument,
  fmtVND,
  STATUS_LABEL,
  STATUS_TONE,
  type Cert,
} from "@/app/payment-certs/_components/CertDocument";

type Contract = {
  id: number;
  code: string;
  title: string;
  kind: string;
  value: number;
  addendaTotal: number;
  paid: number;
};

export default function PaymentCertsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <PaymentCertsInner />
    </Suspense>
  );
}

// Bố cục master–detail (M124): danh sách đợt bên trái, chứng từ đang mở bên phải.
// Dưới lg chỉ hiện một trong hai (chọn đợt → chứng từ toàn màn hình, thanh đáy để đóng).
function PaymentCertsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectContractId = Number(searchParams.get("contractId")) || null;
  // Đợt đang mở đọc THẲNG từ URL (`?id=`) — reload/chia sẻ link giữ nguyên chứng từ.
  const selectedId = Number(searchParams.get("id")) || null;

  const [me, setMe] = useState<Me | null>(null);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [contractId, setContractId] = useState<number | "">("");
  const [certs, setCerts] = useState<Cert[]>([]);
  const [loading, setLoading] = useState(true);
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

  const loadCerts = useCallback((cid: number) => {
    return fetch(`/api/payment-certs?contractId=${cid}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setCerts(j?.certs ?? []));
  }, []);

  useEffect(() => {
    if (contractId) loadCerts(contractId);
  }, [contractId, loadCerts]);

  const refresh = useCallback(async () => {
    if (contractId) await loadCerts(contractId);
  }, [contractId, loadCerts]);

  /** Ghi hợp đồng/đợt đang chọn vào URL (không đẩy history, không nhảy về đầu trang). */
  const capNhatUrl = useCallback(
    (next: { contractId?: number | ""; id?: number | null }) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next.contractId !== undefined) {
        if (next.contractId) params.set("contractId", String(next.contractId));
        else params.delete("contractId");
      }
      if (next.id !== undefined) {
        if (next.id) params.set("id", String(next.id));
        else params.delete("id");
      }
      const qs = params.toString();
      router.replace(qs ? `?${qs}` : "/payment-certs", { scroll: false });
    },
    [router, searchParams],
  );

  const chonDot = useCallback((id: number | null) => capNhatUrl({ id }), [capNhatUrl]);
  const dongDot = useCallback(() => capNhatUrl({ id: null }), [capNhatUrl]);

  const contract = contracts.find((c) => c.id === contractId) ?? null;
  // M50 PR2: value/addendaTotal/unitPrice có thể bị che (null) với user thiếu viewPayments
  // — dùng mSum/mMul để giá trị dẫn xuất cũng "bị che" (null), không ngầm thành 0.
  const contractValue = contract ? mSum(contract.value, contract.addendaTotal) : null;

  const approvedCumulative = useMemo((): number | null => {
    const approved = certs.filter((c) => c.status === "approved");
    if (approved.length === 0) return 0;
    const latest = approved.reduce((a, b) => (a.periodNo > b.periodNo ? a : b));
    return mSumBy(latest.items, (it) => mMul(Number(it.qtyCumulative), it.unitPrice));
  }, [certs]);

  // Cảnh báo vượt giá trị HĐ: chỉ xác định được khi CẢ HAI vế không bị che — tránh vừa
  // cảnh báo sai (0 > 0) vừa nuốt cảnh báo thật khi giá trị bị ép về 0.
  const overContract =
    contractValue != null &&
    approvedCumulative != null &&
    contractValue > 0 &&
    approvedCumulative > contractValue;
  const pctUsed =
    contractValue == null || approvedCumulative == null
      ? null
      : contractValue > 0
        ? Math.round((approvedCumulative / contractValue) * 100)
        : 0;

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
      chonDot(j.id);
    } catch {
      showToast("Mất kết nối — kiểm tra mạng rồi thử lại", "error");
    } finally {
      setCreating(false);
    }
  }

  const selected = certs.find((c) => c.id === selectedId) ?? null;
  const viTri = certs.findIndex((c) => c.id === selectedId);

  const ctrl = useCertDocument({
    cert: selected,
    canManage,
    canDecide: canManage,
    contractValue,
    onSaved: refresh,
    onClose: dongDot,
  });

  if (loading) return <PageSkeleton />;

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <AppHeader
        title="Thanh toán khối lượng"
        subtitle="Nghiệm thu KL theo đợt (IPC)"
        bottomActions={selected ? <CertBottomActions ctrl={ctrl} /> : undefined}
      />

      <main className="p-4 sm:p-6 pb-24 space-y-4">
        {contracts.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="Chưa có hợp đồng nào"
            message="Tạo hợp đồng ở trang Hợp đồng trước khi lập đợt thanh toán."
          />
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-xs font-semibold text-zinc-300">
                Hợp đồng:
                <select
                  value={contractId}
                  onChange={(e) => {
                    const cid = Number(e.target.value);
                    setContractId(cid);
                    capNhatUrl({ contractId: cid, id: null });
                  }}
                  className="min-w-[260px] bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-base sm:text-sm text-zinc-100 outline-none focus:border-emerald-500 h-10 transition"
                >
                  {contracts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} — {c.title}
                    </option>
                  ))}
                </select>
              </label>
              {canManage && (
                <Button
                  icon={Plus}
                  variant="primary"
                  onClick={createCert}
                  disabled={creating || !contractId}
                >
                  {creating ? "Đang lập…" : "Lập đợt mới"}
                </Button>
              )}
            </div>

            {contract && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <StatCard
                  label="Giá trị hợp đồng"
                  value={<MaskedValue value={contractValue} format={fmtVND} />}
                  hint="Bao gồm phụ lục bổ sung"
                />
                <StatCard
                  label="Luỹ kế đã duyệt"
                  value={<MaskedValue value={approvedCumulative} format={fmtVND} />}
                  tone={overContract ? "danger" : "success"}
                  progress={pctUsed == null ? undefined : Math.min(100, pctUsed) / 100}
                  badge={pctUsed != null ? <Chip tone="neutral">{pctUsed}%</Chip> : undefined}
                />
                <StatCard
                  label="Số đợt thanh toán"
                  value={certs.length}
                  unit="đợt"
                  tone="info"
                  hint={`Đã duyệt: ${certs.filter((c) => c.status === "approved").length}`}
                />
              </div>
            )}

            {overContract && (
              <div className="bento-card border-rose-900/60 bg-rose-950/20 px-4 py-3 text-xs text-rose-200">
                Luỹ kế đã duyệt vượt giá trị hợp đồng (gồm phụ lục) — kiểm tra lại phụ lục/VO trước
                khi lập đợt tiếp theo.
              </div>
            )}

            <div className="grid lg:grid-cols-[320px_1fr] gap-4 items-start">
              {/* Cột trái — danh sách đợt; ẩn dưới lg khi đang mở một chứng từ. */}
              <div className={selected ? "hidden lg:block" : "block"}>
                {certs.length === 0 ? (
                  <Card tone="sunken" pad="none">
                    <EmptyState
                      message='Chưa có đợt thanh toán nào. Bấm "Lập đợt mới" để bắt đầu.'
                      compact
                    />
                  </Card>
                ) : (
                  <Card tone="raised" pad="none" className="overflow-hidden">
                    <ul className="max-h-[70vh] overflow-y-auto divide-y divide-zinc-800/60">
                      {certs.map((c) => {
                        const dangChon = c.id === selectedId;
                        return (
                          <li key={c.id}>
                            <button
                              type="button"
                              onClick={() => chonDot(c.id)}
                              aria-current={dangChon ? "true" : undefined}
                              className={`w-full min-h-[56px] px-3 py-2 flex items-center gap-2 text-left transition border-l-2 ${
                                dangChon
                                  ? "bg-emerald-500/10 border-emerald-500"
                                  : "border-transparent hover:bg-zinc-800/40"
                              }`}
                            >
                              <span className="min-w-0 flex-1">
                                <span className="block font-mono text-xs text-zinc-200 truncate">
                                  {c.code}
                                </span>
                                <span className="block text-xs text-zinc-400 truncate">
                                  Đợt {c.periodNo}
                                  {c.periodLabel ? ` · ${c.periodLabel}` : ""}
                                </span>
                              </span>
                              <Chip tone={STATUS_TONE[c.status]} className="shrink-0">
                                {STATUS_LABEL[c.status]}
                              </Chip>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </Card>
                )}
              </div>

              {/* Cột phải — chứng từ đang mở. */}
              <div className={selected ? "block" : "hidden lg:block"}>
                {selected ? (
                  <CertDocument
                    ctrl={ctrl}
                    nav={{
                      index: viTri,
                      total: certs.length,
                      onPrev: () => chonDot(certs[viTri - 1]?.id ?? null),
                      onNext: () => chonDot(certs[viTri + 1]?.id ?? null),
                      onBackToList: dongDot,
                    }}
                  />
                ) : (
                  <Card tone="sunken" pad="none">
                    <EmptyState
                      icon={Receipt}
                      message="Chọn một đợt bên trái hoặc bấm “Lập đợt mới” để bắt đầu."
                    />
                  </Card>
                )}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
