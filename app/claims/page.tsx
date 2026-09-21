"use client";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, RotateCcw, Scale } from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import EmptyState from "@/app/components/EmptyState";
import MaskedValue from "@/app/components/MaskedValue";
import { mSumBy } from "@/app/lib/masked";
import { PageSkeleton } from "@/app/components/Skeleton";
import { showToast } from "@/app/components/Toast";
import { fetchMe, type Me } from "@/app/lib/me";
import { Button, Card, Chip, StatCard } from "@/app/components/ui";
import AddClaimModal, { type Contract } from "@/app/claims/_components/AddClaimModal";
import ClaimDocument, {
  ClaimBottomActions,
  useClaimDocument,
  fmtVND,
  KIND_LABEL,
  OPEN_STATUSES,
  STATUS_LABEL,
  STATUS_TONE,
  type Claim,
  type ClaimKind,
} from "@/app/claims/_components/ClaimDocument";

export default function ClaimsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ClaimsInner />
    </Suspense>
  );
}

// Bố cục master–detail (M126, theo mẫu M124 của /payment-certs): danh sách claim bên trái,
// chứng từ claim đang mở bên phải. Dưới lg chỉ hiện một trong hai (chọn claim → chứng từ
// toàn màn hình, thanh đáy để đóng).
function ClaimsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Claim đang mở đọc THẲNG từ URL (`?id=`) — reload/chia sẻ link giữ nguyên chứng từ.
  const selectedId = Number(searchParams.get("id")) || null;

  const [me, setMe] = useState<Me | null>(null);
  const [items, setItems] = useState<Claim[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [kindFilter, setKindFilter] = useState<ClaimKind | "all">("all");
  const [addOpen, setAddOpen] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);
  const [restoringId, setRestoringId] = useState<number | null>(null);

  const canManage = me?.role === "admin" || me?.role === "pm" || me?.role === "engineer";
  const isAdminOrPm = me?.role === "admin" || me?.role === "pm";
  const isAdmin = me?.role === "admin";

  function load(deleted = showDeleted) {
    return fetch(`/api/claims${deleted ? "?includeDeleted=1" : ""}`).then((r) =>
      r.ok ? r.json() : null,
    );
  }

  useEffect(() => {
    Promise.all([fetchMe(), load(false)])
      .then(([meData, c]) => {
        if (!meData) return;
        setMe(meData);
        setItems(c?.items ?? []);
        if (meData.role === "admin" || meData.role === "pm") {
          fetch("/api/contracts")
            .then((r) => (r.ok ? r.json() : null))
            .then((cr) => setContracts(cr?.contracts ?? []));
        }
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = useCallback(
    async (deleted = showDeleted) => {
      const c = await load(deleted);
      setItems(c?.items ?? []);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [showDeleted],
  );

  /** Ghi claim đang mở vào URL (không đẩy history, không nhảy về đầu trang). */
  const capNhatUrl = useCallback(
    (id: number | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (id) params.set("id", String(id));
      else params.delete("id");
      const qs = params.toString();
      router.replace(qs ? `?${qs}` : "/claims", { scroll: false });
    },
    [router, searchParams],
  );

  const chonClaim = useCallback((id: number | null) => capNhatUrl(id), [capNhatUrl]);
  const dongClaim = useCallback(() => capNhatUrl(null), [capNhatUrl]);

  async function toggleShowDeleted() {
    const next = !showDeleted;
    setShowDeleted(next);
    dongClaim();
    setLoading(true);
    await refresh(next);
    setLoading(false);
  }

  async function restoreClaim(id: number) {
    setRestoringId(id);
    const res = await fetch(`/api/claims/${id}/restore`, { method: "POST" });
    if (res.ok) {
      showToast("Đã khôi phục claim", "success");
      await refresh(true);
    } else {
      const j = await res.json().catch(() => null);
      showToast(j?.error ?? "Khôi phục thất bại", "error");
    }
    setRestoringId(null);
  }

  const filtered = useMemo(
    () => (kindFilter === "all" ? items : items.filter((c) => c.kind === kindFilter)),
    [items, kindFilter],
  );

  /** Đổi bộ lọc loại — chỉ đóng chứng từ khi claim đang mở bị lọc khỏi danh sách. */
  function doiFilter(next: ClaimKind | "all") {
    setKindFilter(next);
    const dangMo = items.find((c) => c.id === selectedId);
    if (dangMo && next !== "all" && dangMo.kind !== next) dongClaim();
  }

  const kpi = useMemo(() => {
    const cost = items.filter((c) => c.kind === "cost" && OPEN_STATUSES.includes(c.status));
    const eot = items.filter((c) => c.kind === "eot" && OPEN_STATUSES.includes(c.status));
    return {
      costCount: cost.length,
      // Claim không bị che tiền phía server; `?? 0` chỉ để bỏ qua ô chưa nhập, giữ đúng
      // con số của bản cũ.
      costAmount: mSumBy(cost, (c) => c.amountRequested ?? 0),
      eotCount: eot.length,
      eotDays: eot.reduce((s, c) => s + (c.daysRequested ?? 0), 0),
    };
  }, [items]);

  // Đang xem thùng rác thì không mở chứng từ (giữ hành vi "click bị vô hiệu" của bản cũ).
  const selected = showDeleted ? null : (items.find((c) => c.id === selectedId) ?? null);
  const viTri = filtered.findIndex((c) => c.id === selected?.id);

  const ctrl = useClaimDocument({
    claim: selected,
    meId: me?.id ?? null,
    isAdminOrPm,
    onSaved: refresh,
    onClose: dongClaim,
  });

  if (loading) return <PageSkeleton />;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <AppHeader
        title="Claim chi phí & EOT"
        subtitle="Claim chi phí & gia hạn thời gian ngoài hợp đồng gốc"
        bottomActions={selected ? <ClaimBottomActions ctrl={ctrl} /> : undefined}
      />

      <main className="p-4 sm:p-6 pb-24 space-y-4 max-w-screen-2xl mx-auto">
        <div className="flex flex-wrap items-center gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1 min-w-[260px]">
            <StatCard
              label="Claim chi phí đang mở"
              value={<MaskedValue value={kpi.costAmount} format={fmtVND} />}
              hint={`${kpi.costCount} hồ sơ đang đàm phán`}
            />
            <StatCard
              label="Claim EOT gia hạn đang mở"
              value={kpi.eotDays}
              unit="ngày"
              tone="info"
              hint={`${kpi.eotCount} hồ sơ đề xuất kéo dài tiến độ`}
            />
          </div>
          {canManage && (
            <Button
              icon={Plus}
              variant="primary"
              aria-label="Thêm claim"
              labelOnDesktopOnly
              onClick={() => setAddOpen(true)}
            >
              Thêm claim
            </Button>
          )}
        </div>

        <div className="grid lg:grid-cols-[320px_1fr] gap-4 items-start">
          {/* Cột trái — bộ lọc + danh sách claim; ẩn dưới lg khi đang mở một chứng từ. */}
          <div className={`space-y-3 ${selected ? "hidden lg:block" : "block"}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div
                className="flex items-center gap-1 p-1 bg-zinc-900 border border-zinc-800 rounded-xl"
                role="group"
                aria-label="Lọc theo loại claim"
              >
                {(
                  [
                    ["all", "Tất cả"],
                    ["cost", "Chi phí"],
                    ["eot", "Gia hạn EOT"],
                  ] as const
                ).map(([key, label]) => (
                  <Button
                    key={key}
                    size="sm"
                    variant={kindFilter === key ? "primary" : "ghost"}
                    onClick={() => doiFilter(key)}
                    aria-pressed={kindFilter === key}
                  >
                    {label}
                  </Button>
                ))}
              </div>

              {isAdmin && (
                <label className="inline-flex items-center gap-2 text-xs font-medium text-zinc-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={showDeleted}
                    onChange={toggleShowDeleted}
                    className="rounded border-zinc-700 bg-zinc-900 text-emerald-600 focus:ring-emerald-500"
                  />
                  Xem claim đã xoá
                </label>
              )}
            </div>

            {filtered.length === 0 ? (
              <Card tone="sunken" pad="none">
                <EmptyState
                  icon={Scale}
                  title={showDeleted ? "Không có claim nào đã xoá" : "Chưa có claim nào"}
                  message={
                    showDeleted
                      ? "Chưa claim nào bị xoá."
                      : canManage
                        ? 'Bấm "Thêm claim" để bắt đầu.'
                        : "Chưa có dữ liệu claim."
                  }
                  compact
                />
              </Card>
            ) : (
              <Card tone="raised" pad="none" className="overflow-hidden">
                <ul className="max-h-[70vh] overflow-y-auto divide-y divide-zinc-800/60">
                  {filtered.map((c) => {
                    const dangChon = c.id === selected?.id;
                    const noiDung = (
                      <>
                        <span className="min-w-0 flex-1">
                          <span className="block font-mono text-xs text-zinc-200 truncate">
                            {c.code}
                          </span>
                          <span className="block text-xs text-zinc-400 truncate">{c.title}</span>
                          <span className="block text-[11px] text-zinc-500">
                            {KIND_LABEL[c.kind]}
                          </span>
                        </span>
                        <Chip tone={STATUS_TONE[c.status]} className="shrink-0">
                          {STATUS_LABEL[c.status]}
                        </Chip>
                      </>
                    );
                    return (
                      <li key={c.id}>
                        {showDeleted ? (
                          // Claim đã xoá: không mở chứng từ, chỉ cho khôi phục.
                          <div className="w-full min-h-[56px] px-3 py-2 flex items-center gap-2 opacity-60">
                            {noiDung}
                            <Button
                              size="sm"
                              variant="ghost"
                              icon={RotateCcw}
                              disabled={restoringId === c.id}
                              aria-label={`Khôi phục claim ${c.code}`}
                              onClick={() => void restoreClaim(c.id)}
                              className="shrink-0"
                            >
                              Khôi phục
                            </Button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => chonClaim(c.id)}
                            aria-current={dangChon ? "true" : undefined}
                            className={`w-full min-h-[56px] px-3 py-2 flex items-center gap-2 text-left transition border-l-2 ${
                              dangChon
                                ? "bg-emerald-500/10 border-emerald-500"
                                : "border-transparent hover:bg-zinc-800/40"
                            }`}
                          >
                            {noiDung}
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </Card>
            )}
          </div>

          {/* Cột phải — chứng từ claim đang mở. */}
          <div className={selected ? "block" : "hidden lg:block"}>
            {selected ? (
              <ClaimDocument
                ctrl={ctrl}
                nav={{
                  index: viTri,
                  total: filtered.length,
                  onPrev: () => chonClaim(filtered[viTri - 1]?.id ?? null),
                  onNext: () => chonClaim(filtered[viTri + 1]?.id ?? null),
                  onBackToList: dongClaim,
                }}
              />
            ) : (
              <Card tone="sunken" pad="none">
                <EmptyState
                  icon={Scale}
                  message="Chọn một claim bên trái để xem hồ sơ và quyết định."
                />
              </Card>
            )}
          </div>
        </div>
      </main>

      {addOpen && (
        <AddClaimModal
          contracts={contracts}
          onClose={() => setAddOpen(false)}
          onCreated={() => {
            setAddOpen(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}
