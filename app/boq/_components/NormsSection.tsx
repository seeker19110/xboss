"use client";
import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { appConfirm } from "@/app/components/dialogs";
import { showToast } from "@/app/components/Toast";
import { NORM_RESOURCE_TYPE_LABEL, type NormResourceType } from "./types";

type NormRow = {
  id: number;
  resourceType: NormResourceType;
  materialId: number | null;
  materialName: string | null;
  resourceName: string | null;
  qtyPerUnit: number;
  unitLabel: string;
};
type NormUsage = {
  normId: number;
  resourceType: NormResourceType;
  resourceLabel: string;
  unitLabel: string;
  expected: number;
  actual: number | null;
  variancePct: number | null;
};
type MaterialOption = { id: number; name: string };

// Tab "Định mức" (M18): định mức vật tư/nhân công/máy của dòng BOQ + đối chiếu tiêu hao
// thực tế. Xem docs/nang-cap/M18-dinh-muc.md.
export default function NormsSection({
  boqItemId,
  canManage,
}: {
  boqItemId: number;
  canManage: boolean;
}) {
  const [norms, setNorms] = useState<NormRow[]>([]);
  const [usage, setUsage] = useState<NormUsage[]>([]);
  const [materials, setMaterials] = useState<MaterialOption[]>([]);
  const [resourceType, setResourceType] = useState<NormResourceType>("material");
  const [materialName, setMaterialName] = useState("");
  const [resourceName, setResourceName] = useState("");
  const [qtyPerUnit, setQtyPerUnit] = useState("");
  const [unitLabel, setUnitLabel] = useState("");
  const [saving, setSaving] = useState(false);

  function load() {
    Promise.all([
      fetch(`/api/boq/${boqItemId}/norms`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/boq/${boqItemId}/norm-usage`).then((r) => (r.ok ? r.json() : null)),
    ]).then(([n, u]) => {
      setNorms(n?.norms ?? []);
      setUsage(u?.usage ?? []);
    });
  }

  useEffect(() => {
    load();
    if (canManage)
      fetch("/api/materials")
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => setMaterials(j?.materials ?? []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boqItemId]);

  function usageFor(normId: number): NormUsage | undefined {
    return usage.find((u) => u.normId === normId);
  }

  // M124 việc 6: bọc try/catch/finally — trước đây mất mạng làm `fetch` throw giữa chừng,
  // `saving` không bao giờ reset (nút "Thêm định mức" kẹt mãi ở trạng thái đang lưu).
  async function addNorm() {
    const material = materials.find((m) => m.name === materialName);
    if (resourceType === "material" && !material) {
      showToast("Chọn vật tư hợp lệ từ danh sách", "error");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/boq/${boqItemId}/norms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resourceType,
          materialId: resourceType === "material" ? material!.id : null,
          resourceName: resourceType === "material" ? null : resourceName.trim() || null,
          qtyPerUnit: Number(qtyPerUnit) || 0,
          unitLabel: unitLabel.trim(),
        }),
      });
      if (!res.ok) {
        showToast((await res.json().catch(() => null))?.error ?? "Thêm định mức thất bại", "error");
        return;
      }
      setMaterialName("");
      setResourceName("");
      setQtyPerUnit("");
      setUnitLabel("");
      load();
    } catch {
      showToast("Mất kết nối — kiểm tra mạng rồi thử lại", "error");
    } finally {
      setSaving(false);
    }
  }

  async function removeNorm(id: number) {
    if (!(await appConfirm("Xoá định mức này?", { danger: true, confirmLabel: "Xoá" }))) return;
    const res = await fetch(`/api/boq-norms/${id}`, { method: "DELETE" });
    if (!res.ok) {
      showToast((await res.json().catch(() => null))?.error ?? "Xoá thất bại", "error");
      return;
    }
    load();
  }

  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
        Định mức ({norms.length})
      </h3>

      {norms.length > 0 ? (
        <ul className="space-y-1.5">
          {norms.map((n) => {
            const u = usageFor(n.id);
            const over = u?.variancePct != null && u.variancePct > 20;
            const label = n.resourceType === "material" ? n.materialName : n.resourceName;
            return (
              <li key={n.id} className="border-b border-zinc-800/60 last:border-0 pb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-400 w-16 shrink-0">
                    {NORM_RESOURCE_TYPE_LABEL[n.resourceType]}
                  </span>
                  <span className="flex-1 min-w-0 truncate text-sm">{label}</span>
                  <span className="text-xs text-zinc-400 shrink-0">
                    {n.qtyPerUnit} {n.unitLabel}/ĐVT
                  </span>
                  {canManage && (
                    <button
                      onClick={() => removeNorm(n.id)}
                      aria-label={`Xoá định mức ${label}`}
                      className="text-zinc-500 hover:text-rose-300 shrink-0"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                {u && u.actual != null && (
                  <div className="mt-1 flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${over ? "bg-rose-500" : "bg-emerald-500"}`}
                        style={{
                          width: `${Math.min(100, u.expected > 0 ? (u.actual / u.expected) * 100 : 0)}%`,
                        }}
                      />
                    </div>
                    <span
                      className={`text-xs shrink-0 ${over ? "text-rose-300" : "text-zinc-400"}`}
                    >
                      {over && <AlertTriangle className="w-3 h-3 inline mr-1" />}
                      {u.actual.toFixed(1)}/{u.expected.toFixed(1)} {u.unitLabel}
                    </span>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-xs text-zinc-400">Chưa có định mức.</p>
      )}

      {canManage && (
        <div className="space-y-2 bg-zinc-800/60 rounded-lg p-3">
          <select
            value={resourceType}
            onChange={(e) => setResourceType(e.target.value as NormResourceType)}
            aria-label="Loại nguồn lực"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white"
          >
            {(Object.keys(NORM_RESOURCE_TYPE_LABEL) as NormResourceType[]).map((t) => (
              <option key={t} value={t}>
                {NORM_RESOURCE_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
          {resourceType === "material" ? (
            <>
              <input
                value={materialName}
                onChange={(e) => setMaterialName(e.target.value)}
                list="norm-material-list"
                placeholder="Chọn vật tư…"
                aria-label="Vật tư"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white"
              />
              <datalist id="norm-material-list">
                {materials.map((m) => (
                  <option key={m.id} value={m.name} />
                ))}
              </datalist>
            </>
          ) : (
            <input
              value={resourceName}
              onChange={(e) => setResourceName(e.target.value)}
              placeholder={resourceType === "labor" ? "Thợ hàn, thợ điện…" : "Máy khoan, cẩu tháp…"}
              aria-label="Tên nguồn lực"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white"
            />
          )}
          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              step="0.0001"
              value={qtyPerUnit}
              onChange={(e) => setQtyPerUnit(e.target.value)}
              placeholder="Định mức/ĐVT"
              aria-label="Định mức trên 1 đơn vị"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white"
            />
            <input
              value={unitLabel}
              onChange={(e) => setUnitLabel(e.target.value)}
              placeholder="Đơn vị (kg, công, ca máy…)"
              aria-label="Đơn vị định mức"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white"
            />
          </div>
          <button
            onClick={addNorm}
            disabled={saving || !qtyPerUnit || !unitLabel.trim()}
            className="bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-on-accent text-xs font-medium px-3 py-2 rounded-lg"
          >
            Thêm định mức
          </button>
        </div>
      )}
    </section>
  );
}
