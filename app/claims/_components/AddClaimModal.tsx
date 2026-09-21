"use client";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Modal } from "@/app/components/dialogs";
import { Button } from "@/app/components/ui";
import { KIND_LABEL, type ClaimKind } from "@/app/claims/_components/ClaimDocument";

// Hộp thoại TẠO claim — tách nguyên trạng khỏi `app/claims/page.tsx` khi trang chuyển sang
// bố cục master–detail (M126). Giữ y nguyên text/label/aria (e2e neo vào heading "Thêm
// claim", nhóm "Chọn loại claim", nhãn "Số ngày đề xuất"); chỉ đổi các <button> viết tay
// sang component `Button` dùng chung.

export type Contract = { id: number; code: string; title: string; kind: string };

export default function AddClaimModal({
  contracts,
  onClose,
  onCreated,
}: {
  contracts: Contract[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [kind, setKind] = useState<ClaimKind>("cost");
  const [title, setTitle] = useState("");
  const [contractId, setContractId] = useState<number | "">("");
  const [noticeDate, setNoticeDate] = useState("");
  const [cause, setCause] = useState("");
  const [amountRequested, setAmountRequested] = useState("");
  const [daysRequested, setDaysRequested] = useState("");
  const [suggestion, setSuggestion] = useState<{
    suggestedDays: number;
    waitingFloors: number;
  } | null>(null);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (kind !== "eot") return;
    fetch("/api/claims/eot-suggestion")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setSuggestion(j ?? null))
      .catch(() => setSuggestion(null));
  }, [kind]);

  const canSubmit =
    title.trim() &&
    noticeDate.trim() &&
    cause.trim() &&
    (kind === "cost" ? Number(amountRequested) > 0 : Number(daysRequested) > 0);

  async function submit() {
    setSaving(true);
    setErr("");
    try {
      const res = await fetch("/api/claims", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          title: title.trim(),
          contractId: contractId || null,
          noticeDate,
          cause: cause.trim(),
          amountRequested: kind === "cost" ? Number(amountRequested) || 0 : null,
          daysRequested: kind === "eot" ? Number(daysRequested) || 0 : null,
        }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        setErr(j?.error ?? "Không tạo được claim");
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
    <Modal onClose={onClose} className="max-w-lg">
      <div className="p-5 space-y-3 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Thêm claim</h2>
          <Button size="icon" variant="ghost" icon={X} aria-label="Đóng" onClick={onClose} />
        </div>

        <div className="flex gap-1.5" role="group" aria-label="Chọn loại claim">
          {(["cost", "eot"] as const).map((k) => (
            <Button
              key={k}
              variant={kind === k ? "primary" : "secondary"}
              onClick={() => setKind(k)}
              aria-pressed={kind === k}
              className="flex-1"
            >
              {KIND_LABEL[k]}
            </Button>
          ))}
        </div>

        <label className="text-xs text-zinc-400 block">
          Tiêu đề
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-base sm:text-sm text-white"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-zinc-400">
            Ngày thông báo
            <input
              type="date"
              value={noticeDate}
              onChange={(e) => setNoticeDate(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-base sm:text-sm text-white"
            />
          </label>
          <label className="text-xs text-zinc-400">
            Hợp đồng (tuỳ chọn)
            <select
              value={contractId}
              onChange={(e) => setContractId(e.target.value ? Number(e.target.value) : "")}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-base sm:text-sm text-white"
            >
              <option value="">— Không gắn —</option>
              {contracts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} — {c.title}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="text-xs text-zinc-400 block">
          Nguyên nhân
          <textarea
            value={cause}
            onChange={(e) => setCause(e.target.value)}
            rows={2}
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-base sm:text-sm text-white"
          />
        </label>

        {kind === "cost" ? (
          <label className="text-xs text-zinc-400 block">
            Giá trị đề xuất (đ)
            <input
              type="number"
              value={amountRequested}
              onChange={(e) => setAmountRequested(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-base sm:text-sm text-white"
            />
          </label>
        ) : (
          <div className="space-y-1.5">
            <label className="text-xs text-zinc-400 block">
              Số ngày đề xuất
              <input
                type="number"
                value={daysRequested}
                onChange={(e) => setDaysRequested(e.target.value)}
                className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-base sm:text-sm text-white"
              />
            </label>
            {suggestion && suggestion.waitingFloors > 0 && (
              <p className="text-xs text-amber-300">
                Gợi ý: {suggestion.suggestedDays} ngày chờ mặt bằng luỹ kế (
                {suggestion.waitingFloors} tầng đang chờ) —{" "}
                <button
                  onClick={() => setDaysRequested(String(suggestion.suggestedDays))}
                  className="underline hover:no-underline"
                >
                  dùng số này
                </button>
              </p>
            )}
          </div>
        )}

        {err && <p className="text-sm text-rose-300">{err}</p>}
        <Button
          variant="primary"
          onClick={submit}
          disabled={saving || !canSubmit}
          className="w-full"
        >
          {saving ? "Đang tạo…" : "Tạo claim"}
        </Button>
      </div>
    </Modal>
  );
}
