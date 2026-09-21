"use client";
import { useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { Modal } from "@/app/components/dialogs";
import { Button } from "@/app/components/ui";
import {
  REASON_LABEL,
  type SystemOption,
  type VoReason,
} from "@/app/variations/_components/VoDocument";

// Hộp thoại TẠO phát sinh mới — giữ nguyên nội dung/nhãn/aria của bản cũ trong
// `app/variations/page.tsx` (M126 chỉ tách file cho page gọn lại, và đổi các nút viết tay
// sang `Button` dùng chung). Tạo mới vẫn là hộp thoại: nó không phải "mở một chứng từ".

type LineDraft = { code: string; name: string; unit: string; qty: string; unitPrice: string };

function emptyLine(): LineDraft {
  return { code: "", name: "", unit: "", qty: "", unitPrice: "" };
}

export default function AddVoModal({
  systems,
  boqIndex,
  onClose,
  onCreated,
}: {
  systems: SystemOption[];
  boqIndex: Map<string, number>;
  onClose: () => void;
  /** Trả id VO vừa tạo để trang mở luôn chứng từ của nó. */
  onCreated: (id: number) => void;
}) {
  const [title, setTitle] = useState("");
  const [reason, setReason] = useState<VoReason>("design_change");
  const [systemId, setSystemId] = useState<number | "">("");
  const [description, setDescription] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  function updateLine(i: number, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  // Prefill đơn giá theo BOQ gốc khi mã dòng KL trùng mã đã có (sửa được sau đó).
  function prefillPriceFromBoq(i: number, code: string) {
    const price = boqIndex.get(code.trim().toLowerCase());
    if (price != null) updateLine(i, { unitPrice: String(price) });
  }

  const canSubmit =
    title.trim() &&
    lines.length > 0 &&
    lines.every((l) => l.code.trim() && l.name.trim() && l.unit.trim() && Number(l.qty) > 0);

  async function submit() {
    setSaving(true);
    setErr("");
    try {
      const res = await fetch("/api/variations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          reason,
          description: description.trim() || null,
          systemId: systemId || null,
          lines: lines.map((l) => ({
            code: l.code.trim(),
            name: l.name.trim(),
            unit: l.unit.trim(),
            qty: Number(l.qty) || 0,
            unitPrice: Number(l.unitPrice) || 0,
          })),
        }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        setErr(j?.error ?? "Không tạo được phát sinh");
        return;
      }
      onCreated(Number(j?.id));
    } catch {
      setErr("Mất kết nối — kiểm tra mạng rồi thử lại");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal onClose={onClose} className="max-w-2xl">
      <div className="p-5 space-y-3 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Thêm phát sinh (VO)</h2>
          <Button size="icon" variant="ghost" icon={X} aria-label="Đóng" onClick={onClose} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-zinc-400 col-span-2">
            Tên phát sinh
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-zinc-400">
            Lý do
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value as VoReason)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            >
              {(Object.keys(REASON_LABEL) as VoReason[]).map((r) => (
                <option key={r} value={r}>
                  {REASON_LABEL[r]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-zinc-400">
            Hệ
            <select
              value={systemId}
              onChange={(e) => setSystemId(e.target.value ? Number(e.target.value) : "")}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            >
              <option value="">— Chưa gán —</option>
              {systems.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-zinc-400 col-span-2">
            Mô tả
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Dòng khối lượng
            </h3>
            <Button
              size="sm"
              variant="ghost"
              icon={Plus}
              onClick={() => setLines((prev) => [...prev, emptyLine()])}
            >
              Thêm dòng
            </Button>
          </div>
          <div className="space-y-2">
            {lines.map((l, i) => (
              <div key={i} className="grid grid-cols-12 gap-1.5 items-center">
                <input
                  value={l.code}
                  onChange={(e) => updateLine(i, { code: e.target.value })}
                  onBlur={(e) => prefillPriceFromBoq(i, e.target.value)}
                  placeholder="Mã"
                  aria-label={`Mã dòng ${i + 1}`}
                  className="col-span-3 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-white"
                />
                <input
                  value={l.name}
                  onChange={(e) => updateLine(i, { name: e.target.value })}
                  placeholder="Tên công tác"
                  aria-label={`Tên dòng ${i + 1}`}
                  className="col-span-3 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-white"
                />
                <input
                  value={l.unit}
                  onChange={(e) => updateLine(i, { unit: e.target.value })}
                  placeholder="ĐVT"
                  aria-label={`Đơn vị tính dòng ${i + 1}`}
                  className="col-span-2 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-white"
                />
                <input
                  type="number"
                  value={l.qty}
                  onChange={(e) => updateLine(i, { qty: e.target.value })}
                  placeholder="KL"
                  aria-label={`Khối lượng dòng ${i + 1}`}
                  className="col-span-1 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-white"
                />
                <input
                  type="number"
                  value={l.unitPrice}
                  onChange={(e) => updateLine(i, { unitPrice: e.target.value })}
                  placeholder="Đơn giá"
                  aria-label={`Đơn giá dòng ${i + 1}`}
                  className="col-span-2 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-white"
                />
                {/* Nút xoá dòng giữ nguyên class viết tay: ô chỉ rộng 1/12 cột nên không
                    dùng được `Button size="icon"` (min-w 40px sẽ phá lưới trên điện thoại). */}
                <button
                  onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))}
                  disabled={lines.length === 1}
                  aria-label={`Xoá dòng ${i + 1}`}
                  className="col-span-1 text-zinc-500 hover:text-rose-300 disabled:opacity-30 flex justify-center"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {err && <p className="text-sm text-rose-300">{err}</p>}
        <Button
          variant="primary"
          className="w-full"
          disabled={saving || !canSubmit}
          onClick={submit}
        >
          {saving ? "Đang tạo…" : "Tạo phát sinh"}
        </Button>
      </div>
    </Modal>
  );
}
