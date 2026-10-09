"use client";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  Check,
  FilePen,
  Pencil,
  Plus,
  Send,
  Trash2,
  TriangleAlert,
  Undo2,
  X,
  XCircle,
} from "lucide-react";
import { Modal, appConfirm, appPrompt } from "@/app/components/dialogs";
import { showToast } from "@/app/components/Toast";
import { Skeleton } from "@/app/components/Skeleton";
import { Button, Card, Chip, Section } from "@/app/components/ui";
import type { ChipTone } from "@/app/components/ui/Chip";
import { HEADER_DINH_DANG_TIEN, fmtVNDExact, taoIdempotencyKey } from "./chiTietDot";

// M128 PR-UI: khối "Chứng từ điều chỉnh" của đợt IPC đã duyệt. Đợt đã duyệt không sửa/xoá được —
// chỉ điều chỉnh một phần (adjustment) hoặc huỷ hiệu lực toàn đợt (reversal) qua chứng từ riêng,
// qua đủ nháp → trình → duyệt (SoD: người duyệt ≠ người lập). Server là ranh giới: luôn hiện
// `error` tiếng Việt do server trả, không kẹt "Đang lưu…".

export type AdjustmentKind = "adjustment" | "reversal";
export type AdjustmentStatus = "draft" | "submitted" | "approved" | "rejected";

export type AdjustmentItem = {
  id: number;
  boqItemId: number;
  boqCode: string;
  boqName: string;
  unit: string;
  qtyDelta: string;
  unitPrice: unknown;
  note: string | null;
};

export type Adjustment = {
  id: number;
  code: string;
  certId: number;
  kind: AdjustmentKind;
  status: AdjustmentStatus;
  reason: string;
  /** Tiền ± (chuỗi decimal-string-v1; số cũ vẫn được chấp nhận). */
  amount: string | number | null;
  createdBy: number | null;
  createdByName: string | null;
  submittedAt: string | null;
  decidedAt: string | null;
  decidedByName: string | null;
  rejectReason: string | null;
  items: AdjustmentItem[];
};

export type TomTatDieuChinh = {
  open: number;
  approvedCount: number;
  reversed: boolean;
  netAmount?: string | number | null;
};

export type DongBoqDot = { boqItemId: number; boqCode: string; boqName: string; boqUnit: string };

const KIND_LABEL: Record<AdjustmentKind, string> = {
  adjustment: "Điều chỉnh",
  reversal: "Huỷ hiệu lực",
};
const STATUS_LABEL: Record<AdjustmentStatus, string> = {
  draft: "Nháp",
  submitted: "Đã trình",
  approved: "Đã duyệt",
  rejected: "Từ chối",
};
const STATUS_TONE: Record<AdjustmentStatus, ChipTone> = {
  draft: "neutral",
  submitted: "warning",
  approved: "success",
  rejected: "danger",
};

const LY_DO_TOI_THIEU = 10;
const campCss =
  "w-full min-h-10 rounded-lg border border-zinc-700 bg-zinc-950/70 px-3 py-2 text-base text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/60";

/** Tiền có dấu: dương "+", âm "−" (chuỗi thập phân exact, không qua float). */
function fmtTienDau(v: string | number | null | undefined): string {
  if (v == null) return "—";
  const s = String(v);
  if (!/^-?\d+(\.\d+)?$/.test(s)) return "—";
  const am = s.startsWith("-");
  const t = fmtVNDExact(am ? s.slice(1) : s);
  if (t === "—") return t;
  return `${am ? "−" : "+"}${t}`;
}

async function docLoi(res: Response, macDinh: string): Promise<string> {
  const j = (await res.json().catch(() => null)) as { error?: unknown } | null;
  return typeof j?.error === "string" ? j.error : `${macDinh} (mã ${res.status})`;
}

const LOI_MANG =
  "Mất kết nối — chưa rõ đã ghi nhận hay chưa. Có mạng lại thì tải lại đợt để kiểm tra";

// ── Form lập/sửa chứng từ ─────────────────────────────────────────────────────────────────
function FormDieuChinh({
  certId,
  maDot,
  kind,
  dongBoq,
  giaTriDuyet,
  suaAdj,
  onDong,
  onXong,
}: {
  certId: number;
  maDot: string;
  kind: AdjustmentKind;
  dongBoq: DongBoqDot[];
  giaTriDuyet: string | null;
  /** Có → sửa nháp (PATCH); không → tạo mới (POST). */
  suaAdj?: Adjustment;
  onDong: () => void;
  onXong: () => void | Promise<void>;
}) {
  const [lyDo, setLyDo] = useState(suaAdj?.reason ?? "");
  const [delta, setDelta] = useState<Record<number, string>>(() =>
    Object.fromEntries((suaAdj?.items ?? []).map((i) => [i.boqItemId, i.qtyDelta])),
  );
  const [ghiChu, setGhiChu] = useState<Record<number, string>>(() =>
    Object.fromEntries((suaAdj?.items ?? []).map((i) => [i.boqItemId, i.note ?? ""])),
  );
  const [busy, setBusy] = useState(false);
  const [loi, setLoi] = useState<string | null>(null);
  const idLyDo = useId();
  const idLoi = useId();
  const laReversal = kind === "reversal";
  const lyDoDu = lyDo.trim().length >= LY_DO_TOI_THIEU;

  const dongCoDelta = dongBoq.filter((d) => {
    const t = (delta[d.boqItemId] ?? "").trim();
    return t !== "" && Number(t) !== 0;
  });
  const soHopLe = dongCoDelta.every((d) =>
    /^-?\d+(\.\d+)?$/.test((delta[d.boqItemId] ?? "").trim()),
  );
  const duDieuKien = lyDoDu && (laReversal || (dongCoDelta.length > 0 && soHopLe));

  async function gui() {
    if (!lyDoDu) {
      setLoi(`Lý do bắt buộc, tối thiểu ${LY_DO_TOI_THIEU} ký tự`);
      return;
    }
    if (!laReversal && !duDieuKien) {
      setLoi(
        soHopLe
          ? "Nhập khối lượng điều chỉnh (± khác 0) cho ít nhất một dòng"
          : "Khối lượng điều chỉnh phải là số (cho phép âm, dấu chấm thập phân)",
      );
      return;
    }
    setBusy(true);
    setLoi(null);
    const body: Record<string, unknown> = { reason: lyDo.trim() };
    if (!suaAdj) body.kind = kind;
    if (!laReversal) {
      body.items = dongCoDelta.map((d) => ({
        boqItemId: d.boqItemId,
        qtyDelta: (delta[d.boqItemId] ?? "").trim(),
        ...((ghiChu[d.boqItemId] ?? "").trim() ? { note: ghiChu[d.boqItemId].trim() } : {}),
      }));
    }
    try {
      const res = await fetch(
        suaAdj ? `/api/adjustments/${suaAdj.id}` : `/api/payment-certs/${certId}/adjustments`,
        {
          method: suaAdj ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) {
        setLoi(await docLoi(res, "Lưu chứng từ điều chỉnh thất bại"));
        return;
      }
      await onXong();
      onDong();
    } catch {
      setLoi(LOI_MANG);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal onClose={busy ? () => undefined : onDong} className="max-w-2xl">
      <div className="p-4 border-b border-zinc-800 flex items-start gap-3">
        {laReversal ? (
          <Undo2 className="w-5 h-5 text-rose-300 shrink-0 mt-0.5" aria-hidden="true" />
        ) : (
          <FilePen className="w-5 h-5 text-emerald-300 shrink-0 mt-0.5" aria-hidden="true" />
        )}
        <h2 className="flex-1 min-w-0 font-semibold text-sm text-zinc-100">
          {suaAdj ? `Sửa ${suaAdj.code}` : laReversal ? "Huỷ hiệu lực đợt" : "Điều chỉnh đợt"} —{" "}
          {maDot}
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
      <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto">
        {laReversal && (
          <p
            role="note"
            className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300"
          >
            <TriangleAlert className="w-4 h-4 shrink-0 mt-px" aria-hidden="true" />
            <span>
              Cảnh báo: huỷ toàn bộ hiệu lực đợt, giá trị −
              {giaTriDuyet ? fmtVNDExact(giaTriDuyet) : "toàn bộ giá trị đã duyệt"}. Chứng từ phải
              được người khác duyệt mới có hiệu lực.
            </span>
          </p>
        )}
        <div className="space-y-1">
          <label htmlFor={idLyDo} className="text-xs font-medium text-zinc-300">
            Lý do (bắt buộc, tối thiểu {LY_DO_TOI_THIEU} ký tự)
          </label>
          <textarea
            id={idLyDo}
            value={lyDo}
            rows={3}
            maxLength={2000}
            disabled={busy}
            aria-invalid={lyDo.length > 0 && !lyDoDu}
            aria-describedby={loi ? idLoi : undefined}
            onChange={(e) => setLyDo(e.target.value)}
            className={campCss}
          />
          <p className="text-xs text-zinc-400 tabular-nums">
            {lyDo.trim().length}/{LY_DO_TOI_THIEU} ký tự
          </p>
        </div>
        {!laReversal && (
          <div className="overflow-x-auto rounded-lg border border-zinc-800">
            <table className="w-full min-w-[28rem] text-xs">
              <caption className="sr-only">Khối lượng điều chỉnh theo dòng BOQ của đợt</caption>
              <thead className="bg-zinc-950/70 text-zinc-300">
                <tr>
                  <th scope="col" className="px-2 py-2 text-left font-semibold">
                    Dòng BOQ
                  </th>
                  <th scope="col" className="px-2 py-2 text-left font-semibold w-36">
                    KL điều chỉnh ±
                  </th>
                  <th scope="col" className="px-2 py-2 text-left font-semibold w-44">
                    Ghi chú
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {dongBoq.map((d) => (
                  <tr key={d.boqItemId}>
                    <td className="px-2 py-2 align-middle">
                      <span className="font-mono text-zinc-200">{d.boqCode}</span>
                      <span className="block text-zinc-400">
                        {d.boqName} ({d.boqUnit})
                      </span>
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        inputMode="decimal"
                        step="any"
                        value={delta[d.boqItemId] ?? ""}
                        disabled={busy}
                        aria-label={`KL điều chỉnh ± của ${d.boqCode}`}
                        onChange={(e) => setDelta((p) => ({ ...p, [d.boqItemId]: e.target.value }))}
                        className={`${campCss} text-right tabular-nums`}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        value={ghiChu[d.boqItemId] ?? ""}
                        maxLength={500}
                        disabled={busy}
                        aria-label={`Ghi chú của ${d.boqCode}`}
                        onChange={(e) =>
                          setGhiChu((p) => ({ ...p, [d.boqItemId]: e.target.value }))
                        }
                        className={campCss}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {loi && (
        <p
          id={idLoi}
          role="alert"
          className="mx-4 mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300"
        >
          {loi}
        </p>
      )}
      <div className="p-4 border-t border-zinc-800 flex flex-wrap justify-end gap-2">
        <Button variant="secondary" disabled={busy} onClick={onDong}>
          Huỷ
        </Button>
        <Button
          icon={laReversal ? Undo2 : Check}
          variant={laReversal ? "danger" : "primary"}
          disabled={busy || !lyDoDu}
          onClick={() => void gui()}
        >
          {busy ? "Đang lưu…" : suaAdj ? "Lưu thay đổi" : "Lưu nháp"}
        </Button>
      </div>
    </Modal>
  );
}

// ── Khối chính ───────────────────────────────────────────────────────────────────────────
export default function DieuChinhDot({
  certId,
  maDot,
  dongBoq,
  giaTriDuyet,
  tomTat,
  canManage,
  meId,
  onXong,
}: {
  certId: number;
  maDot: string;
  dongBoq: DongBoqDot[];
  /** approvedValue của đợt (chuỗi exact) — hiện trong cảnh báo reversal. */
  giaTriDuyet: string | null;
  tomTat: TomTatDieuChinh | null;
  canManage: boolean;
  meId: number | null;
  /** Nạp lại đợt (và qua đó tóm tắt) sau khi đổi dữ liệu. */
  onXong: () => void | Promise<void>;
}) {
  const [ds, setDs] = useState<Adjustment[]>([]);
  const [dangTai, setDangTai] = useState(true);
  const [loiTai, setLoiTai] = useState<string | null>(null);
  const [form, setForm] = useState<{ kind: AdjustmentKind; sua?: Adjustment } | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const keyDuyet = useRef<Record<number, string | null>>({});

  const tai = useCallback(async () => {
    try {
      const res = await fetch(`/api/payment-certs/${certId}/adjustments`, {
        headers: HEADER_DINH_DANG_TIEN,
      });
      if (!res.ok) {
        setLoiTai(await docLoi(res, "Không tải được chứng từ điều chỉnh"));
        return;
      }
      const j = (await res.json()) as { adjustments?: Adjustment[] };
      setDs(j.adjustments ?? []);
      setLoiTai(null);
    } catch {
      setLoiTai("Mất kết nối — không tải được chứng từ điều chỉnh");
    } finally {
      setDangTai(false);
    }
  }, [certId]);

  useEffect(() => {
    setDangTai(true);
    void tai();
  }, [tai]);

  const lamMoi = useCallback(async () => {
    await Promise.all([tai(), onXong()]);
  }, [tai, onXong]);

  const coMo = ds.some((a) => a.status === "draft" || a.status === "submitted");
  const daHuy =
    !!tomTat?.reversed || ds.some((a) => a.kind === "reversal" && a.status === "approved");
  const choPhepTao = canManage && !daHuy && !coMo && (tomTat?.open ?? 0) === 0;

  // Gọi 1 thao tác trên chứng từ; mọi lỗi (kể cả mạng) hiện toast tiếng Việt, nút không kẹt.
  async function thaoTac(a: Adjustment, url: string, init: RequestInit, loiMacDinh: string) {
    setBusyId(a.id);
    try {
      const res = await fetch(url, init);
      if (!res.ok) {
        showToast(await docLoi(res, loiMacDinh), "error");
        return false;
      }
      await lamMoi();
      return true;
    } catch {
      showToast(LOI_MANG, "error");
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function xoa(a: Adjustment) {
    if (!(await appConfirm(`Xoá nháp ${a.code}?`, { danger: true, confirmLabel: "Xoá" }))) return;
    await thaoTac(a, `/api/adjustments/${a.id}`, { method: "DELETE" }, "Xoá thất bại");
  }

  async function trinh(a: Adjustment) {
    if (!(await appConfirm(`Trình ${a.code} để duyệt?`, { confirmLabel: "Trình" }))) return;
    await thaoTac(a, `/api/adjustments/${a.id}/submit`, { method: "POST" }, "Trình thất bại");
  }

  async function quyetDinh(a: Adjustment, duyet: boolean) {
    let rejectReason: string | undefined;
    if (duyet) {
      const msg =
        a.kind === "reversal"
          ? `Duyệt ${a.code}: huỷ toàn bộ hiệu lực đợt ${maDot}?`
          : `Duyệt ${a.code} (${fmtTienDau(a.amount)})?`;
      if (!(await appConfirm(msg, { confirmLabel: "Duyệt", danger: a.kind === "reversal" })))
        return;
    } else {
      const n = await appPrompt("Lý do từ chối (bắt buộc)");
      if (!n?.trim()) return;
      rejectReason = n.trim();
    }
    // Key giữ lại khi mất mạng để bấm lại phát lại đúng lượt, không duyệt hai lần.
    keyDuyet.current[a.id] ??= taoIdempotencyKey();
    const key = keyDuyet.current[a.id];
    const ok = await thaoTac(
      a,
      `/api/adjustments/${a.id}/decide`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(key ? { "Idempotency-Key": key } : {}) },
        body: JSON.stringify({
          decision: duyet ? "approved" : "rejected",
          ...(rejectReason ? { rejectReason } : {}),
        }),
      },
      "Quyết định thất bại",
    );
    // Phản hồi hợp lệ từ server (kể cả lỗi nghiệp vụ) → lượt sau là quyết định mới.
    if (ok || navigator.onLine) keyDuyet.current[a.id] = null;
  }

  return (
    <Section
      title="Chứng từ điều chỉnh"
      icon={FilePen}
      description="Đợt đã duyệt không sửa trực tiếp — điều chỉnh hoặc huỷ hiệu lực qua chứng từ riêng, cần người khác duyệt."
      actions={
        choPhepTao ? (
          <div className="flex flex-wrap gap-2">
            <Button icon={Plus} size="sm" onClick={() => setForm({ kind: "adjustment" })}>
              Điều chỉnh
            </Button>
            <Button
              icon={Undo2}
              size="sm"
              variant="danger"
              onClick={() => setForm({ kind: "reversal" })}
            >
              Huỷ hiệu lực (reversal)
            </Button>
          </div>
        ) : undefined
      }
    >
      {form && (
        <FormDieuChinh
          key={form.sua?.id ?? form.kind}
          certId={certId}
          maDot={maDot}
          kind={form.kind}
          dongBoq={dongBoq}
          giaTriDuyet={giaTriDuyet}
          suaAdj={form.sua}
          onDong={() => setForm(null)}
          onXong={lamMoi}
        />
      )}
      {canManage && !choPhepTao && (daHuy || coMo || (tomTat?.open ?? 0) > 0) && (
        <p className="text-xs text-zinc-400">
          {daHuy
            ? "Đợt đã huỷ hiệu lực — không lập thêm điều chỉnh"
            : "Đang có chứng từ điều chỉnh chờ xử lý"}
        </p>
      )}
      <Card tone="raised" pad="md" className="space-y-3">
        {dangTai && ds.length === 0 && !loiTai && (
          <div role="status" aria-label="Đang tải chứng từ điều chỉnh" className="space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-10 w-full" />
          </div>
        )}
        {loiTai && (
          <div className="flex flex-wrap items-center gap-2">
            <p role="alert" className="text-xs text-rose-300">
              {loiTai}
            </p>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setDangTai(true);
                setLoiTai(null);
                void tai();
              }}
            >
              Thử lại
            </Button>
          </div>
        )}
        {!loiTai && !dangTai && ds.length === 0 && (
          <p className="text-xs text-zinc-400">Chưa có chứng từ điều chỉnh nào cho đợt này.</p>
        )}
        {tomTat && tomTat.netAmount != null && tomTat.approvedCount > 0 && (
          <p className="text-xs text-zinc-300">
            Giá trị ròng sau điều chỉnh:{" "}
            <span className="font-mono font-semibold text-zinc-100">
              {fmtVNDExact(String(tomTat.netAmount))}
            </span>
          </p>
        )}
        <ul className="divide-y divide-zinc-800/60">
          {ds.map((a) => {
            const busy = busyId === a.id;
            const cuaToi = meId != null && a.createdBy === meId;
            return (
              <li key={a.id} className="py-3 first:pt-0 last:pb-0 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-semibold text-zinc-100">{a.code}</span>
                  <Chip tone={a.kind === "reversal" ? "danger" : "info"}>{KIND_LABEL[a.kind]}</Chip>
                  <Chip tone={STATUS_TONE[a.status]}>{STATUS_LABEL[a.status]}</Chip>
                  <span
                    className={`ml-auto font-mono text-xs font-semibold tabular-nums ${
                      String(a.amount ?? "").startsWith("-") ? "text-rose-300" : "text-emerald-300"
                    }`}
                  >
                    {fmtTienDau(a.amount)}
                  </span>
                </div>
                <p className="text-xs text-zinc-300">{a.reason}</p>
                <p className="text-xs text-zinc-400">
                  Lập: {a.createdByName ?? "—"}
                  {a.decidedByName &&
                    ` · ${a.status === "rejected" ? "Từ chối" : "Duyệt"}: ${a.decidedByName}`}
                </p>
                {a.status === "rejected" && a.rejectReason && (
                  <p className="text-xs text-rose-300">Lý do từ chối: {a.rejectReason}</p>
                )}
                {a.items.length > 0 && (
                  <ul className="text-xs text-zinc-400 space-y-0.5">
                    {a.items.map((i) => (
                      <li key={i.id}>
                        <span className="font-mono text-zinc-300">{i.boqCode}</span> {i.boqName}:{" "}
                        <span className="tabular-nums">
                          {Number(i.qtyDelta) > 0 ? "+" : ""}
                          {i.qtyDelta} {i.unit}
                        </span>
                        {i.note && ` — ${i.note}`}
                      </li>
                    ))}
                  </ul>
                )}
                {canManage && a.status === "draft" && cuaToi && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button
                      icon={Pencil}
                      size="sm"
                      disabled={busy}
                      aria-label={`Sửa ${a.code}`}
                      onClick={() => setForm({ kind: a.kind, sua: a })}
                    >
                      Sửa
                    </Button>
                    <Button
                      icon={Trash2}
                      size="sm"
                      variant="danger"
                      disabled={busy}
                      aria-label={`Xoá nháp ${a.code}`}
                      onClick={() => void xoa(a)}
                    >
                      Xoá
                    </Button>
                    <Button
                      icon={Send}
                      size="sm"
                      variant="primary"
                      disabled={busy}
                      aria-label={busy ? undefined : `Trình ${a.code}`}
                      onClick={() => void trinh(a)}
                    >
                      {busy ? "Đang lưu…" : "Trình"}
                    </Button>
                  </div>
                )}
                {canManage && a.status === "submitted" && !cuaToi && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button
                      icon={Check}
                      size="sm"
                      variant="primary"
                      disabled={busy}
                      aria-label={busy ? undefined : `Duyệt ${a.code}`}
                      onClick={() => void quyetDinh(a, true)}
                    >
                      {busy ? "Đang lưu…" : "Duyệt"}
                    </Button>
                    <Button
                      icon={XCircle}
                      size="sm"
                      variant="danger"
                      disabled={busy}
                      aria-label={`Từ chối ${a.code}`}
                      onClick={() => void quyetDinh(a, false)}
                    >
                      Từ chối
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </Card>
    </Section>
  );
}
