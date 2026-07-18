"use client";
// Trang ma trận phân quyền (M50 PR1 — override quyền trong DB, bảng role_permissions,
// xem docs/nang-cap/M50-phan-quyen-nang-cao.md mục PR1). Đọc/ghi qua
// GET/PATCH /api/admin/role-permissions. Chỉ Admin (CAN.manageUsers).
//
// Ma trận vai trò × quyền, nhóm theo module (app/lib/permissionMeta.ts). Mỗi ô 3 trạng
// thái: Mặc định (theo CAN_DEFAULT) / Mở (bật) / Siết (tắt). KHÔNG import lib/auth (kéo
// node:crypto) — mọi dữ liệu quyền lấy từ API; nhãn/nhóm từ permissionMeta client-safe.
//
// M61 PR2: thêm selector PHẠM VI (toàn hệ thống / theo dự án). Ở phạm vi dự án, ô "Mặc
// định" hiển thị giá trị HIỆU LỰC KẾ THỪA (CAN_DEFAULT + override toàn hệ nếu có) kèm chú
// thích nguồn — không phải CAN_DEFAULT thô như phạm vi toàn hệ thống. Phạm vi toàn hệ
// thống giữ nguyên hành vi cũ (không đổi state/logic).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ShieldCheck, Info, Lock, FileSpreadsheet, ShieldAlert, Globe2 } from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import EmptyState from "@/app/components/EmptyState";
import { Skeleton, PageSkeleton } from "@/app/components/Skeleton";
import { showToast } from "@/app/components/Toast";
import { fetchMe, type Me } from "@/app/lib/me";
import { ROLE_LABELS, type Role } from "@/lib/roles";
import { PERM_GROUP_ORDER, permMeta } from "@/app/lib/permissionMeta";

type ProjectOption = { id: number; name: string };

type MatrixData = {
  roles: Role[];
  perms: string[];
  lockedPerms: string[];
  defaults: Record<string, Record<Role, boolean>>;
  // M61: mỗi override kèm projectId (null = toàn hệ). Ở phạm vi dự án, mảng này gồm CẢ
  // override toàn hệ lẫn override riêng dự án (phân biệt qua field projectId).
  overrides: { role: Role; permKey: string; allowed: boolean; projectId: number | null }[];
  projects: ProjectOption[];
};

type CellState = "default" | "on" | "off";

export default function PermissionsPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [meLoading, setMeLoading] = useState(true);
  const [data, setData] = useState<MatrixData | null>(null);
  const [loading, setLoading] = useState(true);
  // M61: phạm vi đang chọn — null = "Toàn hệ thống" (mặc định, hành vi y hệt trước M61).
  const [scopeProjectId, setScopeProjectId] = useState<number | null>(null);
  // Map key `${role}|${permKey}` → allowed, TÁCH riêng override toàn hệ và override của
  // dự án đang chọn (cần cả 2 để vẽ giá trị "mặc định" kế thừa ở phạm vi dự án).
  const [globalOverrides, setGlobalOverrides] = useState<Map<string, boolean>>(new Map());
  const [scopedOverrides, setScopedOverrides] = useState<Map<string, boolean>>(new Map());
  const [savingKey, setSavingKey] = useState<string | null>(null);
  // M50 PR3: tab "Báo cáo SoD" thêm cạnh ma trận quyền — không đổi state/logic ma trận.
  const [tab, setTab] = useState<"matrix" | "sod">("matrix");

  const isAdmin = me?.role === "admin";

  // M61: chống race khi đổi phạm vi nhanh liên tiếp — chỉ áp response của lần gọi MỚI
  // NHẤT (so khớp qua requestId), bỏ qua response cũ đến trễ.
  const latestRequestId = useRef(0);

  const load = useCallback((projectId: number | null) => {
    const requestId = ++latestRequestId.current;
    setLoading(true);
    const qs = projectId != null ? `?projectId=${projectId}` : "";
    return fetch(`/api/admin/role-permissions${qs}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: MatrixData | null) => {
        if (!j || requestId !== latestRequestId.current) return;
        setData(j);
        const g = new Map<string, boolean>();
        const s = new Map<string, boolean>();
        for (const o of j.overrides) {
          const key = `${o.role}|${o.permKey}`;
          if (o.projectId === null) g.set(key, o.allowed);
          else s.set(key, o.allowed);
        }
        setGlobalOverrides(g);
        setScopedOverrides(s);
      })
      .catch(() => {
        if (requestId === latestRequestId.current) {
          showToast("Không tải được ma trận phân quyền", "error");
        }
      })
      .finally(() => {
        if (requestId === latestRequestId.current) setLoading(false);
      });
  }, []);

  useEffect(() => {
    fetchMe()
      .then((u) => setMe(u))
      .finally(() => setMeLoading(false));
  }, []);

  useEffect(() => {
    if (!me || me.role !== "admin") return;
    load(scopeProjectId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, scopeProjectId]);

  // Nhóm quyền theo module, giữ thứ tự PERM_GROUP_ORDER.
  const grouped = useMemo(() => {
    if (!data) return [];
    const byGroup = new Map<string, string[]>();
    for (const p of data.perms) {
      const g = permMeta(p).group;
      const arr = byGroup.get(g) ?? [];
      arr.push(p);
      byGroup.set(g, arr);
    }
    return PERM_GROUP_ORDER.filter((g) => byGroup.has(g)).map((g) => ({
      group: g,
      perms: byGroup.get(g)!,
    }));
  }, [data]);

  const lockedSet = useMemo(() => new Set(data?.lockedPerms ?? []), [data]);

  async function changeCell(role: Role, permKey: string, next: CellState) {
    const key = `${role}|${permKey}`;
    const allowed: boolean | null = next === "default" ? null : next === "on";
    setSavingKey(key);
    try {
      const res = await fetch("/api/admin/role-permissions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, permKey, allowed, projectId: scopeProjectId }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        showToast(j?.error ?? "Lưu thất bại", "error");
        return;
      }
      const setOverrides = scopeProjectId === null ? setGlobalOverrides : setScopedOverrides;
      setOverrides((prev) => {
        const m = new Map(prev);
        if (allowed === null) m.delete(key);
        else m.set(key, allowed);
        return m;
      });
      showToast("Đã lưu — có hiệu lực trong tối đa 60 giây trên mọi phiên bản", "success");
    } catch {
      showToast("Mất kết nối — không lưu được", "error");
    } finally {
      setSavingKey(null);
    }
  }

  if (meLoading) return <PageSkeleton />;

  if (me && !isAdmin) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white">
        <AppHeader title="Phân quyền" subtitle="Ma trận quyền theo vai trò" />
        <main className="p-4 sm:p-6">
          <EmptyState
            icon={ShieldCheck}
            title="Không có quyền truy cập"
            message="Chỉ Admin mới cấu hình được ma trận phân quyền."
          />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <AppHeader
        title="Phân quyền"
        subtitle="Ghi đè quyền theo vai trò — không cấu hình = giữ hành vi mặc định"
      />

      <main className="p-4 sm:p-6 pb-24 space-y-5">
        {/* M50 PR3: tab ma trận / báo cáo SoD + nút xuất ma trận quyền hiệu lực */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-1 rounded-lg border border-zinc-800 bg-zinc-900 p-1 text-sm">
            <button
              type="button"
              onClick={() => setTab("matrix")}
              className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
                tab === "matrix" ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Ma trận quyền
            </button>
            <button
              type="button"
              onClick={() => setTab("sod")}
              className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
                tab === "sod" ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Báo cáo SoD
            </button>
          </div>
          <a
            href="/api/admin/permissions-snapshot"
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm font-medium text-zinc-200 hover:bg-zinc-800"
          >
            <FileSpreadsheet className="h-4 w-4 text-emerald-300" aria-hidden />
            Xuất ma trận quyền (.xlsx)
          </a>
        </div>

        {tab === "sod" && <SodReportTab />}

        {tab === "matrix" && (
          <>
            {/* M61 PR2: selector phạm vi — "Toàn hệ thống" (mặc định, hành vi y hệt trước
                M61) hoặc 1 dự án cụ thể (override chỉ áp dụng trong dự án đó). */}
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 p-3 text-sm">
              <Globe2 className="h-4 w-4 shrink-0 text-sky-300" aria-hidden />
              <label htmlFor="perm-scope" className="text-zinc-400">
                Phạm vi áp dụng:
              </label>
              <select
                id="perm-scope"
                aria-label="Phạm vi áp dụng"
                value={scopeProjectId ?? ""}
                onChange={(e) =>
                  setScopeProjectId(e.target.value === "" ? null : Number(e.target.value))
                }
                className="min-w-[10rem] rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-zinc-200"
              >
                <option value="">Toàn hệ thống</option>
                {(data?.projects ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              {scopeProjectId !== null && (
                <span className="text-xs text-zinc-500">
                  Override chỉ áp dụng trong dự án này; ô &ldquo;Mặc định&rdquo; hiển thị giá trị kế
                  thừa từ toàn hệ thống.
                </span>
              )}
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-2 text-sm text-zinc-300">
              <p className="flex items-start gap-2">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" />
                <span>
                  Mỗi ô 3 trạng thái: <b className="text-zinc-100">Mặc định</b> (theo cấu hình gốc),{" "}
                  <b className="text-emerald-300">Mở</b> (bật thêm),{" "}
                  <b className="text-amber-300">Siết</b> (tắt bớt). Chỉ <b>quyền xem</b> mới được
                  Mở; <b>quyền ghi dữ liệu</b> chỉ Siết được hoặc để Mặc định (không mở qua ma
                  trận).
                </span>
              </p>
              <p className="flex items-start gap-2 text-zinc-400">
                <Lock className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" />
                <span>
                  Thay đổi có hiệu lực trong <b>tối đa 60 giây</b> trên các phiên bản khác (cache).
                  Một số ngưỡng quyền dạng &ldquo;Admin/PM&rdquo; nằm ngoài ma trận này (kiểm trực
                  tiếp trong route, không dữ liệu-hoá) nên <b>không đổi được</b> tại đây.
                </span>
              </p>
            </div>

            {loading || !data ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }, (_, i) => (
                  <div
                    key={i}
                    className="h-40 animate-pulse rounded-xl border border-zinc-800 bg-zinc-900"
                  />
                ))}
              </div>
            ) : (
              grouped.map(({ group, perms }) => (
                <section
                  key={group}
                  className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900"
                >
                  <h2 className="border-b border-zinc-800 px-4 py-2.5 text-sm font-semibold text-zinc-200">
                    {group}
                  </h2>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-zinc-800 text-zinc-400">
                          <th className="sticky left-0 z-10 bg-zinc-900 px-3 py-2 text-left font-medium">
                            Quyền
                          </th>
                          {data.roles.map((r) => (
                            <th
                              key={r}
                              className="px-2 py-2 text-center font-medium whitespace-nowrap"
                            >
                              {ROLE_LABELS[r]}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {perms.map((permKey) => {
                          const isWrite = lockedSet.has(permKey);
                          return (
                            <tr key={permKey} className="border-b border-zinc-900 last:border-0">
                              <td className="sticky left-0 z-10 bg-zinc-900 px-3 py-2 text-zinc-200">
                                <span className="flex items-center gap-1.5">
                                  {permMeta(permKey).label}
                                  {isWrite && (
                                    <Lock
                                      className="h-3 w-3 text-zinc-600"
                                      aria-label="Quyền ghi — chỉ siết được"
                                    />
                                  )}
                                </span>
                              </td>
                              {data.roles.map((role) => {
                                const key = `${role}|${permKey}`;
                                // Trạng thái override CỦA PHẠM VI ĐANG CHỌN (toàn hệ →
                                // globalOverrides; dự án → scopedOverrides, không lẫn
                                // override toàn hệ vào state của ô).
                                const activeMap =
                                  scopeProjectId === null ? globalOverrides : scopedOverrides;
                                const ov = activeMap.get(key);
                                const state: CellState =
                                  ov === undefined ? "default" : ov ? "on" : "off";
                                // Giá trị hiển thị cho lựa chọn "Mặc định": ở phạm vi toàn hệ
                                // = CAN_DEFAULT (như cũ); ở phạm vi dự án = giá trị HIỆU LỰC
                                // KẾ THỪA (override toàn hệ nếu có, không thì CAN_DEFAULT).
                                const canDefault = data.defaults[permKey]?.[role] ?? false;
                                const inheritedFromGlobal =
                                  scopeProjectId !== null && globalOverrides.has(key);
                                const def = inheritedFromGlobal
                                  ? globalOverrides.get(key)!
                                  : canDefault;
                                return (
                                  <td key={role} className="px-2 py-1.5 text-center">
                                    <CellSelect
                                      state={state}
                                      defaultVal={def}
                                      inheritedFromGlobal={inheritedFromGlobal}
                                      isWrite={isWrite}
                                      disabled={savingKey === key}
                                      onChange={(next) => changeCell(role, permKey, next)}
                                    />
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              ))
            )}
          </>
        )}
      </main>
    </div>
  );
}

// ── M50 PR3: Báo cáo SoD ───────────────────────────────────────────────────────────
// Tách riêng khỏi state ma trận (PR1) — chỉ gọi API mới, không đụng logic ma trận.
type SodRuleResult = {
  rule: string;
  description: string;
  violations: Record<string, unknown>[];
};

const DAY_OPTIONS = [30, 90, 180] as const;

function SodReportTab() {
  const [days, setDays] = useState<(typeof DAY_OPTIONS)[number]>(90);
  const [report, setReport] = useState<SodRuleResult[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/admin/sod-report?days=${days}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: SodRuleResult[] | null) => setReport(j))
      .catch(() => showToast("Không tải được báo cáo SoD", "error"))
      .finally(() => setLoading(false));
  }, [days]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-2 text-sm text-zinc-300">
        <p className="flex items-start gap-2">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
          <span>
            Vi phạm <b className="text-zinc-100">mềm</b>: cùng 1 người vừa tạo vừa xử lý bước sau
            (không bị chặn ghi dữ liệu — Approval Engine M46 đã chặn cứng trường hợp mới). Danh sách
            chỉ phục vụ rà soát kiểm toán.
          </span>
        </p>
      </div>

      <div className="flex items-center gap-2 text-sm">
        <span className="text-zinc-400">Khoảng thời gian:</span>
        {DAY_OPTIONS.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDays(d)}
            className={`rounded-md border px-3 py-1 font-medium ${
              days === d
                ? "border-sky-500/60 bg-sky-900 text-sky-200"
                : "border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            }`}
          >
            {d} ngày
          </button>
        ))}
      </div>

      {loading || !report ? (
        <div className="space-y-3">
          {Array.from({ length: 2 }, (_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      ) : (
        report.map((r) => (
          <section
            key={r.rule}
            className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900"
          >
            <div className="border-b border-zinc-800 px-4 py-3">
              <h3 className="text-sm font-semibold text-zinc-100">
                {r.rule}{" "}
                <span
                  className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${
                    r.violations.length > 0
                      ? "bg-amber-500/10 text-amber-300"
                      : "bg-emerald-500/10 text-emerald-300"
                  }`}
                >
                  {r.violations.length} vi phạm
                </span>
              </h3>
              <p className="mt-1 text-xs text-zinc-400">{r.description}</p>
            </div>
            {r.violations.length === 0 ? (
              <p className="px-4 py-3 text-sm text-zinc-500">Không phát hiện vi phạm.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-zinc-800 text-zinc-400">
                      {Object.keys(r.violations[0]).map((col) => (
                        <th key={col} className="px-3 py-2 text-left font-medium whitespace-nowrap">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {r.violations.map((v, i) => (
                      <tr key={i} className="border-b border-zinc-900 last:border-0">
                        {Object.keys(r.violations[0]).map((col) => (
                          <td key={col} className="px-3 py-2 whitespace-nowrap text-zinc-200">
                            {String(v[col] ?? "—")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ))
      )}
    </div>
  );
}

// Ô 3 trạng thái. Quyền ghi (isWrite) không cho chọn "Mở" (option disabled) — khớp luật
// API (422 nếu cố mở). Hiển thị giá trị mặc định để người dùng biết trạng thái gốc.
function CellSelect({
  state,
  defaultVal,
  inheritedFromGlobal = false,
  isWrite,
  disabled,
  onChange,
}: {
  state: CellState;
  defaultVal: boolean;
  // M61: true khi đang ở phạm vi dự án và giá trị "Mặc định" hiển thị thực chất là kế
  // thừa từ 1 override toàn hệ (không phải CAN_DEFAULT gốc) — hiện chú thích nguồn.
  inheritedFromGlobal?: boolean;
  isWrite: boolean;
  disabled: boolean;
  onChange: (next: CellState) => void;
}) {
  // Màu viền theo trạng thái (không chỉ dựa màu — kèm nhãn chữ trong option).
  const tone =
    state === "on"
      ? "border-emerald-500/60 text-emerald-200"
      : state === "off"
        ? "border-amber-500/60 text-amber-200"
        : "border-zinc-700 text-zinc-300";
  return (
    <select
      value={state}
      disabled={disabled}
      aria-label="Trạng thái quyền"
      onChange={(e) => onChange(e.target.value as CellState)}
      className={`w-full min-w-[6.5rem] rounded-md border bg-zinc-800 px-1.5 py-1 text-xs disabled:opacity-50 ${tone}`}
    >
      <option value="default">
        Mặc định ({defaultVal ? "có" : "không"}
        {inheritedFromGlobal ? " — kế thừa toàn hệ" : ""})
      </option>
      <option value="on" disabled={isWrite}>
        Mở (bật){isWrite ? " — khoá" : ""}
      </option>
      <option value="off">Siết (tắt)</option>
    </select>
  );
}
