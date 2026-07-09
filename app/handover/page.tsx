"use client";
import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  X,
  PackageCheck,
  FlaskConical,
  ClipboardCheck,
  ListChecks,
  Boxes,
  BookOpen,
  Paperclip,
  Trash2,
  Pencil,
  CheckCircle2,
  AlertTriangle,
  Upload,
  ThumbsUp,
  ThumbsDown,
} from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import EmptyState from "@/app/components/EmptyState";
import { PageSkeleton } from "@/app/components/Skeleton";
import { Modal, appConfirm } from "@/app/components/dialogs";
import { showToast } from "@/app/components/Toast";
import { fetchMe, type Me } from "@/app/lib/me";
import { formatDateVN, todayISO } from "@/lib/date";

// ===== Kiểu dữ liệu (client) — mirror lib/handover.ts =====

type CommissioningResult = "draft" | "testing" | "passed" | "failed";
const RESULT_LABEL: Record<CommissioningResult, string> = {
  draft: "Nháp",
  testing: "Đang chạy thử",
  passed: "Đạt",
  failed: "Không đạt",
};
const RESULT_BADGE: Record<CommissioningResult, string> = {
  draft: "bg-zinc-800 text-zinc-400",
  testing: "bg-sky-900/40 text-sky-300",
  passed: "bg-emerald-900/40 text-emerald-300",
  failed: "bg-rose-900/40 text-rose-300",
};

type ChecklistItem = {
  label: string;
  type: "pass_fail" | "measure";
  unit?: string;
  designValue?: string;
};

type Commissioning = {
  id: number;
  code: string | null;
  systemName: string;
  disciplineId: number | null;
  disciplineName: string | null;
  checklist: ChecklistItem[] | null;
  result: CommissioningResult;
  testedAt: string | null;
  note: string | null;
};

type HandoverStatus = "pending" | "handed_over" | "accepted";
const HANDOVER_STATUS_LABEL: Record<HandoverStatus, string> = {
  pending: "Chưa bàn giao",
  handed_over: "Đã bàn giao",
  accepted: "Đã nghiệm thu",
};
const HANDOVER_STATUS_BADGE: Record<HandoverStatus, string> = {
  pending: "bg-zinc-800 text-zinc-400",
  handed_over: "bg-sky-900/40 text-sky-300",
  accepted: "bg-emerald-900/40 text-emerald-300",
};

type HandoverItem = {
  id: number;
  title: string;
  disciplineId: number | null;
  disciplineName: string | null;
  workPackageId: number | null;
  status: HandoverStatus;
  handoverDate: string | null;
  minutesFile: string | null;
};

type PunchSeverity = "low" | "medium" | "high";
const SEVERITY_LABEL: Record<PunchSeverity, string> = {
  low: "Thấp",
  medium: "Trung bình",
  high: "Cao",
};
const SEVERITY_BADGE: Record<PunchSeverity, string> = {
  low: "bg-zinc-800 text-zinc-400",
  medium: "bg-amber-900/40 text-amber-300",
  high: "bg-rose-900/40 text-rose-300",
};

type PunchStatus = "open" | "fixing" | "closed";
const PUNCH_STATUS_LABEL: Record<PunchStatus, string> = {
  open: "Mở",
  fixing: "Đang xử lý",
  closed: "Đã đóng",
};
const PUNCH_STATUS_BADGE: Record<PunchStatus, string> = {
  open: "bg-rose-900/40 text-rose-300",
  fixing: "bg-amber-900/40 text-amber-300",
  closed: "bg-emerald-900/40 text-emerald-300",
};

type Punch = {
  id: number;
  handoverItemId: number | null;
  handoverItemTitle: string | null;
  description: string;
  severity: PunchSeverity | null;
  status: PunchStatus;
  dueDate: string | null;
  assignee: number | null;
  assigneeName: string | null;
};

type DemobStatus = "pending" | "done";
type Demob = {
  id: number;
  title: string;
  category: string | null;
  status: DemobStatus;
  note: string | null;
};

type Lesson = {
  id: number;
  title: string;
  category: string | null;
  content: string | null;
  createdByName: string | null;
  createdAt: string;
};

type Discipline = { id: number; code: string; name: string };

// Bản vẽ hoàn công (as-built, kind='asbuilt' — M08) — chỉ liên kết tham khảo, M29 không
// lưu file mới (xem docs/nang-cap/M29-ban-giao-ket-thuc.md mục "As-built không lưu file mới").
type AsbuiltDrawing = {
  id: number;
  code: string;
  name: string;
  approvedRevisionId: number | null;
  latestRevisionId: number | null;
};

type Tab = "tc" | "nghiem_thu" | "punch" | "demob" | "lessons";
const TABS: { key: Tab; label: string; icon: typeof PackageCheck }[] = [
  { key: "tc", label: "T&C", icon: FlaskConical },
  { key: "nghiem_thu", label: "Nghiệm thu bàn giao", icon: ClipboardCheck },
  { key: "punch", label: "Punch list", icon: ListChecks },
  { key: "demob", label: "Demob", icon: Boxes },
  { key: "lessons", label: "Bài học", icon: BookOpen },
];

export default function HandoverPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [commissioning, setCommissioning] = useState<Commissioning[]>([]);
  const [handoverItems, setHandoverItems] = useState<HandoverItem[]>([]);
  const [punch, setPunch] = useState<Punch[]>([]);
  const [demob, setDemob] = useState<Demob[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [users, setUsers] = useState<{ id: number; name: string }[]>([]);
  const [disciplines, setDisciplines] = useState<Discipline[]>([]);
  const [asbuiltDrawings, setAsbuiltDrawings] = useState<AsbuiltDrawing[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("tc");

  const [addTcOpen, setAddTcOpen] = useState(false);
  const [editTc, setEditTc] = useState<Commissioning | null>(null);
  const [addHiOpen, setAddHiOpen] = useState(false);
  const [editHi, setEditHi] = useState<HandoverItem | null>(null);
  const [addPunchOpen, setAddPunchOpen] = useState(false);
  const [editPunch, setEditPunch] = useState<Punch | null>(null);
  const [addDemobOpen, setAddDemobOpen] = useState(false);
  const [editDemob, setEditDemob] = useState<Demob | null>(null);
  const [addLessonOpen, setAddLessonOpen] = useState(false);
  const [editLesson, setEditLesson] = useState<Lesson | null>(null);

  const canManage = me?.role === "admin" || me?.role === "pm" || me?.role === "engineer";
  const canApprove = me?.role === "admin" || me?.role === "pm";

  function load() {
    return Promise.all([
      fetch("/api/commissioning").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/handover-items").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/punch-list").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/demob").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/lessons-learned").then((r) => (r.ok ? r.json() : null)),
    ]);
  }

  useEffect(() => {
    Promise.all([fetchMe(), load()])
      .then(([meData, [tcRes, hiRes, punchRes, demobRes, lessonRes]]) => {
        if (!meData) return;
        setMe(meData);
        setCommissioning(tcRes?.items ?? []);
        setHandoverItems(hiRes?.items ?? []);
        setPunch(punchRes?.items ?? []);
        setDemob(demobRes?.items ?? []);
        setLessons(lessonRes?.items ?? []);
        fetch("/api/disciplines")
          .then((r) => (r.ok ? r.json() : null))
          .then((j) => setDisciplines(j?.disciplines ?? []));
        fetch("/api/drawings?kind=asbuilt")
          .then((r) => (r.ok ? r.json() : null))
          .then((j) => setAsbuiltDrawings(j?.drawings ?? []));
        if (meData.role === "admin" || meData.role === "pm" || meData.role === "engineer") {
          fetch("/api/users")
            .then((r) => (r.ok ? r.json() : null))
            .then((j) => setUsers(j?.users ?? []));
        }
      })
      .finally(() => setLoading(false));
  }, []);

  async function refresh() {
    const [tcRes, hiRes, punchRes, demobRes, lessonRes] = await load();
    setCommissioning(tcRes?.items ?? []);
    setHandoverItems(hiRes?.items ?? []);
    setPunch(punchRes?.items ?? []);
    setDemob(demobRes?.items ?? []);
    setLessons(lessonRes?.items ?? []);
  }

  // KPI strip — tính client-side từ dữ liệu đã tải (đúng quyết định YAGNI của M23:
  // không thêm route readiness riêng).
  const kpi = useMemo(() => {
    const itemsTotal = handoverItems.length;
    const itemsAccepted = handoverItems.filter((h) => h.status === "accepted").length;
    const punchOpen = punch.filter((p) => p.status !== "closed");
    const bySeverity: Record<PunchSeverity, number> = { low: 0, medium: 0, high: 0 };
    for (const p of punchOpen) if (p.severity) bySeverity[p.severity]++;
    const tcTotal = commissioning.length;
    const tcPassed = commissioning.filter((c) => c.result === "passed").length;
    return {
      itemsPercent: itemsTotal > 0 ? Math.round((itemsAccepted / itemsTotal) * 100) : 0,
      itemsAccepted,
      itemsTotal,
      punchOpenCount: punchOpen.length,
      bySeverity,
      tcPercent: tcTotal > 0 ? Math.round((tcPassed / tcTotal) * 100) : 0,
      tcPassed,
      tcTotal,
    };
  }, [handoverItems, punch, commissioning]);

  async function deleteEntity(url: string, label: string) {
    if (!(await appConfirm(`Xoá ${label} này? Không thể hoàn tác.`, { danger: true }))) return;
    const res = await fetch(url, { method: "DELETE" });
    if (!res.ok) {
      showToast((await res.json().catch(() => null))?.error ?? "Xoá thất bại", "error");
      return;
    }
    refresh();
  }

  async function decideCommissioning(item: Commissioning, result: "passed" | "failed") {
    const res = await fetch(`/api/commissioning/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ result }),
    });
    if (!res.ok) {
      showToast((await res.json().catch(() => null))?.error ?? "Cập nhật thất bại", "error");
      return;
    }
    showToast(result === "passed" ? "Đã đánh dấu Đạt" : "Đã đánh dấu Không đạt", "success");
    refresh();
  }

  async function decideHandoverAccepted(item: HandoverItem) {
    const res = await fetch(`/api/handover-items/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "accepted" }),
    });
    if (!res.ok) {
      showToast((await res.json().catch(() => null))?.error ?? "Cập nhật thất bại", "error");
      return;
    }
    showToast("Đã nghiệm thu bàn giao", "success");
    refresh();
  }

  async function cyclePunchStatus(item: Punch) {
    const next: PunchStatus =
      item.status === "open" ? "fixing" : item.status === "fixing" ? "closed" : "open";
    const res = await fetch(`/api/punch-list/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    if (!res.ok) {
      showToast((await res.json().catch(() => null))?.error ?? "Cập nhật thất bại", "error");
      return;
    }
    refresh();
  }

  async function toggleDemobDone(item: Demob) {
    const nextStatus: DemobStatus = item.status === "done" ? "pending" : "done";
    const res = await fetch(`/api/demob/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });
    if (!res.ok) {
      showToast((await res.json().catch(() => null))?.error ?? "Cập nhật thất bại", "error");
      return;
    }
    refresh();
  }

  if (loading) return <PageSkeleton />;

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <AppHeader
        title="Bàn giao & Kết thúc"
        subtitle="Chạy thử & nghiệm thu hệ thống (T&C), nghiệm thu bàn giao, punch list, giải thể công trường, bài học kinh nghiệm"
        bottomActions={
          canManage ? (
            <div className="flex items-center gap-2">
              {tab === "tc" && (
                <button
                  onClick={() => setAddTcOpen(true)}
                  aria-label="Thêm hệ thống T&C"
                  className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-600 px-3 sm:px-4 py-2 rounded-lg text-sm font-semibold transition shrink-0"
                >
                  <Plus className="w-4 h-4" />{" "}
                  <span className="hidden sm:inline">Thêm hệ thống</span>
                </button>
              )}
              {tab === "nghiem_thu" && (
                <button
                  onClick={() => setAddHiOpen(true)}
                  aria-label="Thêm hạng mục bàn giao"
                  className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-600 px-3 sm:px-4 py-2 rounded-lg text-sm font-semibold transition shrink-0"
                >
                  <Plus className="w-4 h-4" />{" "}
                  <span className="hidden sm:inline">Thêm hạng mục</span>
                </button>
              )}
              {tab === "punch" && (
                <button
                  onClick={() => setAddPunchOpen(true)}
                  aria-label="Thêm tồn tại"
                  className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-600 px-3 sm:px-4 py-2 rounded-lg text-sm font-semibold transition shrink-0"
                >
                  <Plus className="w-4 h-4" />{" "}
                  <span className="hidden sm:inline">Thêm tồn tại</span>
                </button>
              )}
              {tab === "demob" && (
                <button
                  onClick={() => setAddDemobOpen(true)}
                  aria-label="Thêm hạng mục giải thể"
                  className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-600 px-3 sm:px-4 py-2 rounded-lg text-sm font-semibold transition shrink-0"
                >
                  <Plus className="w-4 h-4" />{" "}
                  <span className="hidden sm:inline">Thêm hạng mục</span>
                </button>
              )}
              {tab === "lessons" && (
                <button
                  onClick={() => setAddLessonOpen(true)}
                  aria-label="Thêm bài học"
                  className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-600 px-3 sm:px-4 py-2 rounded-lg text-sm font-semibold transition shrink-0"
                >
                  <Plus className="w-4 h-4" />{" "}
                  <span className="hidden sm:inline">Thêm bài học</span>
                </button>
              )}
            </div>
          ) : undefined
        }
      />

      <main className="p-4 sm:p-6 pb-24 space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-emerald-400">{kpi.itemsPercent}%</p>
            <p className="text-xs text-zinc-400">
              Bàn giao ({kpi.itemsAccepted}/{kpi.itemsTotal})
            </p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
            <p className={`text-2xl font-bold ${kpi.punchOpenCount > 0 ? "text-amber-400" : ""}`}>
              {kpi.punchOpenCount}
            </p>
            <p className="text-xs text-zinc-400">
              Punch mở{" "}
              {kpi.bySeverity.high > 0 && (
                <span className="text-rose-400">({kpi.bySeverity.high} cao)</span>
              )}
            </p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-sky-400">{kpi.tcPercent}%</p>
            <p className="text-xs text-zinc-400">
              T&C đạt ({kpi.tcPassed}/{kpi.tcTotal})
            </p>
          </div>
        </div>

        <div
          className="flex flex-wrap gap-1.5"
          role="tablist"
          aria-label="Nhóm bàn giao & kết thúc"
        >
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border flex items-center gap-1.5 ${
                tab === t.key
                  ? "bg-zinc-700 border-zinc-600 text-white"
                  : "border-zinc-700 text-zinc-400 hover:text-white"
              }`}
            >
              <t.icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          ))}
        </div>

        {tab === "tc" && (
          <TcTab
            items={commissioning}
            canManage={canManage}
            canApprove={canApprove}
            onEdit={setEditTc}
            onDelete={(id) => deleteEntity(`/api/commissioning/${id}`, "hệ thống T&C")}
            onDecide={decideCommissioning}
          />
        )}

        {tab === "nghiem_thu" && (
          <>
            <AsbuiltPanel drawings={asbuiltDrawings} />
            <HandoverTab
              items={handoverItems}
              canManage={canManage}
              canApprove={canApprove}
              onEdit={setEditHi}
              onDelete={(id) => deleteEntity(`/api/handover-items/${id}`, "hạng mục bàn giao")}
              onAccept={decideHandoverAccepted}
            />
          </>
        )}

        {tab === "punch" && (
          <PunchTab
            items={punch}
            canManage={canManage}
            onEdit={setEditPunch}
            onDelete={(id) => deleteEntity(`/api/punch-list/${id}`, "tồn tại")}
            onCycle={cyclePunchStatus}
          />
        )}

        {tab === "demob" && (
          <DemobTab
            items={demob}
            canManage={canManage}
            onEdit={setEditDemob}
            onDelete={(id) => deleteEntity(`/api/demob/${id}`, "hạng mục giải thể")}
            onToggle={toggleDemobDone}
          />
        )}

        {tab === "lessons" && (
          <LessonsTab
            items={lessons}
            canManage={canManage}
            onEdit={setEditLesson}
            onDelete={(id) => deleteEntity(`/api/lessons-learned/${id}`, "bài học")}
          />
        )}
      </main>

      {(addTcOpen || editTc) && (
        <TcModal
          item={editTc}
          disciplines={disciplines}
          canApprove={canApprove}
          onClose={() => {
            setAddTcOpen(false);
            setEditTc(null);
          }}
          onSaved={() => {
            setAddTcOpen(false);
            setEditTc(null);
            refresh();
          }}
        />
      )}

      {(addHiOpen || editHi) && (
        <HandoverModal
          item={editHi}
          disciplines={disciplines}
          canApprove={canApprove}
          onClose={() => {
            setAddHiOpen(false);
            setEditHi(null);
          }}
          onSaved={() => {
            setAddHiOpen(false);
            setEditHi(null);
            refresh();
          }}
        />
      )}

      {(addPunchOpen || editPunch) && (
        <PunchModal
          item={editPunch}
          handoverItems={handoverItems}
          users={users}
          onClose={() => {
            setAddPunchOpen(false);
            setEditPunch(null);
          }}
          onSaved={() => {
            setAddPunchOpen(false);
            setEditPunch(null);
            refresh();
          }}
        />
      )}

      {(addDemobOpen || editDemob) && (
        <DemobModal
          item={editDemob}
          onClose={() => {
            setAddDemobOpen(false);
            setEditDemob(null);
          }}
          onSaved={() => {
            setAddDemobOpen(false);
            setEditDemob(null);
            refresh();
          }}
        />
      )}

      {(addLessonOpen || editLesson) && (
        <LessonModal
          item={editLesson}
          onClose={() => {
            setAddLessonOpen(false);
            setEditLesson(null);
          }}
          onSaved={() => {
            setAddLessonOpen(false);
            setEditLesson(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

// ===== Tab T&C =====

function TcTab({
  items,
  canManage,
  canApprove,
  onEdit,
  onDelete,
  onDecide,
}: {
  items: Commissioning[];
  canManage: boolean;
  canApprove: boolean;
  onEdit: (item: Commissioning) => void;
  onDelete: (id: number) => void;
  onDecide: (item: Commissioning, result: "passed" | "failed") => void;
}) {
  if (items.length === 0)
    return (
      <EmptyState
        icon={FlaskConical}
        title="Chưa có hệ thống T&C"
        message="Bấm “Thêm hệ thống” để thêm hệ thống cần chạy thử & nghiệm thu."
      />
    );
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <div
        className="overflow-x-auto"
        tabIndex={0}
        role="region"
        aria-label="Danh sách hệ thống T&C"
      >
        <table className="w-full text-sm sm:min-w-[760px]">
          <thead>
            <tr className="text-xs text-zinc-400 border-b border-zinc-800">
              <th className="text-left p-3">HỆ THỐNG</th>
              <th className="text-left p-3">HỆ</th>
              <th className="text-left p-3">CHECKLIST</th>
              <th className="text-left p-3">NGÀY CHẠY THỬ</th>
              <th className="text-left p-3">KẾT QUẢ</th>
              <th className="text-left p-3 w-32"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((c) => (
              <tr key={c.id} className="border-b border-zinc-800/60 last:border-0">
                <td className="p-3">
                  <p className="truncate max-w-[220px]">{c.systemName}</p>
                  {c.code && <p className="text-xs text-zinc-500">{c.code}</p>}
                </td>
                <td className="p-3 text-xs text-zinc-400">{c.disciplineName ?? "—"}</td>
                <td className="p-3 text-xs text-zinc-400">
                  {c.checklist && c.checklist.length > 0 ? `${c.checklist.length} bước` : "—"}
                </td>
                <td className="p-3 text-xs text-zinc-400">
                  {c.testedAt ? formatDateVN(c.testedAt) : "—"}
                </td>
                <td className="p-3">
                  <span
                    className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${RESULT_BADGE[c.result]}`}
                  >
                    {RESULT_LABEL[c.result]}
                  </span>
                </td>
                <td className="p-3">
                  <div className="flex items-center gap-2">
                    {canApprove && c.result !== "passed" && c.result !== "failed" && (
                      <>
                        <button
                          onClick={() => onDecide(c, "passed")}
                          aria-label="Đánh dấu Đạt"
                          title="Đạt"
                          className="text-emerald-400 hover:text-emerald-300"
                        >
                          <ThumbsUp className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => onDecide(c, "failed")}
                          aria-label="Đánh dấu Không đạt"
                          title="Không đạt"
                          className="text-rose-400 hover:text-rose-300"
                        >
                          <ThumbsDown className="w-4 h-4" />
                        </button>
                      </>
                    )}
                    {canManage && (
                      <>
                        <button
                          onClick={() => onEdit(c)}
                          aria-label="Sửa hệ thống T&C"
                          className="text-zinc-400 hover:text-white"
                          title="Sửa"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => onDelete(c.id)}
                          aria-label="Xoá hệ thống T&C"
                          className="text-zinc-400 hover:text-rose-400"
                          title="Xoá"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ===== Panel bản vẽ hoàn công (as-built, chỉ liên kết tham khảo — M08) =====

function AsbuiltPanel({ drawings }: { drawings: AsbuiltDrawing[] }) {
  if (drawings.length === 0) return null;
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
      <p className="text-xs text-zinc-400 mb-2">
        Bản vẽ hoàn công (as-built) — tham khảo từ Bản vẽ, không lưu trùng ở đây
      </p>
      <div className="flex flex-wrap gap-2">
        {drawings.map((d) => {
          const revId = d.approvedRevisionId ?? d.latestRevisionId;
          return revId ? (
            <a
              key={d.id}
              href={`/api/drawings/revisions/${revId}/file`}
              target="_blank"
              rel="noreferrer"
              className="text-xs bg-zinc-800 hover:bg-zinc-700 text-sky-300 px-2.5 py-1 rounded-full inline-flex items-center gap-1"
            >
              <Paperclip className="w-3 h-3" /> {d.code} — {d.name}
            </a>
          ) : (
            <span
              key={d.id}
              className="text-xs bg-zinc-800/60 text-zinc-500 px-2.5 py-1 rounded-full inline-flex items-center gap-1"
            >
              {d.code} — {d.name} (chưa có file)
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ===== Tab Nghiệm thu bàn giao =====

function HandoverTab({
  items,
  canManage,
  canApprove,
  onEdit,
  onDelete,
  onAccept,
}: {
  items: HandoverItem[];
  canManage: boolean;
  canApprove: boolean;
  onEdit: (item: HandoverItem) => void;
  onDelete: (id: number) => void;
  onAccept: (item: HandoverItem) => void;
}) {
  if (items.length === 0)
    return (
      <EmptyState
        icon={ClipboardCheck}
        title="Chưa có hạng mục bàn giao"
        message="Bấm “Thêm hạng mục” để thêm hạng mục cần bàn giao CĐT."
      />
    );
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Hạng mục bàn giao">
        <table className="w-full text-sm sm:min-w-[720px]">
          <thead>
            <tr className="text-xs text-zinc-400 border-b border-zinc-800">
              <th className="text-left p-3">HẠNG MỤC</th>
              <th className="text-left p-3">HỆ</th>
              <th className="text-left p-3">NGÀY BÀN GIAO</th>
              <th className="text-left p-3">TRẠNG THÁI</th>
              <th className="text-left p-3">BIÊN BẢN</th>
              <th className="text-left p-3 w-28"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((h) => (
              <tr key={h.id} className="border-b border-zinc-800/60 last:border-0">
                <td className="p-3">
                  <p className="truncate max-w-[220px]">{h.title}</p>
                </td>
                <td className="p-3 text-xs text-zinc-400">{h.disciplineName ?? "—"}</td>
                <td className="p-3 text-xs text-zinc-400">
                  {h.handoverDate ? formatDateVN(h.handoverDate) : "—"}
                </td>
                <td className="p-3">
                  <span
                    className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${HANDOVER_STATUS_BADGE[h.status]}`}
                  >
                    {HANDOVER_STATUS_LABEL[h.status]}
                  </span>
                </td>
                <td className="p-3">
                  {h.minutesFile ? (
                    <a
                      href={`/api/handover-items/${h.id}/file`}
                      target="_blank"
                      rel="noreferrer"
                      aria-label="Xem biên bản bàn giao"
                      className="text-sky-400 hover:text-sky-300 inline-flex items-center gap-1"
                    >
                      <Paperclip className="w-4 h-4" />
                      <span className="hidden sm:inline text-xs">Biên bản</span>
                    </a>
                  ) : (
                    <span className="text-zinc-600 text-xs">—</span>
                  )}
                </td>
                <td className="p-3">
                  <div className="flex items-center gap-2">
                    {canApprove && h.status !== "accepted" && (
                      <button
                        onClick={() => onAccept(h)}
                        aria-label="Đánh dấu đã nghiệm thu"
                        title="Nghiệm thu"
                        className="text-emerald-400 hover:text-emerald-300"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                      </button>
                    )}
                    {canManage && (
                      <>
                        <button
                          onClick={() => onEdit(h)}
                          aria-label="Sửa hạng mục bàn giao"
                          className="text-zinc-400 hover:text-white"
                          title="Sửa"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => onDelete(h.id)}
                          aria-label="Xoá hạng mục bàn giao"
                          className="text-zinc-400 hover:text-rose-400"
                          title="Xoá"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ===== Tab Punch list =====

function PunchTab({
  items,
  canManage,
  onEdit,
  onDelete,
  onCycle,
}: {
  items: Punch[];
  canManage: boolean;
  onEdit: (item: Punch) => void;
  onDelete: (id: number) => void;
  onCycle: (item: Punch) => void;
}) {
  if (items.length === 0)
    return (
      <EmptyState
        icon={ListChecks}
        title="Chưa có tồn tại"
        message="Bấm “Thêm tồn tại” để ghi nhận tồn tại khi bàn giao."
      />
    );
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Punch list">
        <table className="w-full text-sm sm:min-w-[760px]">
          <thead>
            <tr className="text-xs text-zinc-400 border-b border-zinc-800">
              <th className="text-left p-3">MÔ TẢ</th>
              <th className="text-left p-3">HẠNG MỤC</th>
              <th className="text-left p-3">MỨC ĐỘ</th>
              <th className="text-left p-3">HẠN XỬ LÝ</th>
              <th className="text-left p-3">NGƯỜI PHỤ TRÁCH</th>
              <th className="text-left p-3">TRẠNG THÁI</th>
              <th className="text-left p-3 w-24"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => {
              const overdue = p.status !== "closed" && p.dueDate != null && p.dueDate < todayISO();
              return (
                <tr key={p.id} className="border-b border-zinc-800/60 last:border-0">
                  <td className="p-3">
                    <p className="truncate max-w-[240px]">{p.description}</p>
                  </td>
                  <td className="p-3 text-xs text-zinc-400">{p.handoverItemTitle ?? "—"}</td>
                  <td className="p-3">
                    {p.severity ? (
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${SEVERITY_BADGE[p.severity]}`}
                      >
                        {SEVERITY_LABEL[p.severity]}
                      </span>
                    ) : (
                      <span className="text-zinc-600 text-xs">—</span>
                    )}
                  </td>
                  <td className="p-3 text-xs">
                    {p.dueDate ? (
                      <span className={overdue ? "text-rose-400 font-medium" : "text-zinc-400"}>
                        {overdue && <AlertTriangle className="w-3 h-3 inline mr-1" />}
                        {formatDateVN(p.dueDate)}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="p-3 text-xs text-zinc-400">{p.assigneeName ?? "—"}</td>
                  <td className="p-3">
                    <button
                      onClick={() => canManage && onCycle(p)}
                      disabled={!canManage}
                      aria-label={`Đổi trạng thái, hiện tại: ${PUNCH_STATUS_LABEL[p.status]}`}
                      className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${PUNCH_STATUS_BADGE[p.status]} ${
                        canManage ? "cursor-pointer hover:opacity-80" : "cursor-default"
                      }`}
                    >
                      {PUNCH_STATUS_LABEL[p.status]}
                    </button>
                  </td>
                  <td className="p-3">
                    {canManage && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => onEdit(p)}
                          aria-label="Sửa tồn tại"
                          className="text-zinc-400 hover:text-white"
                          title="Sửa"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => onDelete(p.id)}
                          aria-label="Xoá tồn tại"
                          className="text-zinc-400 hover:text-rose-400"
                          title="Xoá"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ===== Tab Demob =====

function DemobTab({
  items,
  canManage,
  onEdit,
  onDelete,
  onToggle,
}: {
  items: Demob[];
  canManage: boolean;
  onEdit: (item: Demob) => void;
  onDelete: (id: number) => void;
  onToggle: (item: Demob) => void;
}) {
  if (items.length === 0)
    return (
      <EmptyState
        icon={Boxes}
        title="Chưa có hạng mục giải thể"
        message="Bấm “Thêm hạng mục” để thêm việc tháo lán/hoàn trả mặt bằng/thanh lý vật tư dư."
      />
    );
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <div
        className="overflow-x-auto"
        tabIndex={0}
        role="region"
        aria-label="Checklist giải thể công trường"
      >
        <table className="w-full text-sm sm:min-w-[600px]">
          <thead>
            <tr className="text-xs text-zinc-400 border-b border-zinc-800">
              <th className="text-left p-3 w-10"></th>
              <th className="text-left p-3">HẠNG MỤC</th>
              <th className="text-left p-3">NHÓM</th>
              <th className="text-left p-3">TRẠNG THÁI</th>
              <th className="text-left p-3 w-20"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((d) => (
              <tr key={d.id} className="border-b border-zinc-800/60 last:border-0">
                <td className="p-3">
                  {canManage && (
                    <button
                      onClick={() => onToggle(d)}
                      aria-label={
                        d.status === "done" ? "Bỏ đánh dấu hoàn thành" : "Đánh dấu hoàn thành"
                      }
                      title={d.status === "done" ? "Bỏ hoàn thành" : "Đánh dấu hoàn thành"}
                      className={
                        d.status === "done" ? "text-emerald-400" : "text-zinc-500 hover:text-white"
                      }
                    >
                      <CheckCircle2 className="w-5 h-5" />
                    </button>
                  )}
                </td>
                <td className="p-3">
                  <p className="truncate max-w-[240px]">{d.title}</p>
                  {d.note && (
                    <p className="text-xs text-zinc-500 truncate max-w-[240px]">{d.note}</p>
                  )}
                </td>
                <td className="p-3 text-xs text-zinc-400">{d.category ?? "—"}</td>
                <td className="p-3">
                  <span
                    className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                      d.status === "done"
                        ? "bg-emerald-900/40 text-emerald-300"
                        : "bg-zinc-800 text-zinc-400"
                    }`}
                  >
                    {d.status === "done" ? "Hoàn thành" : "Chưa làm"}
                  </span>
                </td>
                <td className="p-3">
                  {canManage && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onEdit(d)}
                        aria-label="Sửa hạng mục giải thể"
                        className="text-zinc-400 hover:text-white"
                        title="Sửa"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => onDelete(d.id)}
                        aria-label="Xoá hạng mục giải thể"
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
  );
}

// ===== Tab Bài học kinh nghiệm =====

function LessonsTab({
  items,
  canManage,
  onEdit,
  onDelete,
}: {
  items: Lesson[];
  canManage: boolean;
  onEdit: (item: Lesson) => void;
  onDelete: (id: number) => void;
}) {
  if (items.length === 0)
    return (
      <EmptyState
        icon={BookOpen}
        title="Chưa có bài học kinh nghiệm"
        message="Bấm “Thêm bài học” để ghi lại kinh nghiệm cho dự án sau."
      />
    );
  return (
    <div className="space-y-3">
      {items.map((l) => (
        <div key={l.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium truncate">{l.title}</p>
              <p className="text-xs text-zinc-500">
                {l.category ? `${l.category} · ` : ""}
                {l.createdByName ?? "—"} · {formatDateVN(l.createdAt.slice(0, 10))}
              </p>
            </div>
            {canManage && (
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => onEdit(l)}
                  aria-label="Sửa bài học"
                  className="text-zinc-400 hover:text-white"
                  title="Sửa"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  onClick={() => onDelete(l.id)}
                  aria-label="Xoá bài học"
                  className="text-zinc-400 hover:text-rose-400"
                  title="Xoá"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
          {l.content && (
            <p className="text-sm text-zinc-300 mt-2 whitespace-pre-wrap">{l.content}</p>
          )}
        </div>
      ))}
    </div>
  );
}

// ===== Modal T&C =====

function TcModal({
  item,
  disciplines,
  canApprove,
  onClose,
  onSaved,
}: {
  item: Commissioning | null;
  disciplines: Discipline[];
  canApprove: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [systemName, setSystemName] = useState(item?.systemName ?? "");
  const [code, setCode] = useState(item?.code ?? "");
  const [disciplineId, setDisciplineId] = useState<number | "">(item?.disciplineId ?? "");
  const [result, setResult] = useState<CommissioningResult>(item?.result ?? "draft");
  const [testedAt, setTestedAt] = useState(item?.testedAt ?? "");
  const [note, setNote] = useState(item?.note ?? "");
  const [checklist, setChecklist] = useState<ChecklistItem[]>(item?.checklist ?? []);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const canSubmit = systemName.trim().length > 0;
  const resultOptions: CommissioningResult[] = canApprove
    ? ["draft", "testing", "passed", "failed"]
    : ["draft", "testing"];

  function addStep() {
    setChecklist((prev) => [...prev, { label: "", type: "pass_fail" }]);
  }
  function updateStep(idx: number, patch: Partial<ChecklistItem>) {
    setChecklist((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }
  function removeStep(idx: number) {
    setChecklist((prev) => prev.filter((_, i) => i !== idx));
  }

  async function submit() {
    setSaving(true);
    setErr("");
    try {
      const payload = {
        systemName: systemName.trim(),
        code: code.trim() || null,
        disciplineId: disciplineId === "" ? null : disciplineId,
        result,
        testedAt: testedAt || null,
        note: note.trim() || null,
        checklist: checklist.filter((s) => s.label.trim()),
      };
      const url = item ? `/api/commissioning/${item.id}` : "/api/commissioning";
      const res = await fetch(url, {
        method: item ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        setErr((await res.json().catch(() => null))?.error ?? "Không lưu được hệ thống T&C");
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
    <Modal onClose={onClose} className="max-w-lg">
      <div className="p-5 space-y-3 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">{item ? "Sửa hệ thống T&C" : "Thêm hệ thống T&C"}</h2>
          <button onClick={onClose} aria-label="Đóng" className="text-zinc-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <label className="text-xs text-zinc-400 block">
          Tên hệ thống
          <input
            value={systemName}
            onChange={(e) => setSystemName(e.target.value)}
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-zinc-400">
            Mã (tuỳ chọn)
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-zinc-400">
            Hệ
            <select
              value={disciplineId}
              onChange={(e) => setDisciplineId(e.target.value ? Number(e.target.value) : "")}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            >
              <option value="">— Chưa gán —</option>
              {disciplines.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-zinc-400">
            Ngày chạy thử
            <input
              type="date"
              value={testedAt}
              onChange={(e) => setTestedAt(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-zinc-400">
            Kết quả
            <select
              value={result}
              onChange={(e) => setResult(e.target.value as CommissioningResult)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            >
              {resultOptions.map((r) => (
                <option key={r} value={r}>
                  {RESULT_LABEL[r]}
                </option>
              ))}
            </select>
            {!canApprove && (
              <span className="text-[11px] text-zinc-500">Chỉ Admin/PM đặt được Đạt/Không đạt</span>
            )}
          </label>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-zinc-400">Checklist chạy thử</span>
            <button
              type="button"
              onClick={addStep}
              className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> Thêm bước
            </button>
          </div>
          <div className="space-y-2">
            {checklist.map((step, idx) => (
              <div key={idx} className="flex items-center gap-2 bg-zinc-800/60 rounded-lg p-2">
                <input
                  value={step.label}
                  onChange={(e) => updateStep(idx, { label: e.target.value })}
                  placeholder={`Bước ${idx + 1}`}
                  className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-white min-w-0"
                />
                <select
                  value={step.type}
                  onChange={(e) =>
                    updateStep(idx, { type: e.target.value as ChecklistItem["type"] })
                  }
                  className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-white shrink-0"
                >
                  <option value="pass_fail">Đạt/Không</option>
                  <option value="measure">Đo lường</option>
                </select>
                <button
                  type="button"
                  onClick={() => removeStep(idx)}
                  aria-label={`Xoá bước ${idx + 1}`}
                  className="text-zinc-500 hover:text-rose-400 shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
            {checklist.length === 0 && (
              <p className="text-xs text-zinc-500">Chưa có bước nào — bấm “Thêm bước”.</p>
            )}
          </div>
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
          className="w-full bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white font-semibold py-2 rounded-lg text-sm"
        >
          {saving ? "Đang lưu…" : "Lưu"}
        </button>
      </div>
    </Modal>
  );
}

// ===== Modal Hạng mục bàn giao =====

function HandoverModal({
  item,
  disciplines,
  canApprove,
  onClose,
  onSaved,
}: {
  item: HandoverItem | null;
  disciplines: Discipline[];
  canApprove: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(item?.title ?? "");
  const [disciplineId, setDisciplineId] = useState<number | "">(item?.disciplineId ?? "");
  const [status, setStatus] = useState<HandoverStatus>(item?.status ?? "pending");
  const [handoverDate, setHandoverDate] = useState(item?.handoverDate ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const canSubmit = title.trim().length > 0;
  const statusOptions: HandoverStatus[] = canApprove
    ? ["pending", "handed_over", "accepted"]
    : ["pending", "handed_over"];

  async function submit() {
    setSaving(true);
    setErr("");
    try {
      const payload = {
        title: title.trim(),
        disciplineId: disciplineId === "" ? null : disciplineId,
        status,
        handoverDate: handoverDate || null,
      };

      let id = item?.id;
      if (!id) {
        const res = await fetch("/api/handover-items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const j = await res.json().catch(() => null);
        if (!res.ok) {
          setErr(j?.error ?? "Không tạo được hạng mục");
          return;
        }
        id = j.id;
      } else if (!file) {
        const res = await fetch(`/api/handover-items/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          setErr((await res.json().catch(() => null))?.error ?? "Không sửa được hạng mục");
          return;
        }
      }

      if (file && id) {
        const form = new FormData();
        for (const [k, v] of Object.entries(payload)) if (v != null) form.append(k, String(v));
        form.append("file", file);
        const res = await fetch(`/api/handover-items/${id}`, { method: "PATCH", body: form });
        if (!res.ok) {
          setErr((await res.json().catch(() => null))?.error ?? "Không lưu được biên bản");
          return;
        }
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
          <h2 className="font-semibold">
            {item ? "Sửa hạng mục bàn giao" : "Thêm hạng mục bàn giao"}
          </h2>
          <button onClick={onClose} aria-label="Đóng" className="text-zinc-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <label className="text-xs text-zinc-400 block">
          Tên hạng mục
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-zinc-400">
            Hệ
            <select
              value={disciplineId}
              onChange={(e) => setDisciplineId(e.target.value ? Number(e.target.value) : "")}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            >
              <option value="">— Chưa gán —</option>
              {disciplines.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-zinc-400">
            Ngày bàn giao
            <input
              type="date"
              value={handoverDate}
              onChange={(e) => setHandoverDate(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
        </div>

        <label className="text-xs text-zinc-400 block">
          Trạng thái
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as HandoverStatus)}
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          >
            {statusOptions.map((s) => (
              <option key={s} value={s}>
                {HANDOVER_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          {!canApprove && (
            <span className="text-[11px] text-zinc-500">Chỉ Admin/PM đặt được Đã nghiệm thu</span>
          )}
        </label>

        <label className="inline-flex items-center gap-2 text-sm text-zinc-300 hover:text-white cursor-pointer bg-zinc-800 hover:bg-zinc-700 px-3 py-2 rounded-lg w-fit">
          <Upload className="w-4 h-4" />
          {file ? file.name : item?.minutesFile ? "Thay biên bản" : "Chọn biên bản (PDF/ảnh)"}
          <input
            type="file"
            accept="application/pdf,image/*"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>

        {err && <p className="text-sm text-rose-300">{err}</p>}
        <button
          onClick={submit}
          disabled={saving || !canSubmit}
          className="w-full bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white font-semibold py-2 rounded-lg text-sm"
        >
          {saving ? "Đang lưu…" : "Lưu"}
        </button>
      </div>
    </Modal>
  );
}

// ===== Modal Punch =====

function PunchModal({
  item,
  handoverItems,
  users,
  onClose,
  onSaved,
}: {
  item: Punch | null;
  handoverItems: HandoverItem[];
  users: { id: number; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [handoverItemId, setHandoverItemId] = useState<number | "">(item?.handoverItemId ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [severity, setSeverity] = useState<PunchSeverity | "">(item?.severity ?? "");
  const [status, setStatus] = useState<PunchStatus>(item?.status ?? "open");
  const [dueDate, setDueDate] = useState(item?.dueDate ?? "");
  const [assignee, setAssignee] = useState<number | "">(item?.assignee ?? "");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const canSubmit = description.trim().length > 0;

  async function submit() {
    setSaving(true);
    setErr("");
    try {
      const payload = {
        handoverItemId: handoverItemId === "" ? null : handoverItemId,
        description: description.trim(),
        severity: severity || null,
        status,
        dueDate: dueDate || null,
        assignee: assignee === "" ? null : assignee,
      };
      const url = item ? `/api/punch-list/${item.id}` : "/api/punch-list";
      const res = await fetch(url, {
        method: item ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        setErr((await res.json().catch(() => null))?.error ?? "Không lưu được tồn tại");
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
          <h2 className="font-semibold">{item ? "Sửa tồn tại" : "Thêm tồn tại"}</h2>
          <button onClick={onClose} aria-label="Đóng" className="text-zinc-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <label className="text-xs text-zinc-400 block">
          Mô tả tồn tại
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          />
        </label>

        <label className="text-xs text-zinc-400 block">
          Hạng mục bàn giao (tuỳ chọn)
          <select
            value={handoverItemId}
            onChange={(e) => setHandoverItemId(e.target.value ? Number(e.target.value) : "")}
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          >
            <option value="">— Không gắn hạng mục —</option>
            {handoverItems.map((h) => (
              <option key={h.id} value={h.id}>
                {h.title}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-zinc-400">
            Mức độ
            <select
              value={severity}
              onChange={(e) => setSeverity(e.target.value as PunchSeverity | "")}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            >
              <option value="">— Chưa xác định —</option>
              {(Object.keys(SEVERITY_LABEL) as PunchSeverity[]).map((s) => (
                <option key={s} value={s}>
                  {SEVERITY_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-zinc-400">
            Hạn xử lý
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-zinc-400">
            Trạng thái
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as PunchStatus)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            >
              {(Object.keys(PUNCH_STATUS_LABEL) as PunchStatus[]).map((s) => (
                <option key={s} value={s}>
                  {PUNCH_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-zinc-400">
            Người phụ trách
            <select
              value={assignee}
              onChange={(e) => setAssignee(e.target.value ? Number(e.target.value) : "")}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            >
              <option value="">— Chưa gán —</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {err && <p className="text-sm text-rose-300">{err}</p>}
        <button
          onClick={submit}
          disabled={saving || !canSubmit}
          className="w-full bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white font-semibold py-2 rounded-lg text-sm"
        >
          {saving ? "Đang lưu…" : "Lưu"}
        </button>
      </div>
    </Modal>
  );
}

// ===== Modal Demob =====

function DemobModal({
  item,
  onClose,
  onSaved,
}: {
  item: Demob | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(item?.title ?? "");
  const [category, setCategory] = useState(item?.category ?? "");
  const [status, setStatus] = useState<DemobStatus>(item?.status ?? "pending");
  const [note, setNote] = useState(item?.note ?? "");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const canSubmit = title.trim().length > 0;

  async function submit() {
    setSaving(true);
    setErr("");
    try {
      const payload = {
        title: title.trim(),
        category: category.trim() || null,
        status,
        note: note.trim() || null,
      };
      const url = item ? `/api/demob/${item.id}` : "/api/demob";
      const res = await fetch(url, {
        method: item ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        setErr((await res.json().catch(() => null))?.error ?? "Không lưu được hạng mục");
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
          <h2 className="font-semibold">
            {item ? "Sửa hạng mục giải thể" : "Thêm hạng mục giải thể"}
          </h2>
          <button onClick={onClose} aria-label="Đóng" className="text-zinc-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <label className="text-xs text-zinc-400 block">
          Tên hạng mục
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-zinc-400">
            Nhóm (vd. lán trại/mặt bằng/vật tư dư)
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-zinc-400">
            Trạng thái
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as DemobStatus)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            >
              <option value="pending">Chưa làm</option>
              <option value="done">Hoàn thành</option>
            </select>
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
          className="w-full bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white font-semibold py-2 rounded-lg text-sm"
        >
          {saving ? "Đang lưu…" : "Lưu"}
        </button>
      </div>
    </Modal>
  );
}

// ===== Modal Bài học kinh nghiệm =====

function LessonModal({
  item,
  onClose,
  onSaved,
}: {
  item: Lesson | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(item?.title ?? "");
  const [category, setCategory] = useState(item?.category ?? "");
  const [content, setContent] = useState(item?.content ?? "");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const canSubmit = title.trim().length > 0;

  async function submit() {
    setSaving(true);
    setErr("");
    try {
      const payload = {
        title: title.trim(),
        category: category.trim() || null,
        content: content.trim() || null,
      };
      const url = item ? `/api/lessons-learned/${item.id}` : "/api/lessons-learned";
      const res = await fetch(url, {
        method: item ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        setErr((await res.json().catch(() => null))?.error ?? "Không lưu được bài học");
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
          <h2 className="font-semibold">{item ? "Sửa bài học" : "Thêm bài học"}</h2>
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

        <label className="text-xs text-zinc-400 block">
          Nhóm (tuỳ chọn)
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          />
        </label>

        <label className="text-xs text-zinc-400 block">
          Nội dung
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={4}
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          />
        </label>

        {err && <p className="text-sm text-rose-300">{err}</p>}
        <button
          onClick={submit}
          disabled={saving || !canSubmit}
          className="w-full bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white font-semibold py-2 rounded-lg text-sm"
        >
          {saving ? "Đang lưu…" : "Lưu"}
        </button>
      </div>
    </Modal>
  );
}
