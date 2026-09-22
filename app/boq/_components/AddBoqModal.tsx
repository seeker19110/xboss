"use client";
import { useState } from "react";
import { X } from "lucide-react";
import { Modal } from "@/app/components/dialogs";
import type { SystemOption } from "./types";

export default function AddBoqModal({
  systems,
  onClose,
  onCreated,
}: {
  systems: SystemOption[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [systemId, setSystemId] = useState<number | "">("");
  const [qtyContract, setQtyContract] = useState("0");
  const [unitPrice, setUnitPrice] = useState("0");
  const [qtySub, setQtySub] = useState("0");
  const [subUnitPrice, setSubUnitPrice] = useState("0");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    setErr("");
    try {
      const res = await fetch("/api/boq", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code.trim(),
          name: name.trim(),
          unit: unit.trim(),
          systemId: systemId || undefined,
          qtyContract: Number(qtyContract) || 0,
          unitPrice: Number(unitPrice) || 0,
          qtySub: Number(qtySub) || 0,
          subUnitPrice: Number(subUnitPrice) || 0,
        }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        setErr(j?.error ?? "Không tạo được dòng BOQ");
        return;
      }
      onCreated();
    } catch {
      setErr("Mất kết nối — kiểm tra mạng rồi thử lại");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal onClose={onClose}>
      <div className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Thêm dòng BOQ</h2>
          <button onClick={onClose} aria-label="Đóng" className="text-zinc-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-zinc-400 col-span-1">
            Mã BOQ
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-zinc-400 col-span-1">
            Đơn vị tính
            <input
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-zinc-400 col-span-2">
            Tên hạng mục
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-zinc-400 col-span-2">
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
          <label className="text-xs text-zinc-400">
            KL nhận thầu
            <input
              type="number"
              value={qtyContract}
              onChange={(e) => setQtyContract(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-zinc-400">
            Đơn giá
            <input
              type="number"
              value={unitPrice}
              onChange={(e) => setUnitPrice(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-zinc-400">
            KL giao thầu phụ
            <input
              type="number"
              value={qtySub}
              onChange={(e) => setQtySub(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-zinc-400">
            Đơn giá giao thầu phụ
            <input
              type="number"
              value={subUnitPrice}
              onChange={(e) => setSubUnitPrice(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
        </div>
        {err && <p className="text-sm text-rose-300">{err}</p>}
        <button
          onClick={submit}
          disabled={saving || !code.trim() || !name.trim() || !unit.trim()}
          className="w-full bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-on-accent font-semibold py-2 rounded-lg text-sm"
        >
          {saving ? "Đang tạo…" : "Tạo dòng BOQ"}
        </button>
      </div>
    </Modal>
  );
}
