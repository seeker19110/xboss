"use client";

// CustomFieldsSection — form trường tuỳ biến (M52 PR2) gắn vào modal/trang chi tiết
// của 4 entity (task/contract/material/work_package). Tự nạp định nghĩa theo entity +
// dự án đang chọn, render input theo type, lưu qua PATCH entity với khoá `custom`
// (merge shallow — không đè field khác của entity).
import { useCallback, useEffect, useState } from "react";

type CustomFieldDef = {
  id: number;
  key: string;
  label: string;
  type: "text" | "number" | "date" | "select" | "checkbox";
  options: string[] | null;
  required: boolean;
};

type Props = {
  // 'task' | 'contract' | 'material' | 'work_package'
  entityType: string;
  // Đường dẫn PATCH entity, vd `/api/tasks/123`.
  apiPath: string;
  // Giá trị custom hiện tại của entity (từ dữ liệu đã nạp).
  value: Record<string, unknown> | null | undefined;
  // Cho phép sửa (mặc định false = chỉ xem).
  canEdit?: boolean;
  // Gọi lại sau khi lưu thành công (để cha refresh nếu cần).
  onSaved?: (custom: Record<string, unknown>) => void;
};

const inputCls =
  "mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100";

export default function CustomFieldsSection({
  entityType,
  apiPath,
  value,
  canEdit = false,
  onSaved,
}: Props) {
  const [defs, setDefs] = useState<CustomFieldDef[] | null>(null);
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`/api/custom-fields?entityType=${encodeURIComponent(entityType)}`)
      .then((r) => (r.ok ? r.json() : { defs: [] }))
      .then((d) => {
        if (alive) setDefs(d.defs ?? []);
      })
      .catch(() => {
        if (alive) setDefs([]);
      });
    return () => {
      alive = false;
    };
  }, [entityType]);

  // Khởi tạo giá trị form từ value hiện có khi defs sẵn sàng.
  useEffect(() => {
    if (!defs) return;
    const init: Record<string, unknown> = {};
    for (const d of defs)
      init[d.key] = (value ?? {})[d.key] ?? (d.type === "checkbox" ? false : "");
    setForm(init);
  }, [defs, value]);

  const setField = useCallback((key: string, v: unknown) => {
    setForm((f) => ({ ...f, [key]: v }));
    setOk(false);
  }, []);

  const save = useCallback(async () => {
    if (!defs) return;
    setSaving(true);
    setErr(null);
    setOk(false);
    // Chuẩn hoá: chuỗi rỗng = null (xoá giá trị); số ép về number.
    const custom: Record<string, unknown> = {};
    for (const d of defs) {
      const raw = form[d.key];
      if (d.type === "checkbox") custom[d.key] = !!raw;
      else if (raw === "" || raw === null || raw === undefined) custom[d.key] = null;
      else if (d.type === "number") custom[d.key] = Number(raw);
      else custom[d.key] = raw;
    }
    try {
      const res = await fetch(apiPath, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ custom }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErr(d.error ?? "Lưu thất bại");
      } else {
        setOk(true);
        onSaved?.(custom);
      }
    } catch {
      setErr("Lỗi mạng khi lưu");
    } finally {
      setSaving(false);
    }
  }, [defs, form, apiPath, onSaved]);

  if (defs === null) return <p className="text-xs text-zinc-500">Đang tải trường tuỳ biến…</p>;
  if (defs.length === 0) return null;

  return (
    <section className="space-y-3 border-t border-zinc-800 pt-3">
      <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wide">Trường tuỳ biến</h3>
      <div className="space-y-3">
        {defs.map((d) => (
          <label key={d.id} className="text-xs text-zinc-400 block">
            {d.label}
            {d.required && <span className="text-rose-400"> *</span>}
            {d.type === "checkbox" ? (
              <div className="mt-1">
                <input
                  type="checkbox"
                  checked={!!form[d.key]}
                  disabled={!canEdit}
                  onChange={(e) => setField(d.key, e.target.checked)}
                  className="w-4 h-4 align-middle accent-emerald-500"
                />
              </div>
            ) : d.type === "select" ? (
              <select
                value={String(form[d.key] ?? "")}
                disabled={!canEdit}
                onChange={(e) => setField(d.key, e.target.value)}
                className={inputCls}
              >
                <option value="">— Chọn —</option>
                {(d.options ?? []).map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type={d.type === "number" ? "number" : d.type === "date" ? "date" : "text"}
                value={String(form[d.key] ?? "")}
                disabled={!canEdit}
                onChange={(e) => setField(d.key, e.target.value)}
                className={inputCls}
              />
            )}
          </label>
        ))}
      </div>
      {err && <p className="text-sm text-rose-300">{err}</p>}
      {ok && <p className="text-sm text-emerald-300">Đã lưu.</p>}
      {canEdit && (
        <button
          onClick={save}
          disabled={saving}
          className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-100 text-sm font-medium px-4 py-2 rounded-lg"
        >
          {saving ? "Đang lưu…" : "Lưu trường tuỳ biến"}
        </button>
      )}
    </section>
  );
}
