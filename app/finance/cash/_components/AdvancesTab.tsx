"use client";
// Tab "Tạm ứng" — danh sách tạm ứng của dự án đang chọn, thêm/sửa/xoá và hoàn ứng từng phần.
// API: GET/POST /api/advances, PATCH (sửa | action=settle) / DELETE /api/advances/:id (M27 PR1).
// "Còn phải hoàn" do API tính trong SQL (amount − settled_amount) — không trừ tiền trên float JS.
// Xoá chỉ được khi chưa hoàn ứng đồng nào (API trả 409) — UI ẩn nút xoá ở các dòng đó.
import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  CircleDashed,
  HandCoins,
  Pencil,
  Plus,
  Timer,
  Trash2,
  Undo2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/app/components/ui";
import EmptyState from "@/app/components/EmptyState";
import { ErrorState } from "@/app/components/ErrorState";
import { Skeleton } from "@/app/components/Skeleton";
import { appConfirm } from "@/app/components/dialogs";
import { showToast } from "@/app/components/Toast";
import { taiJson, taiJsonMoi } from "@/app/lib/taiDuLieu";
import { formatDateVN, todayISO } from "@/lib/nen/date";
import { formatVnd } from "@/lib/nen/money";
import { Field, FormModal, INPUT, guiJson } from "./shared";

type Status = "open" | "partially_settled" | "settled";

type Advance = {
  id: number;
  code: string | null;
  advanceDate: string | null;
  amount: number;
  recipient: string | null;
  reason: string | null;
  proposalId: number | null;
  settledAmount: number;
  remaining: number;
  status: Status;
};

type ProposalOption = { id: number; label: string };

// Màu kèm icon + nhãn (không truyền trạng thái chỉ bằng màu).
const STATUS: Record<Status, { label: string; icon: LucideIcon; cls: string }> = {
  open: { label: "Chưa hoàn", icon: CircleDashed, cls: "text-amber-400" },
  partially_settled: { label: "Hoàn một phần", icon: Timer, cls: "text-sky-400" },
  settled: { label: "Đã hoàn", icon: CheckCircle2, cls: "text-emerald-400" },
};

const STATUS_FILTERS: { key: "" | Status; label: string }[] = [
  { key: "", label: "Tất cả" },
  { key: "open", label: "Chưa hoàn" },
  { key: "partially_settled", label: "Hoàn một phần" },
  { key: "settled", label: "Đã hoàn" },
];

export default function AdvancesTab({ canManage }: { canManage: boolean }) {
  const [status, setStatus] = useState<"" | Status>("");
  const [rows, setRows] = useState<Advance[] | null>(null);
  const [loi, setLoi] = useState<string | null>(null);
  const [editing, setEditing] = useState<Advance | "new" | null>(null);
  const [settling, setSettling] = useState<Advance | null>(null);
  const [proposals, setProposals] = useState<ProposalOption[]>([]);

  // Sổ tiền luôn tải tươi (taiJsonMoi): sw.js áp stale-while-revalidate cho mọi GET /api/*,
  // mở lại trang sẽ hiện bản cache cũ (vd danh sách rỗng lúc mới vào) — không chấp nhận được
  // với số liệu thu chi/tạm ứng. Đánh đổi: không xem được sổ khi mất mạng.
  const load = useCallback(async () => {
    const url = `/api/advances${status ? `?status=${status}` : ""}`;
    const kq = await taiJsonMoi<{ advances?: Advance[] }>(url);
    if (!kq.ok) {
      setLoi(kq.loi);
      return;
    }
    setLoi(null);
    setRows(kq.data.advances ?? []);
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!canManage) return;
    void taiJson<{ proposals?: { id: number; code: string; title: string }[] }>(
      "/api/proposals?kind=advance",
    ).then(
      (kq) =>
        kq.ok &&
        setProposals(
          (kq.data.proposals ?? []).map((p) => ({ id: p.id, label: `${p.code} — ${p.title}` })),
        ),
    );
  }, [canManage]);

  async function remove(a: Advance) {
    const ok = await appConfirm(
      `Xoá tạm ứng ${a.code ?? `#${a.id}`} (${formatVnd(a.amount)} cho ${a.recipient ?? "—"})?`,
      { danger: true, confirmLabel: "Xoá tạm ứng" },
    );
    if (!ok) return;
    const err = await guiJson(`/api/advances/${a.id}`, "DELETE");
    if (err) {
      showToast(err, "error");
      return;
    }
    showToast("Đã xoá tạm ứng");
    void load();
  }

  const done = () => {
    setEditing(null);
    setSettling(null);
    void load();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          className="flex flex-wrap gap-1 p-1 bg-zinc-900 border border-zinc-800 rounded-lg"
          role="group"
          aria-label="Lọc theo trạng thái"
        >
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key || "all"}
              onClick={() => setStatus(f.key)}
              aria-pressed={status === f.key}
              className={`px-3 h-9 rounded-md text-xs font-semibold transition ${
                status === f.key
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
            Thêm tạm ứng
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
          icon={HandCoins}
          title="Chưa có tạm ứng"
          message={
            canManage ? "Bấm “Thêm tạm ứng” để ghi khoản tạm ứng đầu tiên." : "Chưa có dữ liệu."
          }
        />
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div
            className="relative overflow-x-auto"
            tabIndex={0}
            role="region"
            aria-label="Danh sách tạm ứng"
          >
            <table className="w-full text-sm min-w-[760px]">
              <thead>
                <tr className="text-xs text-zinc-400 border-b border-zinc-800 text-left">
                  <th className="p-3 font-medium">Mã / ngày</th>
                  <th className="p-3 font-medium">Người nhận / lý do</th>
                  <th className="p-3 font-medium text-right">Tạm ứng</th>
                  <th className="p-3 font-medium text-right">Đã hoàn</th>
                  <th className="p-3 font-medium text-right">Còn phải hoàn</th>
                  <th className="p-3 font-medium">Trạng thái</th>
                  {canManage && (
                    <th className="p-3 w-32">
                      <span className="sr-only">Thao tác</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => {
                  const st = STATUS[a.status];
                  return (
                    <tr key={a.id} className="border-b border-zinc-800/60 last:border-0">
                      <td className="p-3 whitespace-nowrap">
                        <p className="font-mono text-xs text-zinc-200">{a.code ?? `#${a.id}`}</p>
                        <p className="text-xs text-zinc-500">
                          {a.advanceDate ? formatDateVN(a.advanceDate) : "—"}
                        </p>
                      </td>
                      <td className="p-3">
                        <p className="text-zinc-200">{a.recipient ?? "—"}</p>
                        {a.reason && (
                          <p
                            className="text-xs text-zinc-500 truncate max-w-[260px]"
                            title={a.reason}
                          >
                            {a.reason}
                          </p>
                        )}
                      </td>
                      <td className="p-3 text-right font-mono whitespace-nowrap">
                        {formatVnd(a.amount)}
                      </td>
                      <td className="p-3 text-right font-mono whitespace-nowrap text-zinc-400">
                        {formatVnd(a.settledAmount)}
                      </td>
                      <td className="p-3 text-right font-mono font-semibold whitespace-nowrap">
                        {formatVnd(a.remaining)}
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 text-xs font-semibold ${st.cls}`}
                        >
                          <st.icon className="w-3.5 h-3.5" /> {st.label}
                        </span>
                      </td>
                      {canManage && (
                        <td className="p-1.5">
                          <div className="flex">
                            {a.status !== "settled" && (
                              <Button
                                variant="ghost"
                                size="icon"
                                icon={Undo2}
                                aria-label={`Hoàn ứng ${a.code ?? `#${a.id}`}`}
                                title="Hoàn ứng"
                                className="hover:text-emerald-400"
                                onClick={() => setSettling(a)}
                              />
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              icon={Pencil}
                              aria-label={`Sửa tạm ứng ${a.code ?? `#${a.id}`}`}
                              title="Sửa"
                              onClick={() => setEditing(a)}
                            />
                            {a.status === "open" && (
                              <Button
                                variant="ghost"
                                size="icon"
                                icon={Trash2}
                                aria-label={`Xoá tạm ứng ${a.code ?? `#${a.id}`}`}
                                title="Xoá (chỉ khi chưa hoàn ứng)"
                                className="hover:text-rose-400"
                                onClick={() => void remove(a)}
                              />
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {editing && (
        <AdvanceModal
          item={editing === "new" ? null : editing}
          proposals={proposals}
          onClose={() => setEditing(null)}
          onSaved={done}
        />
      )}
      {settling && <SettleModal item={settling} onClose={() => setSettling(null)} onSaved={done} />}
    </div>
  );
}

function AdvanceModal({
  item,
  proposals,
  onClose,
  onSaved,
}: {
  item: Advance | null;
  proposals: ProposalOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [code, setCode] = useState(item?.code ?? "");
  const [advanceDate, setAdvanceDate] = useState(item?.advanceDate ?? todayISO());
  const [amount, setAmount] = useState(item ? String(item.amount) : "");
  const [recipient, setRecipient] = useState(item?.recipient ?? "");
  const [reason, setReason] = useState(item?.reason ?? "");
  const [proposalId, setProposalId] = useState(item?.proposalId ? String(item.proposalId) : "");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) {
      setErr("Số tiền tạm ứng phải lớn hơn 0");
      return;
    }
    if (!recipient.trim()) {
      setErr("Nhập người nhận tạm ứng");
      return;
    }
    setSaving(true);
    setErr("");
    const e = await guiJson(
      item ? `/api/advances/${item.id}` : "/api/advances",
      item ? "PATCH" : "POST",
      {
        code: code.trim() || null,
        advanceDate: advanceDate || null,
        amount: n,
        recipient: recipient.trim(),
        reason: reason.trim() || null,
        proposalId: proposalId ? Number(proposalId) : null,
      },
    );
    setSaving(false);
    if (e) {
      setErr(e);
      return;
    }
    showToast(item ? "Đã cập nhật tạm ứng" : "Đã thêm tạm ứng");
    onSaved();
  }

  return (
    <FormModal
      title={item ? "Sửa tạm ứng" : "Thêm tạm ứng"}
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
      <div className="grid grid-cols-2 gap-3">
        <Field label="Mã tạm ứng">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="vd: TU-0005"
            className={INPUT}
          />
        </Field>
        <Field label="Ngày tạm ứng">
          <input
            type="date"
            value={advanceDate}
            onChange={(e) => setAdvanceDate(e.target.value)}
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
        <Field label="Người nhận *">
          <input
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            className={INPUT}
          />
        </Field>
      </div>
      {item && item.settledAmount > 0 && (
        <p className="text-xs text-zinc-400">
          Đã hoàn {formatVnd(item.settledAmount)} — số tiền mới không được nhỏ hơn mức này.
        </p>
      )}
      <Field label="Lý do">
        <input value={reason} onChange={(e) => setReason(e.target.value)} className={INPUT} />
      </Field>
      <Field label="Đề xuất tạm ứng liên quan">
        <select
          value={proposalId}
          onChange={(e) => setProposalId(e.target.value)}
          className={INPUT}
        >
          <option value="">— Không —</option>
          {proposals.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </Field>
    </FormModal>
  );
}

function SettleModal({
  item,
  onClose,
  onSaved,
}: {
  item: Advance;
  onClose: () => void;
  onSaved: () => void;
}) {
  // Mặc định hoàn hết phần còn lại — trường hợp phổ biến nhất khi quyết toán tạm ứng.
  const [amount, setAmount] = useState(String(item.remaining));
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) {
      setErr("Số tiền hoàn ứng phải lớn hơn 0");
      return;
    }
    setSaving(true);
    setErr("");
    const e = await guiJson(`/api/advances/${item.id}`, "PATCH", {
      action: "settle",
      settleAmount: n,
    });
    setSaving(false);
    if (e) {
      setErr(e);
      return;
    }
    showToast("Đã ghi hoàn ứng");
    onSaved();
  }

  return (
    <FormModal
      title={`Hoàn ứng — ${item.code ?? `#${item.id}`}`}
      onClose={onClose}
      error={err}
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>
            Huỷ
          </Button>
          <Button variant="primary" icon={Undo2} onClick={() => void submit()} disabled={saving}>
            {saving ? "Đang lưu…" : "Ghi hoàn ứng"}
          </Button>
        </>
      }
    >
      <dl className="grid grid-cols-3 gap-2 text-center">
        {(
          [
            ["Tạm ứng", item.amount],
            ["Đã hoàn", item.settledAmount],
            ["Còn phải hoàn", item.remaining],
          ] as const
        ).map(([label, v]) => (
          <div key={label} className="bg-zinc-950/70 border border-zinc-800 rounded-lg p-2">
            <dt className="text-[11px] text-zinc-400">{label}</dt>
            <dd className="font-mono text-sm font-semibold">{formatVnd(v)}</dd>
          </div>
        ))}
      </dl>
      <Field label="Số tiền hoàn lần này (đ)">
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
      <p className="text-xs text-zinc-500">
        Hoàn đủ số còn lại thì tạm ứng chuyển sang “Đã hoàn”; hoàn một phần thì chuyển “Hoàn một
        phần”.
      </p>
    </FormModal>
  );
}
