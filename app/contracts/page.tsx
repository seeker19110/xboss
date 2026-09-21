"use client";
import { Fragment, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, ChevronRight, FileSignature, Plus, RotateCcw } from "lucide-react";
import { todayISO } from "@/lib/nen/date";
import AppHeader from "@/app/components/AppHeader";
import MaskedValue from "@/app/components/MaskedValue";
import { mSum } from "@/app/lib/masked";
import EmptyState from "@/app/components/EmptyState";
import { PageSkeleton } from "@/app/components/Skeleton";
import { showToast } from "@/app/components/Toast";
import { fetchMe, type Me } from "@/app/lib/me";
import { Button, Card, Chip, StatCard } from "@/app/components/ui";
import AddContractModal from "@/app/contracts/_components/AddContractModal";
import ContractDocument, {
  ContractBottomActions,
  useContractDocument,
  CONTRACT_TABS,
  fmtVND,
  KIND_LABEL,
  STATUS_LABEL,
  STATUS_TONE,
  type Contract,
  type ContractKind,
  type ContractTab,
  type Supplier,
  type SystemOption,
} from "@/app/contracts/_components/ContractDocument";

const KIND_ORDER: ContractKind[] = ["nhan_thau", "giao_thau", "ncc"];

function taiDanhSach(deleted: boolean) {
  return fetch(`/api/contracts${deleted ? "?includeDeleted=1" : ""}`).then((r) =>
    r.ok ? r.json() : null,
  );
}

export default function ContractsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ContractsInner />
    </Suspense>
  );
}

// Bố cục master–detail (M126, theo mẫu M124): danh sách hợp đồng bên trái (vẫn gập/mở
// theo loại), chứng từ hợp đồng đang mở bên phải. Dưới lg chỉ hiện một trong hai (chọn
// hợp đồng → chứng từ toàn màn hình, thanh đáy để đóng).
function ContractsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Hợp đồng đang mở đọc THẲNG từ URL (`?id=`) — reload/chia sẻ link giữ nguyên chứng từ.
  const selectedId = Number(searchParams.get("id")) || null;
  const tabParam = searchParams.get("tab");
  const [tab, setTab] = useState<ContractTab>(() =>
    CONTRACT_TABS.some((t) => t.id === tabParam) ? (tabParam as ContractTab) : "info",
  );
  useEffect(() => {
    if (tabParam && CONTRACT_TABS.some((t) => t.id === tabParam)) setTab(tabParam as ContractTab);
  }, [tabParam]);

  const [me, setMe] = useState<Me | null>(null);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [systems, setSystems] = useState<SystemOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState<Set<ContractKind>>(new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);
  const [restoringId, setRestoringId] = useState<number | null>(null);

  const canManage = me?.role === "admin" || me?.role === "pm";
  const isAdmin = me?.role === "admin";

  useEffect(() => {
    Promise.all([
      fetchMe(),
      taiDanhSach(false),
      fetch("/api/suppliers").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/systems").then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([meData, c, s, d]) => {
        if (!meData) return;
        setMe(meData);
        setContracts(c?.contracts ?? []);
        setSuppliers(s?.suppliers ?? []);
        setSystems(d?.systems ?? []);
      })
      .finally(() => setLoading(false));
  }, []);

  const refresh = useCallback(async (deleted: boolean) => {
    const c = await taiDanhSach(deleted);
    setContracts(c?.contracts ?? []);
  }, []);

  const refreshHienTai = useCallback(() => refresh(showDeleted), [refresh, showDeleted]);

  /** Ghi hợp đồng/tab đang chọn vào URL (không đẩy history, không nhảy về đầu trang). */
  const capNhatUrl = useCallback(
    (next: { id?: number | null; tab?: ContractTab }) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next.id !== undefined) {
        if (next.id) params.set("id", String(next.id));
        else params.delete("id");
      }
      if (next.tab !== undefined) params.set("tab", next.tab);
      const qs = params.toString();
      router.replace(qs ? `?${qs}` : "/contracts", { scroll: false });
    },
    [router, searchParams],
  );

  const chonHopDong = useCallback((id: number | null) => capNhatUrl({ id }), [capNhatUrl]);
  const dongHopDong = useCallback(() => capNhatUrl({ id: null }), [capNhatUrl]);
  const chonTab = useCallback(
    (next: ContractTab) => {
      setTab(next);
      capNhatUrl({ tab: next });
    },
    [capNhatUrl],
  );

  async function toggleShowDeleted() {
    const next = !showDeleted;
    setShowDeleted(next);
    setLoading(true);
    await refresh(next);
    setLoading(false);
  }

  async function restoreContract(id: number) {
    setRestoringId(id);
    const res = await fetch(`/api/contracts/${id}/restore`, { method: "POST" });
    if (res.ok) {
      showToast("Đã khôi phục hợp đồng", "success");
      await refresh(true);
    } else {
      const j = await res.json().catch(() => null);
      showToast(j?.error ?? "Khôi phục thất bại", "error");
    }
    setRestoringId(null);
  }

  const groups = useMemo(
    () =>
      KIND_ORDER.map((kind) => ({ kind, items: contracts.filter((c) => c.kind === kind) })).filter(
        (g) => g.items.length > 0,
      ),
    [contracts],
  );

  // M50 PR2: value/addendaTotal/paid có thể bị che (null) với user thiếu viewPayments —
  // dùng mSum để tổng nhóm cũng "bị che" (null) thay vì ngầm thành 0 (Number(null)===0).
  const kindTotals = useMemo(() => {
    const map: Record<ContractKind, { total: number | null; paid: number | null }> = {
      nhan_thau: { total: 0, paid: 0 },
      giao_thau: { total: 0, paid: 0 },
      ncc: { total: 0, paid: 0 },
    };
    for (const c of contracts) {
      map[c.kind].total = mSum(map[c.kind].total, c.value, c.addendaTotal);
      map[c.kind].paid = mSum(map[c.kind].paid, c.paid);
    }
    return map;
  }, [contracts]);

  function toggleGroup(kind: ContractKind) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  }

  // Bản ghi đã xoá không mở chứng từ (giữ hành vi cũ: hàng bị vô hiệu, chỉ còn Khôi phục).
  const selected = showDeleted ? null : (contracts.find((c) => c.id === selectedId) ?? null);
  const danhSachPhang = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const viTri = danhSachPhang.findIndex((c) => c.id === selected?.id);

  // Hợp đồng trong `?id=` bị lọc khỏi danh sách (đổi dự án, bật "đã xoá", vừa xoá xong)
  // → bỏ `id` khỏi URL để không kẹt link trỏ vào bản ghi không hiển thị được.
  useEffect(() => {
    if (!loading && selectedId && !selected) chonHopDong(null);
  }, [loading, selectedId, selected, chonHopDong]);

  const ctrl = useContractDocument({
    contract: selected,
    canManage,
    tab,
    setTab: chonTab,
    onSaved: refreshHienTai,
    onDeleted: () => {
      chonHopDong(null);
      void refreshHienTai();
    },
    onClose: dongHopDong,
  });

  if (loading) return <PageSkeleton />;

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <AppHeader
        title="Hợp đồng"
        subtitle="Nhận thầu · giao thầu · nhà cung cấp"
        bottomActions={selected ? <ContractBottomActions ctrl={ctrl} /> : undefined}
      />

      <main className="p-4 sm:p-6 pb-24 space-y-4 max-w-screen-2xl mx-auto">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {KIND_ORDER.map((kind) => {
            const tot = kindTotals[kind].total;
            const pd = kindTotals[kind].paid;
            const pct = tot != null && tot > 0 && pd != null ? Math.round((pd / tot) * 100) : null;
            return (
              <StatCard
                key={kind}
                label={KIND_LABEL[kind]}
                value={<MaskedValue value={tot} format={fmtVND} />}
                progress={pct == null ? undefined : Math.min(100, pct) / 100}
                badge={pct != null ? <Chip tone="success">{pct}% đã TT</Chip> : undefined}
                hint={
                  <>
                    Đã thanh toán: <MaskedValue value={pd} format={fmtVND} />
                  </>
                }
              />
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {isAdmin && (
            <label className="inline-flex items-center gap-2 text-xs font-medium text-zinc-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showDeleted}
                onChange={toggleShowDeleted}
                className="rounded border-zinc-700 bg-zinc-900 text-emerald-600 focus:ring-emerald-500"
              />
              Xem hợp đồng đã xoá
            </label>
          )}
          {canManage && (
            <Button
              icon={Plus}
              variant="primary"
              className="ml-auto"
              aria-label="Thêm hợp đồng"
              onClick={() => setAddOpen(true)}
            >
              Thêm hợp đồng
            </Button>
          )}
        </div>

        {contracts.length === 0 ? (
          <EmptyState
            icon={FileSignature}
            title={showDeleted ? "Không có hợp đồng nào đã xoá" : "Chưa có hợp đồng nào"}
            message={
              showDeleted
                ? "Chưa hợp đồng nào bị xoá."
                : canManage
                  ? 'Bấm "Thêm hợp đồng" để bắt đầu.'
                  : "Chưa có dữ liệu hợp đồng."
            }
          />
        ) : (
          <div className="grid lg:grid-cols-[320px_1fr] gap-4 items-start">
            {/* Cột trái — danh sách hợp đồng theo loại; ẩn dưới lg khi đang mở chứng từ. */}
            <div className={selected ? "hidden lg:block" : "block"}>
              <Card tone="raised" pad="none" className="overflow-hidden">
                <div className="max-h-[70vh] overflow-y-auto">
                  {groups.map((g) => {
                    const isCollapsed = collapsed.has(g.kind);
                    return (
                      <Fragment key={g.kind}>
                        <button
                          type="button"
                          onClick={() => toggleGroup(g.kind)}
                          aria-expanded={!isCollapsed}
                          className="w-full min-h-10 flex items-center gap-2 px-3 py-2 bg-zinc-950/60 text-xs font-semibold uppercase tracking-wide text-zinc-300 hover:text-white transition"
                        >
                          {isCollapsed ? (
                            <ChevronRight className="w-3.5 h-3.5 shrink-0" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5 shrink-0" />
                          )}
                          {KIND_LABEL[g.kind]} ({g.items.length})
                        </button>
                        {!isCollapsed && (
                          <ul className="divide-y divide-zinc-800/60">
                            {g.items.map((c) => (
                              <li key={c.id}>
                                {showDeleted ? (
                                  <div className="min-h-[56px] px-3 py-2 flex items-center gap-2 opacity-70">
                                    <HangHopDong contract={c} />
                                    <Button
                                      size="sm"
                                      variant="secondary"
                                      icon={RotateCcw}
                                      disabled={restoringId === c.id}
                                      aria-label={`Khôi phục hợp đồng ${c.code}`}
                                      onClick={() => void restoreContract(c.id)}
                                    >
                                      Khôi phục
                                    </Button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => chonHopDong(c.id)}
                                    aria-current={c.id === selected?.id ? "true" : undefined}
                                    className={`w-full min-h-[56px] px-3 py-2 flex items-center gap-2 text-left transition border-l-2 ${
                                      c.id === selected?.id
                                        ? "bg-emerald-500/10 border-emerald-500"
                                        : "border-transparent hover:bg-zinc-800/40"
                                    }`}
                                  >
                                    <HangHopDong contract={c} />
                                    {/* Cảnh báo hết hiệu lực giữ từ bảng cũ (cột HIỆU LỰC
                                        tô đỏ): HĐ còn hiệu lực mà đã quá ngày kết thúc. */}
                                    {c.status === "active" &&
                                      c.validTo != null &&
                                      c.validTo <= todayISO() && (
                                        <Chip tone="danger" className="shrink-0">
                                          Hết hạn
                                        </Chip>
                                      )}
                                    <Chip tone={STATUS_TONE[c.status]} className="shrink-0">
                                      {STATUS_LABEL[c.status]}
                                    </Chip>
                                  </button>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </Fragment>
                    );
                  })}
                </div>
              </Card>
            </div>

            {/* Cột phải — chứng từ hợp đồng đang mở. */}
            <div className={selected ? "block" : "hidden lg:block"}>
              {selected ? (
                <ContractDocument
                  ctrl={ctrl}
                  nav={{
                    index: viTri,
                    total: danhSachPhang.length,
                    onPrev: () => chonHopDong(danhSachPhang[viTri - 1]?.id ?? null),
                    onNext: () => chonHopDong(danhSachPhang[viTri + 1]?.id ?? null),
                    onBackToList: dongHopDong,
                  }}
                />
              ) : (
                <Card tone="sunken" pad="none">
                  <EmptyState
                    icon={FileSignature}
                    message={
                      showDeleted
                        ? "Đang xem hợp đồng đã xoá — khôi phục trước khi mở chứng từ."
                        : "Chọn một hợp đồng bên trái để xem chứng từ."
                    }
                  />
                </Card>
              )}
            </div>
          </div>
        )}
      </main>

      {addOpen && (
        <AddContractModal
          suppliers={suppliers}
          systems={systems}
          onClose={() => setAddOpen(false)}
          onCreated={() => {
            setAddOpen(false);
            void refreshHienTai();
          }}
        />
      )}
    </div>
  );
}

/** Mã · tên · đối tác của một hàng trong danh sách trái. */
function HangHopDong({ contract }: { contract: Contract }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="block font-mono text-xs text-zinc-200 truncate">{contract.code}</span>
      <span className="block text-xs text-zinc-400 truncate">
        {contract.title} · {contract.partySupplierName ?? contract.partyName ?? "—"}
      </span>
    </span>
  );
}
