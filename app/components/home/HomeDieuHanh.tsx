"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import {
  AlertTriangle,
  CalendarDays,
  CheckCheck,
  ClipboardList,
  FileDown,
  Plus,
  Printer,
  Upload,
} from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import { appAlert, appConfirm } from "@/app/components/dialogs";
import { PageSkeleton, Skeleton } from "@/app/components/Skeleton";
import { ErrorState } from "@/app/components/ErrorState";
import HomeRail from "@/app/components/HomeRail";
import NewSheetModal from "@/app/components/NewSheetModal";
import ProgressRow from "@/app/components/ProgressRow";
import DelayedSection from "@/app/components/home/DelayedSection";
import DieuHanhStats from "@/app/components/home/DieuHanhStats";
import DieuHanhTabs, { DEFAULT_TAB, TABS } from "@/app/components/home/DieuHanhTabs";
import { useDieuHanhData, type KPI } from "@/app/components/home/useDieuHanhData";
import type { Me } from "@/app/lib/me";
import { useIsCompact } from "@/app/lib/useIsCompact";
import { Button, ButtonLink, Card, Chip, DocToolbar, Section } from "@/app/components/ui";
import { systemColorClasses } from "@/lib/nen/systemColors";

// Chế độ "Điều hành" của trang chủ (M127) — nguyên bố cục M125: thanh công cụ → dải số
// liệu → thân 2 cột (tiến độ · đường găng · bảng trễ | rail Pareto + hub). Mặc định cho
// mọi vai trò trừ thầu phụ; kỹ sư chuyển qua lại với chế độ Hiện trường bằng nút trong
// thanh công cụ. Dữ liệu ở `useDieuHanhData`, dải số liệu ở `DieuHanhStats`, thẻ tab tiến
// độ ở `DieuHanhTabs`.

// Lazy-load các panel nặng (recharts, nhiều fetch) — chỉ load khi đã render shell.
const BlockedPanel = dynamic(() => import("@/app/components/BlockedPanel"), {
  ssr: false,
  loading: () => <Skeleton className="h-24 rounded-xl" />,
});
const NormsOverPanel = dynamic(() => import("@/app/components/NormsOverPanel"), {
  ssr: false,
  loading: () => <Skeleton className="h-24 rounded-xl" />,
});
const SpiCards = dynamic(() => import("@/app/components/SpiCards"), {
  ssr: false,
  loading: () => <Skeleton className="h-28 rounded-xl" />,
});
const ForecastCards = dynamic(() => import("@/app/components/ForecastCards"), {
  ssr: false,
  loading: () => <Skeleton className="h-28 rounded-xl" />,
});
const DashboardExtCards = dynamic(() => import("@/app/components/DashboardExtCards"), {
  ssr: false,
  loading: () => <Skeleton className="h-28 rounded-xl" />,
});
const ScheduleControlPanel = dynamic(() => import("@/app/components/ScheduleControlPanel"), {
  ssr: false,
  loading: () => <Skeleton className="h-40 rounded-xl" />,
});

export default function HomeDieuHanh({
  me,
  onSwitchMode,
}: {
  me: Me;
  /** Chuyển sang chế độ Hiện trường — chỉ truyền cho vai trò được phép đổi (kỹ sư). */
  onSwitchMode?: () => void;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    data,
    setData,
    kpiOrder,
    setKpiOrder,
    sheets,
    systems,
    delayReasons,
    loading,
    loi,
    loiPhu,
    fetchedAt,
    tai,
  } = useDieuHanhData();
  // Lọc theo nguyên nhân trễ do Pareto ở cột phải điều khiển (bảng trễ tự giữ 3 bộ lọc
  // sheet/tầng/trạng thái của riêng nó).
  const [reasonFilter, setReasonFilter] = useState("");
  const [newSheetOpen, setNewSheetOpen] = useState(false);
  const compact = useIsCompact();

  // Tab đang mở: state cục bộ + ghi vào URL (cùng khuôn với `HubShell`) — đọc thẳng từ
  // URL sẽ phụ thuộc vào việc điều hướng mềm có giữ được state của trang hay không.
  const tabParam = searchParams.get("tab");
  const [tab, setTab] = useState(() =>
    TABS.some((t) => t.id === tabParam) ? (tabParam as string) : DEFAULT_TAB,
  );
  useEffect(() => {
    if (tabParam && TABS.some((t) => t.id === tabParam)) setTab(tabParam);
  }, [tabParam]);

  const chartData = useMemo(
    () =>
      (data?.kpi ?? []).map((k) => ({
        name: k.sheetType,
        value: Math.round((k.avgProgress ?? 0) * 100),
        delayed: k.delayed,
      })),
    [data],
  );
  // Tổng quan đầu trang: % tiến độ bình quân CÓ TRỌNG SỐ theo số công việc mỗi trang
  // (trung bình cộng thuần sẽ để trang 5 việc nặng ngang trang 500 việc).
  const overview = useMemo(() => {
    const kpi = data?.kpi ?? [];
    const totalTasks = kpi.reduce((sum, k) => sum + k.total, 0);
    const done = kpi.reduce((sum, k) => sum + (k.avgProgress ?? 0) * k.total, 0);
    return {
      totalTasks,
      pct: totalTasks > 0 ? Math.round((done / totalTasks) * 100) : 0,
      delayed: data?.totalDelayed ?? 0,
    };
  }, [data]);
  const sheetNameByCode = useMemo(() => new Map(sheets.map((s) => [s.code, s.name])), [sheets]);
  const groupProgressMap = useMemo(
    () => new Map(Object.entries(data?.groupProgress ?? {})),
    [data],
  );

  const allDelayed = useMemo(() => data?.delayedTasks ?? [], [data]);
  const { reasonCounts, noReason, maxReason } = useMemo(() => {
    const counts = delayReasons
      .map(({ code, label }) => ({
        slug: code,
        label,
        count: allDelayed.filter((t) => t.delayReason === code).length,
      }))
      .filter((r) => r.count > 0)
      .sort((a, b) => b.count - a.count);
    const none = allDelayed.filter((t) => !t.delayReason).length;
    return {
      reasonCounts: counts,
      noReason: none,
      maxReason: Math.max(1, ...counts.map((r) => r.count), none),
    };
  }, [allDelayed, delayReasons]);

  if (loading) return <PageSkeleton />;
  // Lỗi tải dữ liệu chính → nói rõ + nút thử lại, thay vì render một trang toàn số 0 như
  // trước (bài học ghi trong app/lib/taiDuLieu.ts).
  if (loi)
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
        <AppHeader />
        <ErrorState message={loi} onRetry={() => void tai()} />
      </div>
    );

  const canImport = me.role === "admin" || me.role === "pm";

  function selectTab(id: string) {
    setTab(id);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", id);
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  async function deleteSheet(sheetId: number, sheetName: string) {
    if (
      !(await appConfirm(
        `Xoá trang "${sheetName}"?\n\nToàn bộ nhóm, công việc, tiến độ và vật tư của trang này sẽ bị xoá vĩnh viễn. Thao tác không thể hoàn tác.`,
        { danger: true, confirmLabel: "Xoá" },
      ))
    )
      return;
    const res = await fetch(`/api/sheets/${sheetId}`, { method: "DELETE" });
    if (!res.ok) {
      appAlert((await res.json().catch(() => null))?.error ?? "Xoá thất bại");
      return;
    }
    window.location.reload();
  }

  function reorderSheets(next: KPI[]) {
    setKpiOrder(next);
    fetch("/api/sheets", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: next.map((k) => k.sheetId) }),
    });
  }

  async function setReason(taskId: number, reason: string) {
    const res = await fetch(`/api/tasks/${taskId}/delay-reason`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: reason || null }),
    });
    if (!res.ok) return;
    setData(
      (d) =>
        d && {
          ...d,
          delayedTasks: d.delayedTasks.map((t) =>
            t.id === taskId ? { ...t, delayReason: reason || null } : t,
          ),
        },
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <AppHeader
        bottomActions={
          compact ? (
            <div className="flex items-center gap-2 shrink-0">
              {canImport && (
                <ButtonLink
                  href="/api/export/excel"
                  icon={FileDown}
                  labelOnDesktopOnly
                  aria-label="Xuất Excel"
                >
                  Excel
                </ButtonLink>
              )}
              <ButtonLink
                href="/report"
                icon={Printer}
                labelOnDesktopOnly
                aria-label="Xem báo cáo PDF"
              >
                PDF
              </ButtonLink>
              {canImport && (
                <ButtonLink
                  href="/import"
                  variant="primary"
                  icon={Upload}
                  labelOnDesktopOnly
                  aria-label="Import Excel"
                >
                  Import
                </ButtonLink>
              )}
            </div>
          ) : undefined
        }
      />

      {/* pb-24 chừa chỗ cho thanh cố định dưới đáy (tìm kiếm/Excel/PDF/Import trên mobile) */}
      <main className="px-4 sm:px-6 py-6 pb-24 space-y-6 max-w-screen-xl mx-auto">
        {/* ── Z0: thanh công cụ ngữ cảnh (desktop; mobile dùng thanh đáy) ── */}
        <DocToolbar
          trailing={
            loiPhu || fetchedAt ? (
              <span className="flex items-center gap-2">
                {loiPhu && (
                  <Chip tone="warning" icon={AlertTriangle}>
                    Một số dữ liệu phụ chưa tải được
                  </Chip>
                )}
                {fetchedAt && <span className="text-xs text-zinc-400">Cập nhật {fetchedAt}</span>}
              </span>
            ) : null
          }
        >
          {canImport && (
            <ButtonLink href="/import" variant="primary" icon={Upload}>
              Import Excel
            </ButtonLink>
          )}
          {canImport && (
            <ButtonLink href="/api/export/excel" icon={FileDown}>
              Excel
            </ButtonLink>
          )}
          <ButtonLink href="/report" icon={Printer}>
            Báo cáo PDF
          </ButtonLink>
          <DocToolbar.Sep />
          <ButtonLink href="/approvals" icon={CheckCheck}>
            Nghiệm thu
          </ButtonLink>
          <ButtonLink href="/lookahead" icon={CalendarDays}>
            Lookahead
          </ButtonLink>
          {/* Kỹ sư: đường quay lại chế độ Hiện trường (việc được giao của chính mình) */}
          {onSwitchMode && (
            <>
              <DocToolbar.Sep />
              <Button variant="ghost" icon={ClipboardList} onClick={onSwitchMode}>
                Việc của tôi
              </Button>
            </>
          )}
          {canImport && (
            <>
              <DocToolbar.Sep />
              <Button icon={Plus} onClick={() => setNewSheetOpen(true)}>
                Thêm trang
              </Button>
            </>
          )}
        </DocToolbar>

        {/* ── Z1: dải số liệu hành động — mở trang là thấy ngay, không phải cuộn ── */}
        <DieuHanhStats
          canImport={canImport}
          onAddSheet={() => setNewSheetOpen(true)}
          pct={overview.pct}
          totalTasks={overview.totalTasks}
          delayedGroups={overview.delayed}
          delayedTasks={allDelayed.length}
          sheetCount={sheets.length}
          approvals={data?.approvals ?? null}
          dueSoon={data?.dueSoon ?? null}
          weekDelta={data?.weekDelta ?? null}
        />

        {/* ── Z2: thân 2 cột — cột chính (tiến độ → đường găng → bảng trễ) + cột phải ── */}
        <div className="grid lg:grid-cols-[minmax(0,1fr)_320px] gap-4 items-start">
          <div className="min-w-0 space-y-6">
            <DieuHanhTabs
              canImport={canImport}
              tab={tab}
              onTabChange={selectTab}
              kpiOrder={kpiOrder}
              onReorder={reorderSheets}
              onDeleteSheet={deleteSheet}
              chartData={chartData}
            />

            {/* ── Theo hệ thi công (M15) — CỐ Ý để ngoài thẻ tab: đây là đường vào duy
                nhất còn lại tới trang hệ /system/[code] từ trang chủ (sidebar đã bỏ mục
                này), giấu sau một tab sẽ thành ngõ cụt điều hướng. ── */}
            {systems.length > 0 && (
              <Section title="Theo hệ thi công" description={`${systems.length} hệ đang theo dõi`}>
                <Card pad="sm" className="grid sm:grid-cols-2 gap-x-3 gap-y-0.5">
                  {systems.map((d) => {
                    const c = systemColorClasses(d.color);
                    return (
                      <ProgressRow
                        key={d.code}
                        href={`/system/${d.code}`}
                        label={d.name}
                        hint={`${d.sheetCount} bảng`}
                        percent={(d.avgProgress ?? 0) * 100}
                        badge={
                          d.delayed > 0 ? (
                            <Chip tone="danger" icon={AlertTriangle}>
                              <span className="tabular-nums">{d.delayed}</span> trễ
                            </Chip>
                          ) : (
                            <Chip tone="success">Đúng hạn</Chip>
                          )
                        }
                        leading={
                          <span
                            className={`w-2 h-2 rounded-full shrink-0 ${c.dot}`}
                            aria-hidden="true"
                          />
                        }
                      />
                    );
                  })}
                </Card>
              </Section>
            )}

            {/* ── Đường găng (nhúng từ /schedule-control — panel tự fetch API riêng) ── */}
            <ScheduleControlPanel />

            {/* ── Bảng trễ ── */}
            <DelayedSection
              tasks={allDelayed}
              kpi={data?.kpi ?? []}
              sheetLabel={(s) => sheetNameByCode.get(s) ?? s}
              reasonFilter={reasonFilter}
              delayReasons={delayReasons}
              groupProgress={groupProgressMap}
              canEditReason={me.role !== "subcon"}
              onSetReason={setReason}
              canImport={canImport}
            />

            {/* ── M9: KPI chất lượng + so sánh chéo hệ ── */}
            {data && (
              <DashboardExtCards
                quality={data.quality}
                vo={data.vo}
                workfront={data.workfront}
                bySystem={data.bySystem}
                approvals={data.approvals}
              />
            )}

            {/* ── Việc bị chặn (phụ thuộc chưa thông) ── */}
            <BlockedPanel />

            {/* ── M18: vật tư vượt định mức theo hạng mục ── */}
            {me.role !== "subcon" && <NormsOverPanel />}

            {/* ── Chỉ số tiến độ (SPI) + dự báo hoàn thành — để ở cột chính chứ không
                phải cột phải: hai panel này chia lưới theo BREAKPOINT VIEWPORT
                (`lg:grid-cols-5`), nhét vào rail 320px sẽ vỡ lưới mà sửa panel thì phạm
                guardrail "không đổi component panel" của M125. ── */}
            <SpiCards />
            <ForecastCards />
          </div>

          {/* Cột phải: điều hướng phân hệ + Pareto nguyên nhân trễ */}
          <div className="lg:sticky lg:top-4">
            <HomeRail
              pareto={{
                rows: reasonCounts,
                noReason,
                max: maxReason,
                total: allDelayed.length,
                value: reasonFilter,
                onToggle: (slug) => setReasonFilter((f) => (f === slug ? "" : slug)),
              }}
            />
          </div>
        </div>
      </main>

      {/* Hộp thoại tạo trang tracking mới (Admin/PM) */}
      {newSheetOpen && <NewSheetModal sheets={sheets} onClose={() => setNewSheetOpen(false)} />}
    </div>
  );
}
