"use client";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FilePlus2, Plus } from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import EmptyState from "@/app/components/EmptyState";
import MaskedValue from "@/app/components/MaskedValue";
import { mSum } from "@/app/lib/masked";
import { PageSkeleton } from "@/app/components/Skeleton";
import { fetchMe, type Me } from "@/app/lib/me";
import { Button, Card, Chip, StatCard } from "@/app/components/ui";
import AddVoModal from "@/app/variations/_components/AddVoModal";
import VoDocumentView, {
  VoBottomActions,
  useVoDocument,
  fmtVND,
  REASON_LABEL,
  STATUS_LABEL,
  STATUS_TONE,
  type Contract,
  type SystemOption,
  type Vo,
} from "@/app/variations/_components/VoDocument";

type BoqItem = { code: string; unitPrice: number; voId: number | null };

export default function VariationsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <VariationsInner />
    </Suspense>
  );
}

// Bố cục master–detail (M126, bám mẫu M124): danh sách phát sinh bên trái, chứng từ đang
// mở bên phải. Dưới lg chỉ hiện một trong hai (chọn VO → chứng từ toàn màn hình, thanh đáy
// để đóng).
function VariationsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // VO đang mở đọc THẲNG từ URL (`?id=`) — reload/chia sẻ link giữ nguyên chứng từ.
  const selectedId = Number(searchParams.get("id")) || null;

  const [me, setMe] = useState<Me | null>(null);
  const [items, setItems] = useState<Vo[]>([]);
  const [systems, setSystems] = useState<SystemOption[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [boqIndex, setBoqIndex] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);

  const canCreate = me?.role === "admin" || me?.role === "pm" || me?.role === "engineer";
  const isAdminOrPm = me?.role === "admin" || me?.role === "pm";

  function load() {
    return fetch("/api/variations").then((r) => (r.ok ? r.json() : null));
  }

  useEffect(() => {
    Promise.all([fetchMe(), load(), fetch("/api/systems").then((r) => (r.ok ? r.json() : null))])
      .then(([meData, v, d]) => {
        if (!meData) return;
        setMe(meData);
        setItems(v?.items ?? []);
        setSystems(d?.systems ?? []);
        if (meData.role === "admin" || meData.role === "pm") {
          fetch("/api/contracts")
            .then((r) => (r.ok ? r.json() : null))
            .then((c) => setContracts(c?.contracts ?? []));
        }
        fetch("/api/boq?includeVo=0")
          .then((r) => (r.ok ? r.json() : null))
          .then((b) => {
            const idx = new Map<string, number>();
            for (const it of (b?.items ?? []) as BoqItem[])
              idx.set(it.code.trim().toLowerCase(), Number(it.unitPrice));
            setBoqIndex(idx);
          });
      })
      .finally(() => setLoading(false));
  }, []);

  const refresh = useCallback(async () => {
    const v = await load();
    setItems(v?.items ?? []);
  }, []);

  /** Ghi VO đang chọn vào URL (không đẩy history, không nhảy về đầu trang). */
  const chonVo = useCallback(
    (id: number | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (id) params.set("id", String(id));
      else params.delete("id");
      const qs = params.toString();
      router.replace(qs ? `?${qs}` : "/variations", { scroll: false });
    },
    [router, searchParams],
  );

  const dongVo = useCallback(() => chonVo(null), [chonVo]);

  // M50 PR2: giá trị VO có thể bị che (null) với user thiếu viewPayments (vd engineer) —
  // dùng mSum để tổng cũng "bị che" (null) thay vì ngầm thành 0, để MaskedValue hiện "•••".
  const totals = useMemo(() => {
    const map: Record<"draft" | "submitted" | "approved" | "rejected", number | null> = {
      draft: 0,
      submitted: 0,
      approved: 0,
      rejected: 0,
    };
    for (const v of items) {
      if (v.status === "draft") map.draft = mSum(map.draft, v.proposedValue);
      else if (v.status === "submitted") map.submitted = mSum(map.submitted, v.proposedValue);
      else if (v.status === "rejected") map.rejected = mSum(map.rejected, v.proposedValue);
      // approved/partially_approved/contract_added
      else map.approved = mSum(map.approved, v.approvedValue);
    }
    return map;
  }, [items]);

  const selected = items.find((v) => v.id === selectedId) ?? null;
  const viTri = items.findIndex((v) => v.id === selectedId);

  const ctrl = useVoDocument({
    vo: selected,
    me,
    contracts,
    isAdminOrPm,
    onSaved: refresh,
    onClose: dongVo,
  });

  if (loading) return <PageSkeleton />;

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <AppHeader
        title="Phát sinh"
        subtitle="Khối lượng ngoài hợp đồng gốc (VO)"
        bottomActions={selected ? <VoBottomActions ctrl={ctrl} /> : undefined}
      />

      <main className="p-4 sm:p-6 pb-24 space-y-4 max-w-screen-2xl mx-auto">
        {/* 4 thẻ tổng theo trạng thái đứng TRƯỚC danh sách trong DOM: e2e dò nhãn
            "Nháp/Đã trình/Được duyệt/Từ chối" bằng `.first()` không giới hạn vùng, nên
            chip trạng thái trong danh sách phải đứng sau. */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {(
            [
              ["draft", "Nháp", "neutral"],
              ["submitted", "Đã trình", "warning"],
              ["approved", "Được duyệt", "success"],
              ["rejected", "Từ chối", "danger"],
            ] as const
          ).map(([key, label, tone]) => (
            <StatCard
              key={key}
              label={label}
              tone={tone}
              value={<MaskedValue value={totals[key]} format={fmtVND} />}
            />
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-zinc-400">
            {items.length} phát sinh{selected ? ` · đang mở ${selected.code}` : ""}
          </p>
          {canCreate && (
            <Button
              icon={Plus}
              variant="primary"
              aria-label="Thêm phát sinh"
              onClick={() => setAddOpen(true)}
            >
              Thêm phát sinh
            </Button>
          )}
        </div>

        {items.length === 0 ? (
          <EmptyState
            icon={FilePlus2}
            title="Chưa có phát sinh nào"
            message={canCreate ? 'Bấm "Thêm phát sinh" để bắt đầu.' : "Chưa có dữ liệu phát sinh."}
          />
        ) : (
          <div className="grid lg:grid-cols-[320px_1fr] gap-4 items-start">
            {/* Cột trái — danh sách phát sinh; ẩn dưới lg khi đang mở một chứng từ. */}
            <div className={selected ? "hidden lg:block" : "block"}>
              <Card tone="raised" pad="none" className="overflow-hidden">
                <ul className="max-h-[70vh] overflow-y-auto divide-y divide-zinc-800/60">
                  {items.map((v) => {
                    const dangChon = v.id === selectedId;
                    return (
                      <li key={v.id}>
                        <button
                          type="button"
                          onClick={() => chonVo(v.id)}
                          aria-current={dangChon ? "true" : undefined}
                          className={`w-full min-h-[56px] px-3 py-2 flex items-center gap-2 text-left transition border-l-2 ${
                            dangChon
                              ? "bg-emerald-500/10 border-emerald-500"
                              : "border-transparent hover:bg-zinc-800/40"
                          }`}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block font-mono text-xs text-zinc-200 truncate">
                              {v.code}
                            </span>
                            <span className="block text-xs text-zinc-400 truncate">{v.title}</span>
                            <span className="block text-[11px] text-zinc-500 truncate">
                              {REASON_LABEL[v.reason]}
                            </span>
                          </span>
                          <Chip tone={STATUS_TONE[v.status]} className="shrink-0">
                            {STATUS_LABEL[v.status]}
                          </Chip>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            </div>

            {/* Cột phải — chứng từ đang mở. */}
            <div className={selected ? "block" : "hidden lg:block"}>
              {selected ? (
                <VoDocumentView
                  ctrl={ctrl}
                  nav={{
                    index: viTri,
                    total: items.length,
                    onPrev: () => chonVo(items[viTri - 1]?.id ?? null),
                    onNext: () => chonVo(items[viTri + 1]?.id ?? null),
                    onBackToList: dongVo,
                  }}
                />
              ) : (
                <Card tone="sunken" pad="none">
                  <EmptyState
                    icon={FilePlus2}
                    message="Chọn một phát sinh bên trái để xem chi tiết khối lượng và quyết định."
                  />
                </Card>
              )}
            </div>
          </div>
        )}
      </main>

      {addOpen && (
        <AddVoModal
          systems={systems}
          boqIndex={boqIndex}
          onClose={() => setAddOpen(false)}
          onCreated={(id) => {
            setAddOpen(false);
            void refresh();
            if (id) chonVo(id);
          }}
        />
      )}
    </div>
  );
}
