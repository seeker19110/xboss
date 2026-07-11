"use client";
import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  X,
  Radar,
  Users,
  Trash2,
  Pencil,
  AlertTriangle,
  Waves,
  Activity,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from "recharts";
import AppHeader from "@/app/components/AppHeader";
import EmptyState from "@/app/components/EmptyState";
import { PageSkeleton } from "@/app/components/Skeleton";
import { Modal, appConfirm } from "@/app/components/dialogs";
import { showToast } from "@/app/components/Toast";
import { fetchMe, type Me } from "@/app/lib/me";
import { formatDateVN, todayISO } from "@/lib/date";

type MonitoringKind = "lun" | "chuyen_vi" | "nghieng" | "lan_can" | "khac";
const KIND_LABEL: Record<MonitoringKind, string> = {
  lun: "Lún",
  chuyen_vi: "Chuyển vị",
  nghieng: "Nghiêng",
  lan_can: "Công trình lân cận",
  khac: "Khác",
};

type PointStatus = "active" | "stopped";
const POINT_STATUS_LABEL: Record<PointStatus, string> = {
  active: "Đang quan trắc",
  stopped: "Đã dừng",
};

type ReadingLevel = "normal" | "warn" | "alarm";
const LEVEL_LABEL: Record<ReadingLevel, string> = {
  normal: "Bình thường",
  warn: "Cảnh báo",
  alarm: "Báo động",
};
const LEVEL_BADGE: Record<ReadingLevel, string> = {
  normal: "bg-emerald-900 text-emerald-200",
  warn: "bg-amber-900 text-amber-200",
  alarm: "bg-rose-900 text-rose-200",
};

type CaseStatus = "open" | "handling" | "closed";
const CASE_STATUS_LABEL: Record<CaseStatus, string> = {
  open: "Mới tiếp nhận",
  handling: "Đang xử lý",
  closed: "Đã đóng",
};
const CASE_STATUS_BADGE: Record<CaseStatus, string> = {
  open: "bg-sky-900 text-sky-200",
  handling: "bg-amber-900 text-amber-200",
  closed: "bg-zinc-800 text-zinc-500",
};

type MonitoringPoint = {
  id: number;
  code: string;
  kind: MonitoringKind;
  location: string | null;
  warnThreshold: number | null;
  alarmThreshold: number | null;
  unit: string | null;
  status: PointStatus;
};

type Reading = {
  id: number;
  measuredAt: string;
  value: number;
  cumulative: number | null;
  level: ReadingLevel | null;
  note: string | null;
  recordedByName: string | null;
};

type CommunityCase = {
  id: number;
  code: string | null;
  title: string;
  source: string | null;
  receivedDate: string | null;
  status: CaseStatus;
  resolution: string | null;
  closedDate: string | null;
  createdByName: string | null;
};

type Tab = "quan-trac" | "cong-dong";

export default function MonitoringPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [tab, setTab] = useState<Tab>("quan-trac");
  const [points, setPoints] = useState<MonitoringPoint[]>([]);
  const [cases, setCases] = useState<CommunityCase[]>([]);
  const [selectedPointId, setSelectedPointId] = useState<number | null>(null);
  const [readings, setReadings] = useState<Reading[]>([]);
  const [loading, setLoading] = useState(true);
  const [addPointOpen, setAddPointOpen] = useState(false);
  const [editPoint, setEditPoint] = useState<MonitoringPoint | null>(null);
  const [addReadingOpen, setAddReadingOpen] = useState(false);
  const [addCaseOpen, setAddCaseOpen] = useState(false);
  const [editCase, setEditCase] = useState<CommunityCase | null>(null);

  const canManage = me?.role === "admin" || me?.role === "pm" || me?.role === "engineer";

  function loadBase() {
    return Promise.all([
      fetch("/api/monitoring-points").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/community-cases").then((r) => (r.ok ? r.json() : null)),
    ]);
  }

  useEffect(() => {
    Promise.all([fetchMe(), loadBase()])
      .then(([meData, [pointsRes, casesRes]]) => {
        if (!meData) return;
        setMe(meData);
        const pointList: MonitoringPoint[] = pointsRes?.points ?? [];
        setPoints(pointList);
        setCases(casesRes?.cases ?? []);
        if (pointList.length > 0) setSelectedPointId(pointList[0].id);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (selectedPointId == null) {
      setReadings([]);
      return;
    }
    fetch(`/api/monitoring-points/${selectedPointId}/readings`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setReadings(j?.readings ?? []));
  }, [selectedPointId]);

  async function refreshPoints() {
    const res = await fetch("/api/monitoring-points");
    const j = await res.json().catch(() => null);
    const list: MonitoringPoint[] = j?.points ?? [];
    setPoints(list);
    if (selectedPointId == null && list.length > 0) setSelectedPointId(list[0].id);
  }

  async function refreshReadings() {
    if (selectedPointId == null) return;
    const res = await fetch(`/api/monitoring-points/${selectedPointId}/readings`);
    const j = await res.json().catch(() => null);
    setReadings(j?.readings ?? []);
  }

  async function refreshCases() {
    const res = await fetch("/api/community-cases");
    const j = await res.json().catch(() => null);
    setCases(j?.cases ?? []);
  }

  async function deletePoint(id: number) {
    if (
      !(await appConfirm(
        "Xoá mốc quan trắc này? Toàn bộ kỳ đo sẽ bị xoá theo. Không thể hoàn tác.",
        { danger: true },
      ))
    )
      return;
    const res = await fetch(`/api/monitoring-points/${id}`, { method: "DELETE" });
    if (!res.ok) {
      showToast((await res.json().catch(() => null))?.error ?? "Xoá thất bại", "error");
      return;
    }
    if (selectedPointId === id) setSelectedPointId(null);
    refreshPoints();
  }

  async function deleteCase(id: number) {
    if (!(await appConfirm("Xoá khiếu nại này? Không thể hoàn tác.", { danger: true }))) return;
    const res = await fetch(`/api/community-cases/${id}`, { method: "DELETE" });
    if (!res.ok) {
      showToast((await res.json().catch(() => null))?.error ?? "Xoá thất bại", "error");
      return;
    }
    refreshCases();
  }

  async function changeCaseStatus(item: CommunityCase, status: CaseStatus) {
    const res = await fetch(`/api/community-cases/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      showToast((await res.json().catch(() => null))?.error ?? "Cập nhật thất bại", "error");
      return;
    }
    refreshCases();
  }

  const selectedPoint = useMemo(
    () => points.find((p) => p.id === selectedPointId) ?? null,
    [points, selectedPointId],
  );

  const latestLevelByPoint = useMemo(() => {
    // Chỉ đủ dữ liệu cho mốc đang chọn (readings chỉ tải cho 1 mốc) — dùng cho badge KPI
    // tính từ danh sách alarm/warn phía server thông qua points (không có sẵn mức mới
    // nhất từng mốc ở đây) — dùng readings hiện tại của mốc đang chọn để hiện badge chi tiết.
    if (!selectedPoint || readings.length === 0) return null;
    return readings[readings.length - 1].level;
  }, [selectedPoint, readings]);

  const kpi = useMemo(() => {
    const handling = cases.filter((c) => c.status !== "closed").length;
    return { handling };
  }, [cases]);

  const [alarmCount, setAlarmCount] = useState(0);
  const [warnCount, setWarnCount] = useState(0);
  useEffect(() => {
    // KPI mức alarm/warn toàn dự án: gọi chuỗi mỗi mốc song song (số mốc thường nhỏ).
    let cancelled = false;
    (async () => {
      if (points.length === 0) {
        setAlarmCount(0);
        setWarnCount(0);
        return;
      }
      const results = await Promise.all(
        points.map((p) =>
          fetch(`/api/monitoring-points/${p.id}/readings`)
            .then((r) => (r.ok ? r.json() : null))
            .then((j: { readings?: Reading[] } | null) => {
              const list = j?.readings ?? [];
              return list.length > 0 ? list[list.length - 1].level : null;
            })
            .catch(() => null),
        ),
      );
      if (cancelled) return;
      setAlarmCount(results.filter((l) => l === "alarm").length);
      setWarnCount(results.filter((l) => l === "warn").length);
    })();
    return () => {
      cancelled = true;
    };
  }, [points]);

  if (loading) return <PageSkeleton />;

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <AppHeader
        title="Quan hệ & Quan trắc"
        subtitle="Quan trắc lún/chuyển vị/nghiêng công trình & quan hệ cộng đồng"
        bottomActions={
          canManage ? (
            <div className="flex items-center gap-2">
              {tab === "quan-trac" ? (
                <>
                  <button
                    onClick={() => setAddPointOpen(true)}
                    aria-label="Thêm mốc quan trắc"
                    className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-600 px-3 sm:px-4 py-2 rounded-lg text-sm font-semibold transition shrink-0 text-on-accent"
                  >
                    <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Thêm mốc</span>
                  </button>
                  {selectedPointId != null && (
                    <button
                      onClick={() => setAddReadingOpen(true)}
                      aria-label="Ghi kỳ đo"
                      className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 px-3 sm:px-4 py-2 rounded-lg text-sm font-semibold transition shrink-0"
                    >
                      <Activity className="w-4 h-4" />{" "}
                      <span className="hidden sm:inline">Ghi kỳ đo</span>
                    </button>
                  )}
                </>
              ) : (
                <button
                  onClick={() => setAddCaseOpen(true)}
                  aria-label="Thêm khiếu nại"
                  className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-600 px-3 sm:px-4 py-2 rounded-lg text-sm font-semibold transition shrink-0 text-on-accent"
                >
                  <Plus className="w-4 h-4" />{" "}
                  <span className="hidden sm:inline">Thêm khiếu nại</span>
                </button>
              )}
            </div>
          ) : undefined
        }
      />

      <main className="p-4 sm:p-6 pb-24 space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
            <p className={`text-2xl font-bold ${alarmCount > 0 ? "text-rose-400" : ""}`}>
              {alarmCount}
            </p>
            <p className="text-xs text-zinc-400">Mốc mức báo động</p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
            <p className={`text-2xl font-bold ${warnCount > 0 ? "text-amber-400" : ""}`}>
              {warnCount}
            </p>
            <p className="text-xs text-zinc-400">Mốc mức cảnh báo</p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
            <p className={`text-2xl font-bold ${kpi.handling > 0 ? "text-sky-400" : ""}`}>
              {kpi.handling}
            </p>
            <p className="text-xs text-zinc-400">Khiếu nại đang xử lý</p>
          </div>
        </div>

        <div
          className="flex flex-wrap gap-1.5"
          role="tablist"
          aria-label="Nhóm quan hệ & quan trắc"
        >
          <button
            role="tab"
            aria-selected={tab === "quan-trac"}
            onClick={() => setTab("quan-trac")}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border flex items-center gap-1.5 ${
              tab === "quan-trac"
                ? "bg-zinc-700 border-zinc-600 text-white"
                : "border-zinc-700 text-zinc-400 hover:text-white"
            }`}
          >
            <Radar className="w-3.5 h-3.5" /> Quan trắc ({points.length})
          </button>
          <button
            role="tab"
            aria-selected={tab === "cong-dong"}
            onClick={() => setTab("cong-dong")}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border flex items-center gap-1.5 ${
              tab === "cong-dong"
                ? "bg-zinc-700 border-zinc-600 text-white"
                : "border-zinc-700 text-zinc-400 hover:text-white"
            }`}
          >
            <Users className="w-3.5 h-3.5" /> Cộng đồng ({cases.length})
          </button>
        </div>

        {tab === "quan-trac" ? (
          points.length === 0 ? (
            <EmptyState
              icon={Radar}
              title="Chưa có mốc quan trắc"
              message="Bấm “Thêm mốc” để thêm mốc lún/chuyển vị/nghiêng."
            />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-1 bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                <ul role="list" aria-label="Danh sách mốc quan trắc">
                  {points.map((p) => (
                    <li key={p.id} className="border-b border-zinc-800/60 last:border-0">
                      <button
                        onClick={() => setSelectedPointId(p.id)}
                        className={`w-full text-left p-3 flex items-center justify-between gap-2 transition ${
                          selectedPointId === p.id ? "bg-zinc-800" : "hover:bg-zinc-800/50"
                        }`}
                      >
                        <div>
                          <p className="text-sm font-medium">{p.code}</p>
                          <p className="text-xs text-zinc-400">
                            {KIND_LABEL[p.kind]}
                            {p.location ? ` · ${p.location}` : ""}
                          </p>
                        </div>
                        {p.status === "stopped" && (
                          <span className="text-xs text-zinc-500 shrink-0">Đã dừng</span>
                        )}
                      </button>
                      {canManage && selectedPointId === p.id && (
                        <div className="flex items-center gap-3 px-3 pb-2 text-xs">
                          <button
                            onClick={() => setEditPoint(p)}
                            aria-label="Sửa mốc"
                            className="text-zinc-400 hover:text-white flex items-center gap-1"
                          >
                            <Pencil className="w-3.5 h-3.5" /> Sửa
                          </button>
                          <button
                            onClick={() => deletePoint(p.id)}
                            aria-label="Xoá mốc"
                            className="text-zinc-400 hover:text-rose-400 flex items-center gap-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Xoá
                          </button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="lg:col-span-2 bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                {!selectedPoint ? (
                  <EmptyState message="Chọn 1 mốc để xem biểu đồ." compact />
                ) : (
                  <>
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h2 className="font-semibold text-sm text-zinc-300 flex items-center gap-2">
                        <Waves className="w-4 h-4 text-sky-400" /> {selectedPoint.code}
                      </h2>
                      {latestLevelByPoint && (
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${LEVEL_BADGE[latestLevelByPoint]}`}
                        >
                          {latestLevelByPoint !== "normal" && <AlertTriangle className="w-3 h-3" />}
                          {LEVEL_LABEL[latestLevelByPoint]}
                        </span>
                      )}
                      <span className="text-xs text-zinc-500 ml-auto">
                        Ngưỡng cảnh báo {selectedPoint.warnThreshold ?? "—"} / báo động{" "}
                        {selectedPoint.alarmThreshold ?? "—"} {selectedPoint.unit ?? ""}
                      </span>
                    </div>

                    {readings.length < 2 ? (
                      <EmptyState
                        icon={Activity}
                        title="Chưa đủ dữ liệu vẽ biểu đồ"
                        message="Cần ít nhất 2 kỳ đo — bấm “Ghi kỳ đo” để thêm."
                        compact
                      />
                    ) : (
                      <div style={{ width: "100%", height: 260 }}>
                        <ResponsiveContainer>
                          <LineChart
                            data={readings.map((r) => ({
                              date: r.measuredAt,
                              gia_tri: r.cumulative ?? r.value,
                            }))}
                            margin={{ top: 8, right: 8, bottom: 8, left: -16 }}
                          >
                            <XAxis
                              dataKey="date"
                              stroke="var(--color-zinc-500)"
                              fontSize={10}
                              tickFormatter={(d) => formatDateVN(String(d))}
                              minTickGap={40}
                            />
                            <YAxis stroke="var(--color-zinc-500)" fontSize={11} />
                            <Tooltip
                              contentStyle={{
                                background: "var(--color-zinc-900)",
                                border: "1px solid var(--color-zinc-700)",
                                color: "var(--foreground)",
                                borderRadius: 8,
                                fontSize: 12,
                              }}
                              labelFormatter={(d) => formatDateVN(String(d))}
                              formatter={(v) => [`${v} ${selectedPoint.unit ?? ""}`, "Giá trị"]}
                            />
                            <Legend
                              formatter={(v) =>
                                v === "gia_tri"
                                  ? "Giá trị đo"
                                  : v === "warn"
                                    ? "Ngưỡng cảnh báo"
                                    : "Ngưỡng báo động"
                              }
                              wrapperStyle={{ fontSize: 12 }}
                            />
                            {selectedPoint.warnThreshold != null && (
                              <ReferenceLine
                                y={selectedPoint.warnThreshold}
                                stroke="var(--color-amber-400)"
                                strokeDasharray="4 4"
                                label={{
                                  value: "Cảnh báo",
                                  fill: "var(--color-amber-400)",
                                  fontSize: 10,
                                }}
                              />
                            )}
                            {selectedPoint.alarmThreshold != null && (
                              <ReferenceLine
                                y={selectedPoint.alarmThreshold}
                                stroke="var(--color-rose-400)"
                                strokeDasharray="4 4"
                                label={{
                                  value: "Báo động",
                                  fill: "var(--color-rose-400)",
                                  fontSize: 10,
                                }}
                              />
                            )}
                            <Line
                              type="monotone"
                              dataKey="gia_tri"
                              stroke="var(--color-sky-400)"
                              strokeWidth={2.5}
                              dot={{ r: 3 }}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    )}

                    <div
                      className="mt-3 overflow-x-auto"
                      tabIndex={0}
                      role="region"
                      aria-label="Bảng kỳ đo"
                    >
                      <table className="w-full text-xs sm:min-w-[420px]">
                        <thead>
                          <tr className="text-zinc-400 border-b border-zinc-800">
                            <th className="text-left p-2">NGÀY ĐO</th>
                            <th className="text-left p-2">GIÁ TRỊ</th>
                            <th className="text-left p-2">LUỸ KẾ</th>
                            <th className="text-left p-2">MỨC</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...readings].reverse().map((r) => (
                            <tr key={r.id} className="border-b border-zinc-800/60 last:border-0">
                              <td className="p-2">{formatDateVN(r.measuredAt)}</td>
                              <td className="p-2">{r.value}</td>
                              <td className="p-2">{r.cumulative ?? "—"}</td>
                              <td className="p-2">
                                {r.level && (
                                  <span
                                    className={`inline-block px-1.5 py-0.5 rounded ${LEVEL_BADGE[r.level]}`}
                                  >
                                    {LEVEL_LABEL[r.level]}
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            </div>
          )
        ) : cases.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Chưa có khiếu nại"
            message="Bấm “Thêm khiếu nại” để ghi nhận phản ánh từ dân cư/chính quyền."
          />
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div
              className="overflow-x-auto"
              tabIndex={0}
              role="region"
              aria-label="Danh sách khiếu nại"
            >
              <table className="w-full text-sm sm:min-w-[720px]">
                <thead>
                  <tr className="text-xs text-zinc-400 border-b border-zinc-800">
                    <th className="text-left p-3">TIÊU ĐỀ</th>
                    <th className="text-left p-3">NGUỒN</th>
                    <th className="text-left p-3">NGÀY TIẾP NHẬN</th>
                    <th className="text-left p-3">TRẠNG THÁI</th>
                    <th className="text-left p-3 w-24"></th>
                  </tr>
                </thead>
                <tbody>
                  {cases.map((c) => (
                    <tr key={c.id} className="border-b border-zinc-800/60 last:border-0">
                      <td className="p-3">
                        <p className="truncate max-w-[280px]">{c.title}</p>
                        {c.code && <p className="text-xs text-zinc-500">{c.code}</p>}
                      </td>
                      <td className="p-3 text-xs text-zinc-400">{c.source ?? "—"}</td>
                      <td className="p-3 text-xs text-zinc-400">
                        {c.receivedDate ? formatDateVN(c.receivedDate) : "—"}
                      </td>
                      <td className="p-3">
                        {canManage ? (
                          <select
                            aria-label={`Trạng thái khiếu nại ${c.title}`}
                            value={c.status}
                            onChange={(e) => changeCaseStatus(c, e.target.value as CaseStatus)}
                            className={`px-2 py-0.5 rounded text-xs font-medium border-0 outline-none ${CASE_STATUS_BADGE[c.status]}`}
                          >
                            {(Object.keys(CASE_STATUS_LABEL) as CaseStatus[]).map((s) => (
                              <option key={s} value={s} className="bg-zinc-900 text-white">
                                {CASE_STATUS_LABEL[s]}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${CASE_STATUS_BADGE[c.status]}`}
                          >
                            {CASE_STATUS_LABEL[c.status]}
                          </span>
                        )}
                      </td>
                      <td className="p-3">
                        {canManage && (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setEditCase(c)}
                              aria-label="Sửa khiếu nại"
                              className="text-zinc-400 hover:text-white"
                              title="Sửa"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => deleteCase(c.id)}
                              aria-label="Xoá khiếu nại"
                              className="text-zinc-400 hover:text-rose-400"
                              title="Xoá"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
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
      </main>

      {(addPointOpen || editPoint) && (
        <PointModal
          point={editPoint}
          onClose={() => {
            setAddPointOpen(false);
            setEditPoint(null);
          }}
          onSaved={() => {
            setAddPointOpen(false);
            setEditPoint(null);
            refreshPoints();
          }}
        />
      )}

      {addReadingOpen && selectedPointId != null && (
        <ReadingModal
          pointId={selectedPointId}
          onClose={() => setAddReadingOpen(false)}
          onSaved={() => {
            setAddReadingOpen(false);
            refreshReadings();
          }}
        />
      )}

      {(addCaseOpen || editCase) && (
        <CaseModal
          item={editCase}
          onClose={() => {
            setAddCaseOpen(false);
            setEditCase(null);
          }}
          onSaved={() => {
            setAddCaseOpen(false);
            setEditCase(null);
            refreshCases();
          }}
        />
      )}
    </div>
  );
}

function PointModal({
  point,
  onClose,
  onSaved,
}: {
  point: MonitoringPoint | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [code, setCode] = useState(point?.code ?? "");
  const [kind, setKind] = useState<MonitoringKind>(point?.kind ?? "lun");
  const [location, setLocation] = useState(point?.location ?? "");
  const [warnThreshold, setWarnThreshold] = useState(point?.warnThreshold?.toString() ?? "");
  const [alarmThreshold, setAlarmThreshold] = useState(point?.alarmThreshold?.toString() ?? "");
  const [unit, setUnit] = useState(point?.unit ?? "mm");
  const [status, setStatus] = useState<PointStatus>(point?.status ?? "active");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const canSubmit = code.trim().length > 0;

  async function submit() {
    setSaving(true);
    setErr("");
    try {
      const payload = {
        code: code.trim(),
        kind,
        location: location.trim() || null,
        warnThreshold: warnThreshold === "" ? null : Number(warnThreshold),
        alarmThreshold: alarmThreshold === "" ? null : Number(alarmThreshold),
        unit: unit.trim() || null,
        status,
      };
      const url = point ? `/api/monitoring-points/${point.id}` : "/api/monitoring-points";
      const res = await fetch(url, {
        method: point ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        setErr((await res.json().catch(() => null))?.error ?? "Không lưu được mốc quan trắc");
        return;
      }
      onSaved();
    } catch {
      setErr("Mất kết nối — kiểm tra mạng rồi thử lại");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal onClose={onClose} className="max-w-md">
      <div className="p-5 space-y-3 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">{point ? "Sửa mốc quan trắc" : "Thêm mốc quan trắc"}</h2>
          <button onClick={onClose} aria-label="Đóng" className="text-zinc-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <label className="text-xs text-zinc-400 block">
          Mã mốc
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          />
        </label>

        <label className="text-xs text-zinc-400 block">
          Loại
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as MonitoringKind)}
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          >
            {(Object.keys(KIND_LABEL) as MonitoringKind[]).map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs text-zinc-400 block">
          Vị trí
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          />
        </label>

        <div className="grid grid-cols-3 gap-3">
          <label className="text-xs text-zinc-400">
            Ngưỡng cảnh báo
            <input
              type="number"
              value={warnThreshold}
              onChange={(e) => setWarnThreshold(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-zinc-400">
            Ngưỡng báo động
            <input
              type="number"
              value={alarmThreshold}
              onChange={(e) => setAlarmThreshold(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-zinc-400">
            Đơn vị
            <input
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
        </div>

        <label className="text-xs text-zinc-400 block">
          Trạng thái
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as PointStatus)}
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          >
            {(Object.keys(POINT_STATUS_LABEL) as PointStatus[]).map((s) => (
              <option key={s} value={s}>
                {POINT_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>

        {err && <p className="text-sm text-rose-300">{err}</p>}
        <button
          onClick={submit}
          disabled={saving || !canSubmit}
          className="w-full bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-on-accent font-semibold py-2 rounded-lg text-sm"
        >
          {saving ? "Đang lưu…" : "Lưu"}
        </button>
      </div>
    </Modal>
  );
}

function ReadingModal({
  pointId,
  onClose,
  onSaved,
}: {
  pointId: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [measuredAt, setMeasuredAt] = useState(todayISO());
  const [value, setValue] = useState("");
  const [cumulative, setCumulative] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const canSubmit = measuredAt.trim().length > 0 && value.trim().length > 0;

  async function submit() {
    setSaving(true);
    setErr("");
    try {
      const payload = {
        measuredAt,
        value: Number(value),
        cumulative: cumulative === "" ? null : Number(cumulative),
        note: note.trim() || null,
      };
      const res = await fetch(`/api/monitoring-points/${pointId}/readings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        setErr((await res.json().catch(() => null))?.error ?? "Không ghi được kỳ đo");
        return;
      }
      onSaved();
    } catch {
      setErr("Mất kết nối — kiểm tra mạng rồi thử lại");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal onClose={onClose} className="max-w-md">
      <div className="p-5 space-y-3 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Ghi kỳ đo</h2>
          <button onClick={onClose} aria-label="Đóng" className="text-zinc-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <label className="text-xs text-zinc-400 block">
          Ngày đo
          <input
            type="date"
            value={measuredAt}
            onChange={(e) => setMeasuredAt(e.target.value)}
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-zinc-400">
            Giá trị đo
            <input
              type="number"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-zinc-400">
            Luỹ kế (nếu có)
            <input
              type="number"
              value={cumulative}
              onChange={(e) => setCumulative(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
        </div>

        <label className="text-xs text-zinc-400 block">
          Ghi chú
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          />
        </label>

        {err && <p className="text-sm text-rose-300">{err}</p>}
        <button
          onClick={submit}
          disabled={saving || !canSubmit}
          className="w-full bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-on-accent font-semibold py-2 rounded-lg text-sm"
        >
          {saving ? "Đang lưu…" : "Lưu"}
        </button>
      </div>
    </Modal>
  );
}

function CaseModal({
  item,
  onClose,
  onSaved,
}: {
  item: CommunityCase | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [code, setCode] = useState(item?.code ?? "");
  const [title, setTitle] = useState(item?.title ?? "");
  const [source, setSource] = useState(item?.source ?? "");
  const [receivedDate, setReceivedDate] = useState(item?.receivedDate ?? todayISO());
  const [status, setStatus] = useState<CaseStatus>(item?.status ?? "open");
  const [resolution, setResolution] = useState(item?.resolution ?? "");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const canSubmit = title.trim().length > 0;

  async function submit() {
    setSaving(true);
    setErr("");
    try {
      const payload = {
        code: code.trim() || null,
        title: title.trim(),
        source: source.trim() || null,
        receivedDate: receivedDate || null,
        status,
        resolution: resolution.trim() || null,
      };
      const url = item ? `/api/community-cases/${item.id}` : "/api/community-cases";
      const res = await fetch(url, {
        method: item ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        setErr((await res.json().catch(() => null))?.error ?? "Không lưu được khiếu nại");
        return;
      }
      onSaved();
    } catch {
      setErr("Mất kết nối — kiểm tra mạng rồi thử lại");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal onClose={onClose} className="max-w-md">
      <div className="p-5 space-y-3 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">{item ? "Sửa khiếu nại" : "Thêm khiếu nại"}</h2>
          <button onClick={onClose} aria-label="Đóng" className="text-zinc-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <label className="text-xs text-zinc-400 block">
          Tiêu đề
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-zinc-400">
            Số hồ sơ
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-zinc-400">
            Nguồn (dân cư/chính quyền...)
            <input
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-zinc-400">
            Ngày tiếp nhận
            <input
              type="date"
              value={receivedDate}
              onChange={(e) => setReceivedDate(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-zinc-400">
            Trạng thái
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as CaseStatus)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            >
              {(Object.keys(CASE_STATUS_LABEL) as CaseStatus[]).map((s) => (
                <option key={s} value={s}>
                  {CASE_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="text-xs text-zinc-400 block">
          Hướng xử lý / kết quả
          <textarea
            value={resolution}
            onChange={(e) => setResolution(e.target.value)}
            rows={2}
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          />
        </label>

        {err && <p className="text-sm text-rose-300">{err}</p>}
        <button
          onClick={submit}
          disabled={saving || !canSubmit}
          className="w-full bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-on-accent font-semibold py-2 rounded-lg text-sm"
        >
          {saving ? "Đang lưu…" : "Lưu"}
        </button>
      </div>
    </Modal>
  );
}
