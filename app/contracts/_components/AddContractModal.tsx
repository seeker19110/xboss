"use client";
import { useState } from "react";
import { X } from "lucide-react";
import { Modal } from "@/app/components/dialogs";
import { Button } from "@/app/components/ui";
import type {
  ContractKind,
  Supplier,
  SystemOption,
} from "@/app/contracts/_components/ContractDocument";

// Hộp thoại TẠO MỚI hợp đồng — M126 chỉ tách nguyên khối ra khỏi `page.tsx` (trang đã
// chuyển sang master–detail, không còn hộp thoại chi tiết). Nhãn/aria giữ y nguyên.

/** `text-base` dưới sm để iOS Safari không tự phóng to trang khi gõ. */
const O_NHAP =
  "mt-1 w-full min-h-10 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-base sm:text-sm text-white";

export default function AddContractModal({
  suppliers,
  systems,
  onClose,
  onCreated,
}: {
  suppliers: Supplier[];
  systems: SystemOption[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [code, setCode] = useState("");
  const [kind, setKind] = useState<ContractKind>("ncc");
  const [title, setTitle] = useState("");
  const [partySupplierId, setPartySupplierId] = useState<number | "">("");
  const [partyName, setPartyName] = useState("");
  const [systemId, setSystemId] = useState<number | "">("");
  const [value, setValue] = useState("0");
  const [advancePct, setAdvancePct] = useState("0");
  const [retentionPct, setRetentionPct] = useState("0");
  const [validFrom, setValidFrom] = useState("");
  const [validTo, setValidTo] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const needsSupplier = kind !== "nhan_thau";

  async function submit() {
    setSaving(true);
    setErr("");
    try {
      const res = await fetch("/api/contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code.trim(),
          kind,
          title: title.trim(),
          partySupplierId: needsSupplier && partySupplierId ? Number(partySupplierId) : null,
          partyName: !needsSupplier ? partyName.trim() || null : null,
          systemId: systemId || null,
          value: Number(value) || 0,
          advancePct: Number(advancePct) || 0,
          retentionPct: Number(retentionPct) || 0,
          validFrom: validFrom || null,
          validTo: validTo || null,
          status: "active",
        }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        setErr(j?.error ?? "Không tạo được hợp đồng");
        return;
      }
      onCreated();
    } catch {
      setErr("Mất kết nối — kiểm tra mạng rồi thử lại");
    } finally {
      setSaving(false);
    }
  }

  const canSubmit =
    code.trim() && title.trim() && (needsSupplier ? partySupplierId : partyName.trim());

  return (
    <Modal onClose={onClose}>
      <div className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Thêm hợp đồng</h2>
          <Button size="icon" variant="ghost" icon={X} aria-label="Đóng" onClick={onClose} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-zinc-400">
            Số hợp đồng
            <input value={code} onChange={(e) => setCode(e.target.value)} className={O_NHAP} />
          </label>
          <label className="text-xs text-zinc-400">
            Loại
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as ContractKind)}
              className={O_NHAP}
            >
              <option value="ncc">Nhà cung cấp</option>
              <option value="giao_thau">Giao thầu</option>
              <option value="nhan_thau">Nhận thầu</option>
            </select>
          </label>
          <label className="text-xs text-zinc-400 col-span-2">
            Tên hợp đồng
            <input value={title} onChange={(e) => setTitle(e.target.value)} className={O_NHAP} />
          </label>
          {needsSupplier ? (
            <label className="text-xs text-zinc-400 col-span-2">
              Đối tác (NCC/thầu phụ)
              <select
                value={partySupplierId}
                onChange={(e) => setPartySupplierId(e.target.value ? Number(e.target.value) : "")}
                className={O_NHAP}
              >
                <option value="">— Chọn đối tác —</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="text-xs text-zinc-400 col-span-2">
              Tên CĐT / tổng thầu
              <input
                value={partyName}
                onChange={(e) => setPartyName(e.target.value)}
                className={O_NHAP}
              />
            </label>
          )}
          <label className="text-xs text-zinc-400 col-span-2">
            Hệ
            <select
              value={systemId}
              onChange={(e) => setSystemId(e.target.value ? Number(e.target.value) : "")}
              className={O_NHAP}
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
            Giá trị hợp đồng
            <input
              type="number"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className={O_NHAP}
            />
          </label>
          <label className="text-xs text-zinc-400">
            % tạm ứng
            <input
              type="number"
              value={advancePct}
              onChange={(e) => setAdvancePct(e.target.value)}
              className={O_NHAP}
            />
          </label>
          <label className="text-xs text-zinc-400">
            % giữ lại bảo hành
            <input
              type="number"
              value={retentionPct}
              onChange={(e) => setRetentionPct(e.target.value)}
              className={O_NHAP}
            />
          </label>
          <label className="text-xs text-zinc-400">
            Hiệu lực từ
            <input
              type="date"
              value={validFrom}
              onChange={(e) => setValidFrom(e.target.value)}
              className={O_NHAP}
            />
          </label>
          <label className="text-xs text-zinc-400">
            Hiệu lực đến
            <input
              type="date"
              value={validTo}
              onChange={(e) => setValidTo(e.target.value)}
              className={O_NHAP}
            />
          </label>
        </div>
        {err && <p className="text-sm text-rose-300">{err}</p>}
        <Button
          variant="primary"
          className="w-full"
          disabled={saving || !canSubmit}
          onClick={() => void submit()}
        >
          {saving ? "Đang tạo…" : "Tạo hợp đồng"}
        </Button>
      </div>
    </Modal>
  );
}
