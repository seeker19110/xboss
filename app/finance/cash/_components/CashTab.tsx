"use client";
// Tab "Sổ thu chi" — danh sách phiếu thu/chi quỹ của dự án đang chọn, thêm/sửa/xoá.
// API: GET/POST /api/cash-transactions, PATCH/DELETE /api/cash-transactions/:id (M27 PR1).
// Tổng thu/chi do API tính trong SQL (không cộng tiền trên float JS — quy ước M45).
import { useCallback, useEffect, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Pencil, Plus, Trash2, Wallet } from "lucide-react";
import { Button, StatCard } from "@/app/components/ui";
import EmptyState from "@/app/components/EmptyState";
import { ErrorState } from "@/app/components/ErrorState";
import { Skeleton } from "@/app/components/Skeleton";
import { appConfirm } from "@/app/components/dialogs";
import { showToast } from "@/app/components/Toast";
import { taiJson, taiJsonMoi } from "@/app/lib/taiDuLieu";
import { formatDateVN, todayISO } from "@/lib/nen/date";
import { formatVnd } from "@/lib/nen/money";
import { Field, FormModal, INPUT, guiJson } from "./shared";

type Direction = "in" | "out";

type CashTx = {
  id: number;
  txDate: string;
  direction: Direction;
  category: string | null;
  amount: number;
  isPettyCash: boolean;
  contractId: number | null;
  supplierId: number | null;
  voucherCode: string | null;
  description: string | null;
  recordedByName: string | null;
};

type Totals = { in: number; out: number; net: number };
type Option = { id: number; label: string };

// Gợi ý danh mục (cột category là text tự do — datalist chỉ gợi ý, không ràng buộc).
const CATEGORY_HINTS = [
  "Thu từ chủ đầu tư",
  "Vật tư",
  "Nhân công",
  "Lương",
  "Thiết bị",
  "Tạm ứng",
  "Quỹ tiền mặt",
  "Chi phí chung",
];

const DIR_FILTERS: { key: "" | Direction; label: string }[] = [
  { key: "", label: "Tất cả" },
  { key: "in", label: "Thu" },
  { key: "out", label: "Chi" },
];

export default function CashTab({ canManage }: { canManage: boolean }) {
  const [dir, setDir] = useState<"" | Direction>("");
  const [rows, setRows] = useState<CashTx[] | null>(null);
  const [totals, setTotals] = useState<Totals>({ in: 0, out: 0, net: 0 });
  const [loi, setLoi] = useState<string | null>(null);
  const [editing, setEditing] = useState<CashTx | "new" | null>(null);
  const [contracts, setContracts] = useState<Option[]>([]);
  const [suppliers, setSuppliers] = useState<Option[]>([]);

  // Sổ tiền luôn tải tươi (taiJsonMoi): sw.js áp stale-while-revalidate cho mọi GET /api/*,
  // mở lại trang sẽ hiện bản cache cũ (vd danh sách rỗng lúc mới vào) — không chấp nhận được
  // với số liệu thu chi/tạm ứng. Đánh đổi: không xem được sổ khi mất mạng.
  const load = useCallback(async () => {
    const url = `/api/cash-transactions${dir ? `?direction=${dir}` : ""}`;
    const kq = await taiJsonMoi<{
      transactions?: CashTx[];
      totals?: Totals;
    }>(url);
    if (!kq.ok) {
      setLoi(kq.loi);
      return;
    }
    setLoi(null);
    setRows(kq.data.transactions ?? []);
    setTotals(kq.data.totals ?? { in: 0, out: 0, net: 0 });
  }, [dir]);

  useEffect(() => {
    void load();
  }, [load]);

  // Danh mục hợp đồng/NCC cho ô chọn liên kết — chỉ cần khi có quyền ghi.
  useEffect(() => {
    if (!canManage) return;
    void taiJson<{ contracts?: { id: number; code: string; title: string }[] }>(
      "/api/contracts",
    ).then(
      (kq) =>
        kq.ok &&
        setContracts(
          (kq.data.contracts ?? []).map((c) => ({ id: c.id, label: `${c.code} — ${c.title}` })),
        ),
    );
    void taiJson<{ suppliers?: { id: number; name: string }[] }>("/api/suppliers").then(
      (kq) =>
        kq.ok && setSuppliers((kq.data.suppliers ?? []).map((s) => ({ id: s.id, label: s.name }))),
    );
  }, [canManage]);

  async function remove(t: CashTx) {
    const ok = await appConfirm(
      `Xoá phiếu ${t.direction === "in" ? "thu" : "chi"} ${formatVnd(t.amount)} ngày ${formatDateVN(t.txDate)}?`,
      { danger: true, confirmLabel: "Xoá phiếu" },
    );
    if (!ok) return;
    const err = await guiJson(`/api/cash-transactions/${t.id}`, "DELETE");
    if (err) {
      showToast(err, "error");
      return;
    }
    showToast("Đã xoá phiếu");
    void load();
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard
          label="Tổng thu"
          value={formatVnd(totals.in)}
          tone="success"
          icon={ArrowDownLeft}
        />
        <StatCard
          label="Tổng chi"
          value={formatVnd(totals.out)}
          tone="warning"
          icon={ArrowUpRight}
        />
        <StatCard
          label="Chênh lệch thu − chi"
          value={formatVnd(totals.net)}
          tone={totals.net < 0 ? "danger" : "info"}
          icon={Wallet}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          className="flex gap-1 p-1 bg-zinc-900 border border-zinc-800 rounded-lg"
          role="group"
          aria-label="Lọc theo chiều"
        >
          {DIR_FILTERS.map((f) => (
            <button
              key={f.key || "all"}
              onClick={() => setDir(f.key)}
              aria-pressed={dir === f.key}
              className={`px-3 h-9 rounded-md text-xs font-semibold transition ${
                dir === f.key
                  ? "bg-emerald-700 text-on-accent"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        {canManage && (
          <Button variant="primary" icon={Plus} onClick={() => setEditing("new")}>
            Thêm phiếu
          </Button>
        )}
      </div>

      {loi ? (
        <ErrorState message={loi} onRetry={() => void load()} />
      ) : rows === null ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="Chưa có phiếu thu chi"
          message={
            canManage ? "Bấm “Thêm phiếu” để ghi khoản thu/chi đầu tiên." : "Chưa có dữ liệu."
          }
        />
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div
            className="relative overflow-x-auto"
            tabIndex={0}
            role="region"
            aria-label="Sổ thu chi"
          >
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="text-xs text-zinc-400 border-b border-zinc-800 text-left">
                  <th className="p-3 font-medium">Ngày</th>
                  <th className="p-3 font-medium">Loại</th>
                  <th className="p-3 font-medium">Số phiếu</th>
                  <th className="p-3 font-medium">Danh mục / diễn giải</th>
                  <th className="p-3 font-medium text-right">Số tiền</th>
                  <th className="p-3 font-medium">Người ghi</th>
                  {canManage && (
                    <th className="p-3 w-24">
                      <span className="sr-only">Thao tác</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => (
                  <tr key={t.id} className="border-b border-zinc-800/60 last:border-0">
                    <td className="p-3 text-xs text-zinc-400 whitespace-nowrap">
                      {formatDateVN(t.txDate)}
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1 text-xs font-semibold ${
                          t.direction === "in" ? "text-emerald-400" : "text-amber-400"
                        }`}
                      >
                        {t.direction === "in" ? (
                          <ArrowDownLeft className="w-3.5 h-3.5" />
                        ) : (
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        )}
                        {t.direction === "in" ? "Thu" : "Chi"}
                      </span>
                      {t.isPettyCash && (
                        <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">
                          Quỹ TM
                        </span>
                      )}
                    </td>
                    <td className="p-3 font-mono text-xs text-zinc-300">{t.voucherCode ?? "—"}</td>
                    <td className="p-3">
                      <p className="text-zinc-200">{t.category ?? "—"}</p>
                      {t.description && (
                        <p
                          className="text-xs text-zinc-500 truncate max-w-[280px]"
                          title={t.description}
                        >
                          {t.description}
                        </p>
                      )}
                    </td>
                    <td
                      className={`p-3 text-right font-mono font-semibold whitespace-nowrap ${
                        t.direction === "in" ? "text-emerald-400" : "text-amber-400"
                      }`}
                    >
                      {t.direction === "in" ? "+" : "−"}
                      {formatVnd(t.amount)}
                    </td>
                    <td className="p-3 text-xs text-zinc-400">{t.recordedByName ?? "—"}</td>
                    {canManage && (
                      <td className="p-1.5">
                        <div className="flex">
                          <Button
                            variant="ghost"
                            size="icon"
                            icon={Pencil}
                            aria-label={`Sửa phiếu ngày ${formatDateVN(t.txDate)}`}
                            onClick={() => setEditing(t)}
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            icon={Trash2}
                            aria-label={`Xoá phiếu ngày ${formatDateVN(t.txDate)}`}
                            className="hover:text-rose-400"
                            onClick={() => void remove(t)}
                          />
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {editing && (
        <CashModal
          item={editing === "new" ? null : editing}
          contracts={contracts}
          suppliers={suppliers}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      )}
    </div>
  );
}

function CashModal({
  item,
  contracts,
  suppliers,
  onClose,
  onSaved,
}: {
  item: CashTx | null;
  contracts: Option[];
  suppliers: Option[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [txDate, setTxDate] = useState(item?.txDate ?? todayISO());
  const [direction, setDirection] = useState<Direction>(item?.direction ?? "out");
  const [amount, setAmount] = useState(item ? String(item.amount) : "");
  const [category, setCategory] = useState(item?.category ?? "");
  const [voucherCode, setVoucherCode] = useState(item?.voucherCode ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [isPettyCash, setIsPettyCash] = useState(item?.isPettyCash ?? false);
  const [contractId, setContractId] = useState(item?.contractId ? String(item.contractId) : "");
  const [supplierId, setSupplierId] = useState(item?.supplierId ? String(item.supplierId) : "");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) {
      setErr("Số tiền phải lớn hơn 0");
      return;
    }
    setSaving(true);
    setErr("");
    const e = await guiJson(
      item ? `/api/cash-transactions/${item.id}` : "/api/cash-transactions",
      item ? "PATCH" : "POST",
      {
        txDate,
        direction,
        amount: n,
        category: category.trim() || null,
        voucherCode: voucherCode.trim() || null,
        description: description.trim() || null,
        isPettyCash,
        contractId: contractId ? Number(contractId) : null,
        supplierId: supplierId ? Number(supplierId) : null,
      },
    );
    setSaving(false);
    if (e) {
      setErr(e);
      return;
    }
    showToast(item ? "Đã cập nhật phiếu" : "Đã thêm phiếu");
    onSaved();
  }

  return (
    <FormModal
      title={item ? "Sửa phiếu thu chi" : "Thêm phiếu thu chi"}
      onClose={onClose}
      error={err}
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>
            Huỷ
          </Button>
          <Button variant="primary" onClick={() => void submit()} disabled={saving}>
            {saving ? "Đang lưu…" : "Lưu"}
          </Button>
        </>
      }
    >
      <div
        className="flex gap-1 p-1 bg-zinc-900 border border-zinc-800 rounded-lg w-full"
        role="radiogroup"
        aria-label="Loại phiếu"
      >
        {(["in", "out"] as const).map((d) => (
          <button
            key={d}
            role="radio"
            aria-checked={direction === d}
            onClick={() => setDirection(d)}
            className={`flex-1 flex items-center justify-center gap-1.5 h-9 rounded-md text-sm font-semibold transition ${
              direction === d
                ? "bg-emerald-700 text-on-accent"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {d === "in" ? (
              <ArrowDownLeft className="w-4 h-4" />
            ) : (
              <ArrowUpRight className="w-4 h-4" />
            )}
            {d === "in" ? "Phiếu thu" : "Phiếu chi"}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Ngày *">
          <input
            type="date"
            value={txDate}
            onChange={(e) => setTxDate(e.target.value)}
            className={INPUT}
          />
        </Field>
        <Field label="Số tiền (đ) *">
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={INPUT}
          />
        </Field>
        <Field label="Số phiếu">
          <input
            value={voucherCode}
            onChange={(e) => setVoucherCode(e.target.value)}
            placeholder="vd: PC-0012"
            className={INPUT}
          />
        </Field>
        <Field label="Danh mục">
          <input
            list="cash-category-hints"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className={INPUT}
          />
          <datalist id="cash-category-hints">
            {CATEGORY_HINTS.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field label="Hợp đồng liên quan">
          <select
            value={contractId}
            onChange={(e) => setContractId(e.target.value)}
            className={INPUT}
          >
            <option value="">— Không —</option>
            {contracts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Nhà cung cấp">
          <select
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            className={INPUT}
          >
            <option value="">— Không —</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Diễn giải">
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className={INPUT}
        />
      </Field>
      <label className="flex items-center gap-2 h-10 text-sm text-zinc-300 cursor-pointer">
        <input
          type="checkbox"
          checked={isPettyCash}
          onChange={(e) => setIsPettyCash(e.target.checked)}
          className="w-4 h-4 accent-emerald-600"
        />
        Chi/thu từ quỹ tiền mặt công trường
      </label>
    </FormModal>
  );
}
