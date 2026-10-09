"use client";
import { useId, useState } from "react";
import { Banknote, X } from "lucide-react";
import { Modal } from "@/app/components/dialogs";
import { Button } from "@/app/components/ui";
import { todayISO } from "@/lib/nen/date";

// M129: hộp "Đánh dấu đã chi" cho phiếu thanh toán sinh từ đợt IPC đã duyệt. Server là ranh giới:
// SoD (người chi ≠ người duyệt → 403), ngày chi hợp lệ (422), đã chi rồi (409) — luôn hiện
// `error` tiếng Việt do server trả, không kẹt trạng thái "Đang lưu".
export default function DanhDauDaChiDialog({
  billId,
  maDot,
  onDong,
  onXong,
}: {
  billId: number;
  maDot: string;
  onDong: () => void;
  onXong: () => void | Promise<void>;
}) {
  const [paidAt, setPaidAt] = useState(todayISO());
  const [paidRef, setPaidRef] = useState("");
  const [paidNote, setPaidNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [loi, setLoi] = useState<string | null>(null);
  const idNgay = useId();
  const idRef = useId();
  const idNote = useId();

  async function gui() {
    setBusy(true);
    setLoi(null);
    try {
      const res = await fetch(`/api/payments/bills/${billId}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paidAt,
          ...(paidRef.trim() ? { paidRef: paidRef.trim() } : {}),
          ...(paidNote.trim() ? { paidNote: paidNote.trim() } : {}),
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: unknown } | null;
        setLoi(
          typeof j?.error === "string" ? j.error : `Đánh dấu đã chi thất bại (mã ${res.status})`,
        );
        return;
      }
      await onXong();
      onDong();
    } catch {
      setLoi("Mất kết nối — chưa rõ đã ghi nhận hay chưa. Có mạng lại thì tải lại đợt để kiểm tra");
    } finally {
      setBusy(false);
    }
  }

  const campCss =
    "w-full min-h-10 rounded-lg border border-zinc-700 bg-zinc-950/70 px-3 py-2 text-base text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/60";

  return (
    <Modal onClose={busy ? () => undefined : onDong} className="max-w-md">
      <div className="p-4 border-b border-zinc-800 flex items-start gap-3">
        <Banknote className="w-5 h-5 text-emerald-300 shrink-0 mt-0.5" aria-hidden="true" />
        <h2 className="flex-1 min-w-0 font-semibold text-sm text-zinc-100">
          Đánh dấu đã chi — {maDot}
        </h2>
        <Button
          icon={X}
          size="icon"
          variant="ghost"
          aria-label="Đóng"
          disabled={busy}
          onClick={onDong}
        />
      </div>
      <div className="p-4 space-y-3">
        <div className="space-y-1">
          <label htmlFor={idNgay} className="text-xs font-medium text-zinc-300">
            Ngày chi
          </label>
          <input
            id={idNgay}
            type="date"
            value={paidAt}
            max={todayISO()}
            disabled={busy}
            onChange={(e) => setPaidAt(e.target.value)}
            className={campCss}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor={idRef} className="text-xs font-medium text-zinc-300">
            Số chứng từ chi (tuỳ chọn)
          </label>
          <input
            id={idRef}
            value={paidRef}
            maxLength={100}
            disabled={busy}
            onChange={(e) => setPaidRef(e.target.value)}
            placeholder="Vd: UNC 0123"
            className={campCss}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor={idNote} className="text-xs font-medium text-zinc-300">
            Ghi chú (tuỳ chọn)
          </label>
          <textarea
            id={idNote}
            value={paidNote}
            rows={2}
            maxLength={1000}
            disabled={busy}
            onChange={(e) => setPaidNote(e.target.value)}
            className={campCss}
          />
        </div>
        {loi && (
          <p
            role="alert"
            className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300"
          >
            {loi}
          </p>
        )}
      </div>
      <div className="p-4 border-t border-zinc-800 flex flex-wrap justify-end gap-2">
        <Button variant="secondary" disabled={busy} onClick={onDong}>
          Huỷ
        </Button>
        <Button
          icon={Banknote}
          variant="primary"
          disabled={busy || !paidAt}
          aria-label="Xác nhận đánh dấu đã chi"
          onClick={() => void gui()}
        >
          {busy ? "Đang lưu…" : "Xác nhận đã chi"}
        </Button>
      </div>
    </Modal>
  );
}
