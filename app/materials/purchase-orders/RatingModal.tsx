"use client";
import { useState } from "react";
import { Star, X } from "lucide-react";
import { Modal } from "@/app/components/dialogs";

type PO = { id: number; poCode: string; supplierId: number | null; supplierName: string | null };

function StarInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className="text-xs text-zinc-400 mb-1 block">{label}</label>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            aria-label={`${label}: ${n} sao`}
            className="p-0.5"
          >
            <Star
              className={`w-6 h-6 ${n <= value ? "fill-amber-400 text-amber-400" : "text-zinc-600"}`}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

// Modal đánh giá NCC theo 1 PO cụ thể (3 tiêu chí sao + ghi chú) — M4 PR2.
export default function RatingModal({ po, onClose }: { po: PO; onClose: () => void }) {
  const [quality, setQuality] = useState(5);
  const [delivery, setDelivery] = useState(5);
  const [price, setPrice] = useState(5);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setSaving(true);
    setError("");
    try {
      const r = await fetch(`/api/suppliers/${po.supplierId}/ratings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          poId: po.id,
          quality,
          delivery,
          price,
          note: note.trim() || undefined,
        }),
      });
      if (r.ok) {
        onClose();
      } else {
        const j = await r.json().catch(() => ({}));
        setError(j.error ?? "Lỗi đánh giá");
      }
    } catch {
      setError("Mất kết nối mạng — vui lòng thử lại");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal onClose={onClose} className="max-w-md p-6">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 className="font-bold text-lg">Đánh giá nhà cung cấp</h3>
          <p className="text-sm text-zinc-400">
            {po.poCode}
            {po.supplierName ? ` – ${po.supplierName}` : ""}
          </p>
        </div>
        <button onClick={onClose} aria-label="Đóng" className="text-zinc-400 hover:text-zinc-100">
          <X className="w-5 h-5" />
        </button>
      </div>

      {error && (
        <div className="mb-3 p-2.5 bg-red-900/50 border border-red-700 rounded text-sm">
          {error}
        </div>
      )}

      <div className="space-y-4 mb-5">
        <StarInput label="Chất lượng hàng" value={quality} onChange={setQuality} />
        <StarInput label="Giao hàng đúng hẹn" value={delivery} onChange={setDelivery} />
        <StarInput label="Giá cả" value={price} onChange={setPrice} />
        <div>
          <label className="text-xs text-zinc-400 mb-1 block">Ghi chú</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className="w-full bg-zinc-700 border border-zinc-600 rounded px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-blue-500 resize-none"
          />
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={submit}
          disabled={saving}
          className="flex items-center gap-2 bg-amber-700 hover:bg-amber-600 disabled:opacity-50 px-5 py-2.5 rounded text-sm font-medium text-on-accent"
        >
          <Star className="w-4 h-4" /> Lưu đánh giá
        </button>
        <button
          onClick={onClose}
          className="px-5 py-2.5 rounded bg-zinc-700 hover:bg-zinc-600 text-sm"
        >
          Huỷ
        </button>
      </div>
    </Modal>
  );
}
