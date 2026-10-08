"use client";
import { useId, useState } from "react";
import { AlertTriangle, Check, X } from "lucide-react";
import { Modal } from "@/app/components/dialogs";
import { Button } from "@/app/components/ui";
import type { YeuCauXacNhan } from "./chiTietDot";

// Hộp xác nhận cảnh báo vượt khối lượng hợp đồng khi DUYỆT đợt IPC (QUALITY-FINAL-1 S13c,
// A5-FR07). Vượt KL vẫn là cảnh báo (không chặn) — nhưng người duyệt phải tự tick đã xem từng
// dòng + nêu lý do; client gửi kèm warningVersion của đúng bản đang hiển thị. Không bao giờ tự
// gửi lại với acknowledged=true: cảnh báo đổi (409 warning_changed) thì hộp mở lại với danh sách
// mới, ô xác nhận bỏ tick, người duyệt phải xem và xác nhận lại. Dùng chung cho chứng từ IPC
// (/payment-certs) và hộp "Chờ tôi duyệt" (/approvals).
export default function XacNhanCanhBaoDialog({
  yeuCau,
  maDot,
  busy,
  onHuy,
  onXacNhan,
}: {
  yeuCau: YeuCauXacNhan;
  /** Mã/nhãn đợt hiển thị trên tiêu đề. */
  maDot: string;
  busy: boolean;
  onHuy: () => void;
  onXacNhan: (lyDo: string) => void;
}) {
  const [daXem, setDaXem] = useState(false);
  const [lyDo, setLyDo] = useState("");
  const idLyDo = useId();
  const idDaXem = useId();
  const duDieuKien = daXem && lyDo.trim().length > 0 && !busy;

  return (
    <Modal onClose={busy ? () => undefined : onHuy} className="max-w-lg">
      <div className="p-4 border-b border-zinc-800 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-300 shrink-0 mt-0.5" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-sm text-zinc-100">
            Duyệt {maDot} — xác nhận cảnh báo vượt khối lượng hợp đồng
          </h2>
          <p className="text-xs text-zinc-400 mt-1">
            {yeuCau.vuotHopDong.length} dòng có khối lượng luỹ kế vượt khối lượng hợp đồng. Đây là
            cảnh báo, không chặn — nhưng cần bạn xác nhận đã xem và nêu lý do.
          </p>
        </div>
        <Button
          icon={X}
          size="icon"
          variant="ghost"
          aria-label="Đóng"
          disabled={busy}
          onClick={onHuy}
        />
      </div>

      <div className="p-4 space-y-3">
        {yeuCau.doiNguon && (
          <p
            role="alert"
            className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300"
          >
            Cảnh báo đã thay đổi kể từ lúc bạn xem (khối lượng hoặc luỹ kế vừa được cập nhật). Đợt
            CHƯA được duyệt — xem lại danh sách dưới đây rồi xác nhận lại.
          </p>
        )}
        <ul className="rounded-lg border border-rose-900/60 bg-rose-950/20 divide-y divide-rose-900/40 text-xs text-rose-200">
          {yeuCau.vuotHopDong.map((d) => (
            <li key={d.boqItemId} className="flex gap-2 px-3 py-2">
              <span className="font-mono shrink-0">{d.code}</span>
              <span className="truncate flex-1">{d.name}</span>
              <span className="font-mono tabular-nums shrink-0">
                luỹ kế {d.qtyCumulative}/{d.qtyContract} {d.unit}
              </span>
            </li>
          ))}
        </ul>

        <label htmlFor={idDaXem} className="flex items-start gap-2.5 min-h-10 cursor-pointer">
          <input
            id={idDaXem}
            type="checkbox"
            checked={daXem}
            disabled={busy}
            onChange={(e) => setDaXem(e.target.checked)}
            className="mt-1 h-4 w-4 accent-emerald-500"
          />
          <span className="text-sm text-zinc-200">
            Tôi đã xem từng dòng vượt khối lượng ở trên và chịu trách nhiệm duyệt đợt này
          </span>
        </label>

        <div className="space-y-1">
          <label htmlFor={idLyDo} className="text-xs font-medium text-zinc-300">
            Lý do duyệt vượt khối lượng (bắt buộc)
          </label>
          <textarea
            id={idLyDo}
            value={lyDo}
            disabled={busy}
            maxLength={2000}
            rows={3}
            onChange={(e) => setLyDo(e.target.value)}
            placeholder="Vd: Phụ lục VO bổ sung khối lượng đang chờ ký"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950/70 px-3 py-2 text-base sm:text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/60"
          />
        </div>
      </div>

      <div className="p-4 border-t border-zinc-800 flex flex-wrap justify-end gap-2">
        <Button variant="secondary" disabled={busy} onClick={onHuy}>
          Huỷ
        </Button>
        <Button
          icon={Check}
          variant="primary"
          disabled={!duDieuKien}
          onClick={() => onXacNhan(lyDo.trim())}
        >
          {busy ? "Đang gửi…" : "Xác nhận và duyệt"}
        </Button>
      </div>
    </Modal>
  );
}
