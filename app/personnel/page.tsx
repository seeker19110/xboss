"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, X, Users, Trash2, Pencil, AlertTriangle, Upload, Paperclip } from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import EmptyState from "@/app/components/EmptyState";
import { Button } from "@/app/components/ui";
import { Modal, appConfirm } from "@/app/components/dialogs";
import { showToast } from "@/app/components/Toast";
import { fetchMe, invalidateMe, redirectToLogin, type Me } from "@/app/lib/me";
import { formatDateVN } from "@/lib/nen/date";
import { trangThaiHanTheoNgay, type TrangThaiHan } from "@/lib/nen/han-hieu-luc";
import CrewsModal from "@/app/personnel/_components/CrewsModal";

type Personnel = {
  id: number;
  code: string | null;
  fullName: string;
  roleTitle: string | null;
  supplierId: number | null;
  supplierName: string | null;
  phone: string | null;
  idNumber: string | null; // null nếu API ẩn (không phải admin/pm)
  status: "active" | "inactive";
  crewNames: string | null;
};

type Crew = { id: number; name: string };
type Supplier = { id: number; name: string };
type Certification = {
  id: number;
  personnelId: number | null;
  kind: string;
  code: string | null;
  issuedDate: string | null;
  expiryDate: string | null;
  fileName: string | null;
  originalName: string | null;
};

// Nhãn hạn của chứng chỉ. Ngưỡng + phép so ngày dùng chung ở lib/nen/han-hieu-luc.ts
// (trước đây tính mốc bằng UTC thuần nên lệch 1 ngày lúc 0h–7h sáng giờ VN).
const CERT_BADGE: Record<TrangThaiHan, { label: string; className: string } | null> = {
  khong_han: null,
  qua_han: { label: "Quá hạn", className: "bg-rose-900 text-rose-200" },
  sap_het_han: { label: "Sắp hết hạn", className: "bg-amber-900 text-amber-200" },
  con_han: { label: "Còn hạn", className: "bg-emerald-900 text-emerald-200" },
};

function certBadge(c: Certification): { label: string; className: string } | null {
  return CERT_BADGE[trangThaiHanTheoNgay(c.expiryDate)];
}

// Mỗi nguồn tải độc lập; chỉ response của URL/request hiện tại được áp dụng.
function usePersonnelList<T>(url: string, field: string, label: string) {
  const [snapshot, setSnapshot] = useState<{ url: string; items: T[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const activeUrl = useRef(url);
  activeUrl.current = url;
  const request = useRef<AbortController | null>(null);
  const reload = useCallback(async () => {
    if (activeUrl.current !== url) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const current = () =>
      !controller.signal.aborted && request.current === controller && activeUrl.current === url;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!current()) return;
      if (response.status === 401) {
        void redirectToLogin();
        return;
      }
      const body = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(body?.[field]))
        throw new Error(
          typeof body?.error === "string" ? body.error : `Không tải được ${label}. Hãy thử lại.`,
        );
      if (current()) setSnapshot({ url, items: body[field] });
    } catch (err) {
      if (current())
        setError(
          err instanceof Error && err.name !== "TypeError"
            ? err.message
            : `Mất kết nối — không tải được ${label}. Hãy thử lại.`,
        );
    } finally {
      if (current()) setLoading(false);
    }
  }, [url, field, label]);
  useEffect(() => {
    void reload();
    return () => {
      request.current?.abort();
    };
  }, [reload]);
  return { snapshot, loading, error, reload };
}

function SourceError({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-rose-800 bg-rose-950/30 p-3 text-sm text-rose-300 flex flex-wrap items-center gap-3"
    >
      <p className="flex-1">{message}</p>
      <Button variant="secondary" className="min-h-11" onClick={retry}>
        Thử lại
      </Button>
    </div>
  );
}

export default function PersonnelPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [meError, setMeError] = useState("");
  const [crewFilter, setCrewFilter] = useState<number | "">("");
  const [supplierFilter, setSupplierFilter] = useState<number | "">("");
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Personnel | null>(null);
  const [detail, setDetail] = useState<Personnel | null>(null);
  const [crewsOpen, setCrewsOpen] = useState(false);

  const params = new URLSearchParams();
  if (crewFilter !== "") params.set("crewId", String(crewFilter));
  if (supplierFilter !== "") params.set("supplierId", String(supplierFilter));
  const url = `/api/personnel?${params.toString()}`;
  const peopleSource = usePersonnelList<Personnel>(url, "personnel", "danh sách nhân sự");
  const crewSource = usePersonnelList<Crew>("/api/crews", "crews", "tổ đội");
  const supplierSource = usePersonnelList<Supplier>("/api/suppliers", "suppliers", "nhà thầu phụ");
  const personnel = peopleSource.snapshot?.items ?? [];
  const crews = crewSource.snapshot?.items ?? [];
  const suppliers = supplierSource.snapshot?.items ?? [];
  const loadPersonnel = peopleSource.reload;
  const loadCrews = crewSource.reload;
  const canManage = me?.role === "admin" || me?.role === "pm";
  const canUseRows =
    peopleSource.snapshot?.url === url && !peopleSource.loading && !peopleSource.error;
  const authRequest = useRef({ id: 0 });
  const loadMe = useCallback(async (retry = false) => {
    const id = ++authRequest.current.id;
    if (retry) invalidateMe();
    setMeError("");
    const user = await fetchMe();
    if (id !== authRequest.current.id) return;
    setMe(user);
    if (!user) setMeError("Chưa xác minh được quyền quản lý nhân sự. Hãy thử lại.");
  }, []);
  useEffect(() => {
    const active = authRequest.current;
    void loadMe();
    return () => {
      active.id++;
    };
  }, [loadMe]);

  async function deletePersonnel(id: number) {
    if (!(await appConfirm("Xoá nhân sự này? Không thể hoàn tác.", { danger: true }))) return;
    const res = await fetch(`/api/personnel/${id}`, { method: "DELETE" });
    if (!res.ok) {
      showToast((await res.json().catch(() => null))?.error ?? "Xoá thất bại", "error");
      return;
    }
    loadPersonnel();
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <AppHeader
        title="Nhân sự"
        subtitle="Nhân sự công trường (khác tài khoản hệ thống) — hồ sơ, tổ đội, chứng chỉ"
        bottomActions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCrewsOpen(true)}
              aria-label="Quản lý tổ đội"
              className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition shrink-0 text-zinc-100 min-h-11"
            >
              <Users className="w-4 h-4" /> <span className="hidden sm:inline">Tổ đội</span>
            </button>
            {canManage && (
              <button
                onClick={() => setAddOpen(true)}
                aria-label="Thêm nhân sự"
                disabled={supplierSource.loading || !!supplierSource.error}
                className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800 px-3 sm:px-4 py-2 rounded-lg text-sm font-semibold transition shrink-0 text-on-accent min-h-11"
              >
                <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Thêm nhân sự</span>
              </button>
            )}
          </div>
        }
      />

      <main className="p-4 sm:p-6 pb-24 space-y-4">
        {meError && <SourceError message={meError} retry={() => void loadMe(true)} />}
        {crewSource.error && (
          <SourceError message={crewSource.error} retry={() => void loadCrews()} />
        )}
        {supplierSource.error && (
          <SourceError message={supplierSource.error} retry={() => void supplierSource.reload()} />
        )}
        <div className="flex flex-wrap gap-3">
          <label className="grid gap-1 text-sm text-zinc-400">
            Tổ đội
            <select
              value={crewFilter}
              onChange={(e) => setCrewFilter(e.target.value ? Number(e.target.value) : "")}
              aria-label="Lọc theo tổ đội"
              disabled={crewSource.loading || !!crewSource.error}
              className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 min-h-11 text-base sm:text-sm text-white"
            >
              <option value="">Mọi tổ đội</option>
              {crews.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm text-zinc-400">
            Nhà thầu phụ
            <select
              value={supplierFilter}
              onChange={(e) => setSupplierFilter(e.target.value ? Number(e.target.value) : "")}
              aria-label="Lọc theo nhà thầu phụ"
              disabled={supplierSource.loading || !!supplierSource.error}
              className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 min-h-11 text-base sm:text-sm text-white"
            >
              <option value="">Mọi nhà thầu phụ</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {peopleSource.loading && (
          <p role="status" className="text-sm text-zinc-400">
            Đang tải danh sách nhân sự…
          </p>
        )}
        {peopleSource.error && (
          <SourceError message={peopleSource.error} retry={() => void loadPersonnel()} />
        )}
        {peopleSource.snapshot && !canUseRows && (
          <p className="text-sm text-zinc-400">
            Đang hiển thị kết quả tải trước đó (chỉ xem). Hãy đợi hoặc thử tải lại trước khi thao
            tác.
          </p>
        )}
        {canUseRows && personnel.length === 0 ? (
          <EmptyState
            icon={Users}
            title={
              crewFilter !== "" || supplierFilter !== ""
                ? "Không có nhân sự phù hợp"
                : "Chưa có nhân sự"
            }
            message={
              crewFilter !== "" || supplierFilter !== ""
                ? "Thử đổi bộ lọc tổ đội hoặc nhà thầu phụ."
                : canManage
                  ? "Bấm “Thêm nhân sự” để bắt đầu quản lý nhân sự công trường."
                  : "Chưa có nhân sự được ghi nhận trong dự án."
            }
          />
        ) : personnel.length > 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div
              className="overflow-x-auto"
              tabIndex={0}
              role="region"
              aria-label="Danh sách nhân sự"
            >
              <table className="w-full text-sm min-w-[720px]">
                <thead>
                  <tr className="text-xs text-zinc-400 border-b border-zinc-800">
                    <th className="text-left p-3">HỌ TÊN</th>
                    <th className="text-left p-3">CHỨC DANH</th>
                    <th className="text-left p-3">TỔ ĐỘI</th>
                    <th className="text-left p-3">NHÀ THẦU PHỤ</th>
                    <th className="text-left p-3">TRẠNG THÁI</th>
                    <th className="text-left p-3 w-20"></th>
                  </tr>
                </thead>
                <tbody>
                  {personnel.map((p) => (
                    <tr
                      key={p.id}
                      className="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/40 cursor-pointer"
                      onClick={() => {
                        if (canUseRows) setDetail(p);
                      }}
                    >
                      <td className="p-3">
                        <Button
                          variant="ghost"
                          className="min-h-11 max-w-60 px-0 text-left justify-start whitespace-normal break-words"
                          disabled={!canUseRows}
                          onClick={() => setDetail(p)}
                        >
                          {p.fullName}
                        </Button>
                        {p.code && <p className="text-xs text-zinc-500">{p.code}</p>}
                      </td>
                      <td className="p-3 text-xs text-zinc-400">{p.roleTitle ?? "—"}</td>
                      <td className="p-3 text-xs text-zinc-400">{p.crewNames ?? "—"}</td>
                      <td className="p-3 text-xs text-zinc-400">{p.supplierName ?? "—"}</td>
                      <td className="p-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                            p.status === "active"
                              ? "bg-emerald-900 text-emerald-200"
                              : "bg-zinc-800 text-zinc-500"
                          }`}
                        >
                          {p.status === "active" ? "Đang làm việc" : "Ngừng làm việc"}
                        </span>
                      </td>
                      <td className="p-3">
                        {canManage && (
                          <div
                            className="flex items-center gap-2"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              disabled={!canUseRows}
                              onClick={() => setEditing(p)}
                              aria-label="Sửa nhân sự"
                              className="min-h-11 min-w-11 grid place-items-center rounded-lg text-zinc-400 hover:text-white focus-visible:outline-2 focus-visible:outline-emerald-500 disabled:opacity-50"
                              title="Sửa"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              disabled={!canUseRows}
                              onClick={() => deletePersonnel(p.id)}
                              aria-label="Xoá nhân sự"
                              className="min-h-11 min-w-11 grid place-items-center rounded-lg text-zinc-400 hover:text-rose-400 focus-visible:outline-2 focus-visible:outline-emerald-500 disabled:opacity-50"
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
        ) : null}
      </main>

      {(addOpen || editing) && (
        <PersonnelModal
          person={editing}
          suppliers={suppliers}
          onClose={() => {
            setAddOpen(false);
            setEditing(null);
          }}
          onSaved={() => {
            setAddOpen(false);
            setEditing(null);
            loadPersonnel();
          }}
        />
      )}

      {detail && (
        <DetailModal person={detail} canManage={!!canManage} onClose={() => setDetail(null)} />
      )}

      {crewsOpen && (
        <CrewsModal
          canManage={!!canManage}
          onClose={() => setCrewsOpen(false)}
          onChanged={() => {
            loadCrews();
            loadPersonnel();
          }}
        />
      )}
    </div>
  );
}

function PersonnelModal({
  person,
  suppliers,
  onClose,
  onSaved,
}: {
  person: Personnel | null;
  suppliers: Supplier[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [code, setCode] = useState(person?.code ?? "");
  const [fullName, setFullName] = useState(person?.fullName ?? "");
  const [roleTitle, setRoleTitle] = useState(person?.roleTitle ?? "");
  const [supplierId, setSupplierId] = useState<number | "">(person?.supplierId ?? "");
  const [phone, setPhone] = useState(person?.phone ?? "");
  const [idNumber, setIdNumber] = useState(person?.idNumber ?? "");
  const [status, setStatus] = useState<"active" | "inactive">(person?.status ?? "active");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const canSubmit = fullName.trim().length > 0;

  async function submit() {
    setSaving(true);
    setErr("");
    try {
      const payload = {
        code: code.trim() || null,
        fullName: fullName.trim(),
        roleTitle: roleTitle.trim() || null,
        supplierId: supplierId === "" ? null : supplierId,
        phone: phone.trim() || null,
        idNumber: idNumber.trim() || null,
        status,
      };
      const url = person ? `/api/personnel/${person.id}` : "/api/personnel";
      const res = await fetch(url, {
        method: person ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        setErr((await res.json().catch(() => null))?.error ?? "Không lưu được nhân sự");
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
          <h2 className="font-semibold">{person ? "Sửa nhân sự" : "Thêm nhân sự"}</h2>
          <button onClick={onClose} aria-label="Đóng" className="text-zinc-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <label className="text-xs text-zinc-400 block">
          Họ tên
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-zinc-400">
            Mã nhân sự
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-zinc-400">
            Chức danh
            <input
              value={roleTitle}
              onChange={(e) => setRoleTitle(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
        </div>

        <label className="text-xs text-zinc-400 block">
          Nhà thầu phụ
          <select
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value ? Number(e.target.value) : "")}
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          >
            <option value="">— Không thuộc NTP —</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-zinc-400">
            Điện thoại
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-zinc-400">
            CCCD
            <input
              value={idNumber}
              onChange={(e) => setIdNumber(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
        </div>

        <label className="text-xs text-zinc-400 block">
          Trạng thái
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as "active" | "inactive")}
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          >
            <option value="active">Đang làm việc</option>
            <option value="inactive">Ngừng làm việc</option>
          </select>
        </label>

        {err && <p className="text-sm text-rose-300">{err}</p>}
        <button
          onClick={submit}
          disabled={saving || !canSubmit}
          className="w-full bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-on-accent font-semibold py-2 rounded-lg text-sm"
        >
          {saving ? "Đang lưu…" : "Lưu"}
        </button>
      </div>
    </Modal>
  );
}

function DetailModal({
  person,
  canManage,
  onClose,
}: {
  person: Personnel;
  canManage: boolean;
  onClose: () => void;
}) {
  const [certs, setCerts] = useState<Certification[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);

  function load() {
    return fetch(`/api/certifications?personnelId=${person.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setCerts(j?.certifications ?? []));
  }

  useEffect(() => {
    load().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [person.id]);

  const expiringCount = useMemo(
    () => certs.filter((c) => certBadge(c)?.label !== "Còn hạn").length,
    [certs],
  );

  async function deleteCert(id: number) {
    if (!(await appConfirm("Xoá chứng chỉ này? Không thể hoàn tác.", { danger: true }))) return;
    const res = await fetch(`/api/certifications/${id}`, { method: "DELETE" });
    if (!res.ok) {
      showToast((await res.json().catch(() => null))?.error ?? "Xoá thất bại", "error");
      return;
    }
    load();
  }

  return (
    <Modal onClose={onClose} className="max-w-lg">
      <div className="p-5 space-y-4 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold">{person.fullName}</h2>
            <p className="text-xs text-zinc-400">
              {person.roleTitle ?? "—"}
              {person.supplierName ? ` · ${person.supplierName}` : ""}
            </p>
          </div>
          <button onClick={onClose} aria-label="Đóng" className="text-zinc-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <p className="text-zinc-400">
            Điện thoại: <span className="text-white">{person.phone ?? "—"}</span>
          </p>
          <p className="text-zinc-400">
            CCCD: <span className="text-white">{person.idNumber ?? "—"}</span>
          </p>
          <p className="text-zinc-400 col-span-2">
            Tổ đội: <span className="text-white">{person.crewNames ?? "—"}</span>
          </p>
        </div>

        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-zinc-300">
            Chứng chỉ{" "}
            {expiringCount > 0 && <AlertTriangle className="w-3 h-3 inline text-amber-400 ml-1" />}
          </h3>
          {canManage && (
            <button
              onClick={() => setAddOpen(true)}
              className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
            >
              <Plus className="w-3 h-3" /> Thêm chứng chỉ
            </button>
          )}
        </div>

        {loading ? (
          <p className="text-sm text-zinc-500">Đang tải…</p>
        ) : certs.length === 0 ? (
          <EmptyState compact icon={Upload} message="Chưa có chứng chỉ nào." />
        ) : (
          <ul className="space-y-2">
            {certs.map((c) => {
              const badge = certBadge(c);
              return (
                <li
                  key={c.id}
                  className="flex items-center justify-between bg-zinc-800/60 rounded-lg px-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate">
                      {c.kind}
                      {c.code ? ` — ${c.code}` : ""}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {c.expiryDate ? `Hạn ${formatDateVN(c.expiryDate)}` : "Không hạn"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {badge && (
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                    )}
                    {c.fileName && (
                      <a
                        href={`/api/certifications/${c.id}/file`}
                        target="_blank"
                        rel="noreferrer"
                        aria-label="Xem file chứng chỉ"
                        className="text-sky-400 hover:text-sky-300"
                      >
                        <Paperclip className="w-4 h-4" />
                      </a>
                    )}
                    {canManage && (
                      <button
                        onClick={() => deleteCert(c.id)}
                        aria-label="Xoá chứng chỉ"
                        className="text-zinc-400 hover:text-rose-400"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {addOpen && (
        <CertificationModal
          personnelId={person.id}
          onClose={() => setAddOpen(false)}
          onSaved={() => {
            setAddOpen(false);
            load();
          }}
        />
      )}
    </Modal>
  );
}

function CertificationModal({
  personnelId,
  onClose,
  onSaved,
}: {
  personnelId: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [kind, setKind] = useState("");
  const [code, setCode] = useState("");
  const [issuedDate, setIssuedDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const canSubmit = kind.trim().length > 0;

  async function submit() {
    setSaving(true);
    setErr("");
    try {
      const payload = {
        personnelId,
        kind: kind.trim(),
        code: code.trim() || null,
        issuedDate: issuedDate || null,
        expiryDate: expiryDate || null,
      };
      const res = await fetch("/api/certifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        setErr(j?.error ?? "Không tạo được chứng chỉ");
        return;
      }
      if (file) {
        const form = new FormData();
        form.append("file", file);
        const res2 = await fetch(`/api/certifications/${j.id}`, { method: "PATCH", body: form });
        if (!res2.ok) {
          setErr((await res2.json().catch(() => null))?.error ?? "Không lưu được file");
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
    <Modal onClose={onClose} className="max-w-sm" zIndex="z-[60]">
      <div className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Thêm chứng chỉ</h2>
          <button onClick={onClose} aria-label="Đóng" className="text-zinc-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <label className="text-xs text-zinc-400 block">
          Loại chứng chỉ
          <input
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            placeholder="Thẻ an toàn, chứng chỉ nghề, vận hành..."
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          />
        </label>

        <label className="text-xs text-zinc-400 block">
          Số chứng chỉ
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-zinc-400">
            Ngày cấp
            <input
              type="date"
              value={issuedDate}
              onChange={(e) => setIssuedDate(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-zinc-400">
            Ngày hết hạn
            <input
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
        </div>

        <label className="inline-flex items-center gap-2 text-sm text-zinc-300 hover:text-white cursor-pointer bg-zinc-800 hover:bg-zinc-700 px-3 py-2 rounded-lg w-fit">
          <Upload className="w-4 h-4" />
          {file ? file.name : "Chọn file (PDF/ảnh)"}
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
          className="w-full bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-on-accent font-semibold py-2 rounded-lg text-sm"
        >
          {saving ? "Đang lưu…" : "Lưu"}
        </button>
      </div>
    </Modal>
  );
}
