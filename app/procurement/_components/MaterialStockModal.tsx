"use client";
// Modal "Kho" của 1 vật tư: xuất kho ra công trường, hoàn kho, điều chỉnh số đã dùng, lịch sử
// giao dịch và trường tuỳ chỉnh. Khôi phục các thao tác trang /materials cũ từng có (nút xuất/hoàn
// kho, modal lịch sử) mà bị rơi mất khi gộp vào tab "Kho & Định Mức" của /procurement
// (commit 3044a12a) — backend vẫn còn nguyên:
//   POST /api/materials/:id/issue        (qty_stock −, qty_used +, kèm tầng/tổ đội)
//   POST /api/materials/:id/return       (qty_stock +, qty_used −)
//   GET/POST /api/materials/:id/transactions (lịch sử / điều chỉnh ± qty_used)
//   GET /api/materials/allocation-meta   (gợi ý tầng/tổ đội đã dùng)
import { useCallback, useEffect, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, History, SlidersHorizontal, X } from "lucide-react";
import { Modal } from "@/app/components/dialogs";
import { showToast } from "@/app/components/Toast";
import CustomFieldsSection from "@/app/components/CustomFieldsSection";
import { taiJson, taiJsonMoi } from "@/app/lib/taiDuLieu";
import { formatDateTimeVN } from "@/lib/nen/date";
import type { Material } from "./InventoryTab";

type Transaction = {
  id: number;
  delta: number;
  qtyAfter: number;
  note: string | null;
  type: string;
  floorLabel: string | null;
  crew: string | null;
  createdAt: string;
  userName: string | null;
};

const TX_TYPE_LABEL: Record<string, string> = {
  nhap_kho: "Nhập kho",
  xuat_cong_truong: "Xuất công trường",
  hoan_kho: "Hoàn kho",
  dieu_chinh: "Điều chỉnh",
};

type Mode = "issue" | "return" | "adjust";

const MODES: { key: Mode; label: string; icon: typeof History }[] = [
  { key: "issue", label: "Xuất kho", icon: ArrowDownToLine },
  { key: "return", label: "Hoàn kho", icon: ArrowUpFromLine },
  { key: "adjust", label: "Điều chỉnh", icon: SlidersHorizontal },
];

const INPUT =
  "w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 h-10 text-base sm:text-sm outline-none focus:border-emerald-500";

export default function MaterialStockModal({
  material,
  canEdit,
  onClose,
  onChanged,
}: {
  material: Material;
  /** admin/pm/engineer — cùng nhóm quyền với các route (API vẫn là ranh giới thật). */
  canEdit: boolean;
  onClose: () => void;
  /** Gọi sau mỗi giao dịch thành công để tab tải lại lưới vật tư. */
  onChanged: () => void;
}) {
  const [stock, setStock] = useState(material.qtyStock ?? 0);
  const [used, setUsed] = useState(material.qtyUsed ?? 0);
  const [items, setItems] = useState<Transaction[] | null>(null);
  const [loi, setLoi] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("issue");
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const [floor, setFloor] = useState("");
  const [crew, setCrew] = useState("");
  const [meta, setMeta] = useState<{ floors: string[]; crews: string[] }>({
    floors: [],
    crews: [],
  });
  const [busy, setBusy] = useState(false);
  const [formErr, setFormErr] = useState("");
  // Idempotency-Key cho xuất/hoàn: giữ nguyên qua các lần bấm lại cùng một lượt nhập (mạng
  // công trường chập chờn → retry không ghi trùng), đổi mới sau mỗi lần ghi thành công.
  const [idemKey, setIdemKey] = useState(() => crypto.randomUUID());

  // Luôn bỏ qua cache SW (taiJsonMoi): giao dịch còn phát sinh từ chỗ khác (sửa trực tiếp ô "Đã
  // dùng" trên lưới, modal lần mở trước…), nên bản cache của lần mở đầu sẽ thiếu giao dịch mới.
  const loadHistory = useCallback(async () => {
    const kq = await taiJsonMoi<{ transactions?: Transaction[] }>(
      `/api/materials/${material.id}/transactions`,
    );
    if (!kq.ok) {
      setLoi(kq.loi);
      return;
    }
    setLoi(null);
    setItems(kq.data.transactions ?? []);
  }, [material.id]);

  useEffect(() => {
    void loadHistory();
    if (canEdit)
      void taiJson<{ floors?: string[]; crews?: string[] }>("/api/materials/allocation-meta").then(
        (kq) => kq.ok && setMeta({ floors: kq.data.floors ?? [], crews: kq.data.crews ?? [] }),
      );
  }, [loadHistory, canEdit]);

  async function submit(sign: 1 | -1 = 1) {
    const n = Number(qty);
    if (!Number.isFinite(n) || n <= 0) {
      setFormErr("Nhập số lượng lớn hơn 0");
      return;
    }
    setBusy(true);
    setFormErr("");
    const trimmedNote = note.trim() || undefined;
    let res: Response | null;
    if (mode === "adjust") {
      res = await fetch(`/api/materials/${material.id}/transactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ delta: n * sign, note: trimmedNote }),
      }).catch(() => null);
    } else {
      res = await fetch(`/api/materials/${material.id}/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": idemKey },
        body: JSON.stringify(
          mode === "issue"
            ? {
                qty: n,
                note: trimmedNote,
                floorLabel: floor.trim() || undefined,
                crew: crew.trim() || undefined,
              }
            : { qty: n, note: trimmedNote },
        ),
      }).catch(() => null);
    }
    setBusy(false);
    if (!res) {
      setFormErr("Mất kết nối mạng — thử lại");
      return;
    }
    const j = await res.json().catch(() => null);
    if (!res.ok) {
      setFormErr(j?.error ?? "Không lưu được giao dịch");
      return;
    }
    if (mode === "adjust") setUsed(j?.qtyAfter ?? used);
    else {
      setStock(j?.qtyStock ?? stock);
      setUsed(j?.qtyUsed ?? used);
    }
    showToast(
      mode === "issue" ? "Đã xuất kho" : mode === "return" ? "Đã hoàn kho" : "Đã điều chỉnh",
    );
    setQty("");
    setNote("");
    setIdemKey(crypto.randomUUID());
    await loadHistory();
    onChanged();
  }

  const over = material.qtyPlanned > 0 && used > material.qtyPlanned;
  const unit = material.unit ? ` ${material.unit}` : "";

  return (
    <Modal onClose={onClose} className="max-w-2xl max-h-[90vh] flex flex-col">
      <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-2">
        <History className="w-4 h-4 text-emerald-400 shrink-0" />
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-sm truncate" title={material.name}>
            {material.name}
          </h3>
          <p className="text-xs text-zinc-400 truncate">
            {material.boqCode && (
              <span className="font-mono text-amber-400 mr-2">{material.boqCode}</span>
            )}
            Tồn kho <span className="text-sky-300 font-semibold">{stock}</span>
            {unit} · Đã dùng{" "}
            <span className={over ? "text-rose-400 font-semibold" : "text-zinc-200 font-semibold"}>
              {used}
            </span>
            {material.qtyPlanned > 0 && <> / ĐM {material.qtyPlanned}</>}
            {over && <span className="text-rose-400"> (vượt định mức)</span>}
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label="Đóng"
          className="w-10 h-10 flex items-center justify-center rounded-lg text-zinc-400 hover:text-white shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {canEdit && (
        <div className="px-4 py-3 border-b border-zinc-800 bg-zinc-950/70 space-y-3">
          <div
            role="tablist"
            aria-label="Loại giao dịch"
            className="flex gap-1 p-1 bg-zinc-900 border border-zinc-800 rounded-lg w-full sm:w-fit"
          >
            {MODES.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                role="tab"
                aria-selected={mode === key}
                onClick={() => {
                  setMode(key);
                  setFormErr("");
                  setIdemKey(crypto.randomUUID());
                }}
                className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 h-9 rounded-md text-xs font-semibold whitespace-nowrap transition ${
                  mode === key
                    ? "bg-emerald-700 text-on-accent"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <Icon className="w-3.5 h-3.5" /> {label}
              </button>
            ))}
          </div>

          <p className="text-xs text-zinc-500">
            {mode === "issue"
              ? `Xuất từ kho ra công trường: tồn kho giảm, đã dùng tăng (còn ${stock}${unit} trong kho).`
              : mode === "return"
                ? `Hoàn vật tư dư từ công trường về kho: đã dùng giảm, tồn kho tăng (đã dùng ${used}${unit}).`
                : "Chỉnh trực tiếp số đã dùng (kiểm kê, nhập sai…) — không đổi tồn kho, bắt buộc ghi lý do."}
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <label className="space-y-1 col-span-1">
              <span className="text-xs text-zinc-400">Số lượng{unit}</span>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                className={INPUT}
              />
            </label>
            {mode === "issue" && (
              <>
                <label className="space-y-1">
                  <span className="text-xs text-zinc-400">Tầng</span>
                  <input
                    list="mat-floor-options"
                    value={floor}
                    onChange={(e) => setFloor(e.target.value)}
                    placeholder="vd: 24F"
                    className={INPUT}
                  />
                </label>
                <label className="space-y-1 col-span-2">
                  <span className="text-xs text-zinc-400">Tổ đội lĩnh</span>
                  <input
                    list="mat-crew-options"
                    value={crew}
                    onChange={(e) => setCrew(e.target.value)}
                    placeholder="vd: Tổ cơ điện 1"
                    className={INPUT}
                  />
                </label>
                <datalist id="mat-floor-options">
                  {meta.floors.map((f) => (
                    <option key={f} value={f} />
                  ))}
                </datalist>
                <datalist id="mat-crew-options">
                  {meta.crews.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </>
            )}
            <label
              className={`space-y-1 ${mode === "issue" ? "col-span-2 sm:col-span-4" : "col-span-1 sm:col-span-3"}`}
            >
              <span className="text-xs text-zinc-400">
                Ghi chú{mode === "adjust" ? " (lý do)" : ""}
              </span>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={
                  mode === "issue"
                    ? "vd: block A"
                    : mode === "return"
                      ? "vd: dư sau lắp đặt"
                      : "vd: kiểm kê cuối tháng"
                }
                className={INPUT}
              />
            </label>
          </div>

          {formErr && (
            <p role="alert" className="text-sm text-rose-400">
              {formErr}
            </p>
          )}

          <div className="flex gap-2">
            {mode === "adjust" ? (
              <>
                <button
                  disabled={busy || !note.trim()}
                  onClick={() => void submit(1)}
                  className="flex-1 sm:flex-none px-4 h-10 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-on-accent text-sm font-semibold disabled:opacity-50"
                >
                  + Tăng đã dùng
                </button>
                <button
                  disabled={busy || !note.trim()}
                  onClick={() => void submit(-1)}
                  className="flex-1 sm:flex-none px-4 h-10 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-sm font-semibold disabled:opacity-50"
                >
                  − Giảm đã dùng
                </button>
              </>
            ) : (
              <button
                disabled={busy}
                onClick={() => void submit()}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 h-10 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-on-accent text-sm font-semibold disabled:opacity-50"
              >
                {mode === "issue" ? (
                  <ArrowDownToLine className="w-4 h-4" />
                ) : (
                  <ArrowUpFromLine className="w-4 h-4" />
                )}
                {busy ? "Đang lưu…" : mode === "issue" ? "Xuất kho" : "Hoàn kho"}
              </button>
            )}
          </div>
        </div>
      )}

      <div className="overflow-auto p-4 space-y-4">
        <CustomFieldsSection
          entityType="material"
          apiPath={`/api/materials/${material.id}`}
          value={material.custom}
          canEdit={canEdit}
        />
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-2">
            Lịch sử giao dịch
          </h4>
          {loi && <p className="text-sm text-rose-400">{loi}</p>}
          {items === null && !loi && <p className="text-sm text-zinc-500">Đang tải…</p>}
          {items?.length === 0 && <p className="text-sm text-zinc-500">Chưa có giao dịch nào.</p>}
          {!!items?.length && (
            <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Lịch sử">
              <table className="w-full text-xs min-w-[560px]">
                <thead>
                  <tr className="text-zinc-400 border-b border-zinc-800 text-left">
                    <th className="py-1.5 pr-2 font-medium">Thời điểm</th>
                    <th className="py-1.5 pr-2 font-medium">Loại</th>
                    <th className="py-1.5 pr-2 font-medium">Người ghi</th>
                    <th className="py-1.5 pr-2 font-medium text-right">±</th>
                    <th className="py-1.5 pr-2 font-medium">Tầng / tổ đội</th>
                    <th className="py-1.5 font-medium">Ghi chú</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((t) => (
                    <tr key={t.id} className="border-b border-zinc-800/50">
                      <td className="py-1.5 pr-2 text-zinc-400 whitespace-nowrap">
                        {formatDateTimeVN(t.createdAt)}
                      </td>
                      <td className="py-1.5 pr-2 text-zinc-300 whitespace-nowrap">
                        {TX_TYPE_LABEL[t.type] ?? "Điều chỉnh"}
                      </td>
                      <td className="py-1.5 pr-2 text-zinc-300">{t.userName ?? "—"}</td>
                      <td
                        className={`py-1.5 pr-2 text-right font-mono font-semibold ${t.delta >= 0 ? "text-emerald-400" : "text-amber-400"}`}
                      >
                        {t.delta >= 0 ? `+${t.delta}` : t.delta}
                      </td>
                      <td className="py-1.5 pr-2 text-zinc-400">
                        {[t.floorLabel, t.crew].filter(Boolean).join(" · ") || "—"}
                      </td>
                      <td className="py-1.5 text-zinc-400">{t.note ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
