"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Bell,
  ClipboardList,
  LayoutDashboard,
  NotebookPen,
  Table2,
  Timer,
  TrendingDown,
} from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import EmptyState from "@/app/components/EmptyState";
import { ErrorState } from "@/app/components/ErrorState";
import ProgressRow from "@/app/components/ProgressRow";
import { PageSkeleton } from "@/app/components/Skeleton";
import { Button, ButtonLink, Card, Chip, Section, StatCard } from "@/app/components/ui";
import type { Me } from "@/app/lib/me";
import { redirectToLogin } from "@/app/lib/me";
import { taiJson } from "@/app/lib/taiDuLieu";
import { trackingUrl } from "@/app/lib/trackingUrl";
import { useIsCompact } from "@/app/lib/useIsCompact";
import { daysFromTodayISO, daysOverdue, todayISO } from "@/lib/nen/date";

// Chế độ "Hiện trường" của trang chủ (M127 FR8–FR13) — trả lời đúng câu hỏi của người thi
// công: "hôm nay tôi làm gì, cái gì sắp trễ, tick ở đâu". Mặc định cho kỹ sư, bắt buộc với
// thầu phụ (vai trò này không có quyền `viewDashboard` nên bố cục Điều hành chỉ là trang
// trống đầy số 0 — đúng lỗi M127 đi sửa).
//
// CHỈ gọi 4 API mà thầu phụ đều được phép: /api/my-tasks, /api/notifications, /api/sheets,
// /api/project. Không gọi /api/dashboard và không import panel nặng (recharts) — trang phải
// mở nhanh trên điện thoại sóng yếu ngoài công trường.

type MyTask = {
  id: number;
  code: string;
  name: string;
  status: string;
  endDate: string | null;
  progressPercent: number;
  floorLabel: string | null;
  sheetType: string;
  sheetSlug?: string | null;
};
type Summary = {
  total: number;
  delayed: number;
  done: number;
  /** Số việc sắp đến hạn theo ngưỡng `alert_rules` của dự án (server tính — FR9/§10). */
  dueSoon: number;
  dueSoonDays: number;
};
type Notif = {
  id: number;
  taskId: number | null;
  message: string;
  isRead: number;
  sheetSlug: string | null;
  floorLabel: string | null;
};
type SheetNav = { id: number; code: string; name: string; slug: string };

/** Số việc hiện lên đầu trang — dài hơn thì xem ở /my-tasks. */
const MAX_VIEC = 8;

/** Việc còn phải làm (chưa xong, chưa nghiệm thu). */
const chuaXong = (t: MyTask) =>
  t.progressPercent < 1 && t.status !== "hoan_thanh" && t.status !== "nghiem_thu";

/** "Thứ Ba, 22/09" theo ngày Việt Nam (todayISO đã +7h) — ép UTC để không lệch máy khách. */
function nhanNgayHomNay(): string {
  return new Date(`${todayISO()}T00:00:00Z`).toLocaleDateString("vi-VN", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  });
}

export default function HomeHienTruong({
  me,
  onSwitchMode,
}: {
  me: Me;
  /**
   * Chuyển sang chế độ Điều hành — chỉ truyền cho vai trò được phép đổi (kỹ sư).
   * `luu = false` khi chuyển do phân hệ Hiện trường bị tắt (không ghi đè lựa chọn của
   * người dùng, bật lại phân hệ là họ về đúng chế độ đã chọn).
   */
  onSwitchMode?: (luu?: boolean) => void;
}) {
  const compact = useIsCompact();
  const [tasks, setTasks] = useState<MyTask[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [unread, setUnread] = useState(0);
  const [sheets, setSheets] = useState<SheetNav[]>([]);
  const [tenDuAn, setTenDuAn] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loi, setLoi] = useState<string | null>(null);
  // Phân hệ "field" bị tắt cho dự án này (/api/my-tasks trả 404) — kỹ sư rơi về Điều hành,
  // thầu phụ thấy thông báo rõ thay vì danh sách rỗng khó hiểu.
  const [moduleTat, setModuleTat] = useState(false);

  const tai = useCallback(async () => {
    setLoading(true);
    setLoi(null);
    setModuleTat(false);
    // /api/my-tasks đi bằng fetch trần (không qua taiJson) vì cần PHÂN BIỆT 404 "phân hệ
    // đang tắt" với lỗi tải thật — taiJson chỉ trả thông điệp, không trả mã HTTP.
    const [res, tb, sh, da] = await Promise.all([
      fetch("/api/my-tasks").catch(() => null),
      taiJson<{ notifications: Notif[]; unread: number }>("/api/notifications?limit=20"),
      taiJson<{ sheets: SheetNav[] }>("/api/sheets"),
      taiJson<{ name: string | null }>("/api/project"),
    ]);
    setSheets(sh.ok ? (sh.data.sheets ?? []) : []);
    setTenDuAn(da.ok ? (da.data.name ?? null) : null);
    setNotifs(tb.ok ? (tb.data.notifications ?? []) : []);
    setUnread(tb.ok ? (tb.data.unread ?? 0) : 0);
    if (!res) {
      setLoi("Mất kết nối — kiểm tra mạng rồi thử lại");
    } else if (res.status === 401) {
      await redirectToLogin();
    } else if (res.status === 404) {
      setModuleTat(true);
    } else if (!res.ok) {
      const j = await res.json().catch(() => null);
      setLoi(j?.error ?? `Không tải được việc của tôi (lỗi ${res.status})`);
    } else {
      const j = (await res.json()) as { tasks: MyTask[]; summary: Summary };
      setTasks(j.tasks ?? []);
      setSummary(j.summary ?? null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void tai();
  }, [tai]);

  // Phân hệ tắt: kỹ sư có bố cục khác để dùng → chuyển luôn, không bắt họ nhìn trang cụt.
  useEffect(() => {
    if (moduleTat && onSwitchMode) onSwitchMode(false);
  }, [moduleTat, onSwitchMode]);

  const today = todayISO();
  const dueSoonDays = summary?.dueSoonDays ?? 3;
  // "Việc hôm nay" = trễ trước (hạn gần nhất lên đầu), rồi tới việc sắp đến hạn trong
  // ngưỡng cảnh báo của dự án. /api/my-tasks đã sắp theo hạn tăng dần nên giữ nguyên thứ tự.
  const viecHomNay = useMemo(() => {
    const han = daysFromTodayISO(dueSoonDays);
    const tre = tasks.filter((t) => t.endDate && t.endDate < today && chuaXong(t));
    const denHan = tasks.filter(
      (t) => t.endDate && t.endDate >= today && t.endDate <= han && chuaXong(t),
    );
    return [...tre, ...denHan].slice(0, MAX_VIEC);
  }, [tasks, today, dueSoonDays]);

  const tbChuaDoc = useMemo(() => notifs.filter((n) => !n.isRead).slice(0, 3), [notifs]);
  const dangLam = summary ? Math.max(0, summary.total - summary.done - summary.delayed) : 0;
  const slugDau = sheets[0]?.slug ?? null;

  // 3 hành động nhanh — cũng là thanh đáy trên điện thoại (thay Import/Excel/PDF vốn kỹ sư
  // và thầu phụ không có quyền dùng).
  const hanhDongNhanh = (
    <>
      <ButtonLink
        href={slugDau ? `/tracking/${slugDau}` : "/schedule"}
        variant="primary"
        icon={Table2}
        className="min-h-12 justify-center"
      >
        Lưới tracking
      </ButtonLink>
      <ButtonLink
        href="/site?tab=tasks-diary"
        icon={NotebookPen}
        className="min-h-12 justify-center"
      >
        Nhật ký hôm nay
      </ButtonLink>
      <ButtonLink
        href="/notifications"
        icon={Bell}
        className="min-h-12 justify-center"
        aria-label={`Thông báo${unread > 0 ? ` — ${unread} chưa đọc` : ""}`}
      >
        Thông báo
        {unread > 0 && (
          <Chip tone="danger" className="ml-1">
            {unread > 99 ? "99+" : unread}
          </Chip>
        )}
      </ButtonLink>
    </>
  );

  if (loading) return <PageSkeleton />;
  if (loi)
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
        <AppHeader />
        <ErrorState message={loi} onRetry={() => void tai()} />
      </div>
    );

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <AppHeader
        bottomActions={
          compact ? <div className="grid grid-cols-3 gap-2 flex-1">{hanhDongNhanh}</div> : undefined
        }
      />

      {/* pb-24 chừa chỗ cho thanh cố định dưới đáy trên mobile */}
      <main className="px-4 sm:px-6 py-6 pb-24 space-y-6 max-w-screen-md mx-auto">
        <Section
          title={`Xin chào, ${me.name}`}
          description={`${nhanNgayHomNay()}${tenDuAn ? ` · ${tenDuAn}` : ""}`}
          actions={
            onSwitchMode && (
              <Button variant="ghost" icon={LayoutDashboard} onClick={() => onSwitchMode()}>
                Xem tổng quan
              </Button>
            )
          }
        >
          {moduleTat ? (
            <Card pad="none">
              <EmptyState
                icon={ClipboardList}
                title="Phân hệ Hiện trường đang tắt"
                message="Phân hệ Hiện trường đang tắt cho dự án này — liên hệ Admin/PM nếu bạn cần theo dõi việc được giao."
              />
            </Card>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              <StatCard
                label={`Đến hạn ≤${dueSoonDays} ngày`}
                value={summary?.dueSoon ?? 0}
                tone={(summary?.dueSoon ?? 0) > 0 ? "warning" : "neutral"}
                icon={Timer}
              />
              <StatCard
                label="Trễ"
                value={summary?.delayed ?? 0}
                tone={(summary?.delayed ?? 0) > 0 ? "danger" : "success"}
                icon={TrendingDown}
              />
              <StatCard label="Đang làm" value={dangLam} tone="info" icon={ClipboardList} />
            </div>
          )}
        </Section>

        {!moduleTat && (
          <Section title="Việc hôm nay" description={`${viecHomNay.length} việc cần xử lý`}>
            <Card pad="sm">
              {tasks.length === 0 ? (
                <EmptyState
                  compact
                  icon={ClipboardList}
                  title="Chưa có việc được giao"
                  message="Bạn chưa được giao công việc — liên hệ PM để được phân công."
                />
              ) : viecHomNay.length === 0 ? (
                <EmptyState
                  compact
                  icon={ClipboardList}
                  title="Không có việc gấp"
                  message={`Không có việc trễ hay đến hạn trong ${dueSoonDays} ngày tới. Xem toàn bộ việc được giao ở "Tất cả việc của tôi".`}
                />
              ) : (
                <ul className="space-y-0.5">
                  {viecHomNay.map((t) => {
                    const tre = !!t.endDate && t.endDate < today;
                    // daysOverdue(hạn, mốc) = số ngày mốc vượt hạn → đảo tham số để lấy
                    // "còn bao nhiêu ngày nữa tới hạn" (cùng một công thức, không viết lại).
                    const treNgay = t.endDate ? daysOverdue(t.endDate, today) : 0;
                    const conLai = t.endDate ? daysOverdue(today, t.endDate) : 0;
                    return (
                      <li key={t.id}>
                        <ProgressRow
                          href={trackingUrl(t.sheetSlug, t.sheetType, t.floorLabel) ?? undefined}
                          label={`${t.code} · ${t.name}`}
                          hint={`${t.floorLabel ?? "—"} · ${t.sheetType}`}
                          percent={t.progressPercent * 100}
                          badge={
                            tre ? (
                              <Chip tone="danger" icon={AlertTriangle}>
                                Trễ {treNgay} ngày
                              </Chip>
                            ) : (
                              <Chip tone="warning" icon={Timer}>
                                {conLai === 0 ? "Hôm nay" : `Còn ${conLai} ngày`}
                              </Chip>
                            )
                          }
                        />
                      </li>
                    );
                  })}
                </ul>
              )}
              <div className="pt-2">
                <ButtonLink href="/my-tasks" variant="ghost" size="sm" icon={ClipboardList}>
                  Tất cả việc của tôi →
                </ButtonLink>
              </div>
            </Card>
          </Section>
        )}

        {/* 3 hành động nhanh trong luồng trang (FR11) — trên điện thoại bộ nút này còn được
            lặp ở thanh đáy cố định để ngón tay với tới ngay, không phải cuộn. */}
        <div className="grid grid-cols-3 gap-2">{hanhDongNhanh}</div>

        {tbChuaDoc.length > 0 && (
          <Section title="Thông báo mới" description={`${unread} thông báo chưa đọc`}>
            <Card tone="sunken" pad="sm">
              <ul className="space-y-1">
                {tbChuaDoc.map((n) => {
                  const url = n.taskId ? trackingUrl(n.sheetSlug, null, n.floorLabel) : null;
                  return (
                    <li key={n.id} className="text-xs text-zinc-300">
                      {url ? (
                        <a
                          href={url}
                          className="flex items-start gap-1.5 min-h-10 px-2 py-1 rounded-lg hover:bg-zinc-800/60 transition"
                        >
                          <Bell
                            className="w-3.5 h-3.5 mt-1 shrink-0 text-amber-300"
                            strokeWidth={1.75}
                            aria-hidden="true"
                          />
                          <span>{n.message}</span>
                        </a>
                      ) : (
                        <span className="flex items-start gap-1.5 px-2 py-1">
                          <Bell
                            className="w-3.5 h-3.5 mt-1 shrink-0 text-amber-300"
                            strokeWidth={1.75}
                            aria-hidden="true"
                          />
                          <span>{n.message}</span>
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Card>
          </Section>
        )}
      </main>
    </div>
  );
}
