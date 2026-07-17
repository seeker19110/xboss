"use client";
// Section "Webhook ra ngoài" trong trang Tích hợp (M49 PR2). Đọc/ghi qua
// GET/POST /api/admin/webhooks + PATCH/DELETE /api/admin/webhooks/:id + POST .../:id/test.
// Chỉ Admin (manageIntegrations) — trang cha đã chặn, section vẫn tự ẩn nút khi không quản lý.
import { useCallback, useEffect, useState } from "react";
import {
  Webhook,
  Plus,
  Send,
  Trash2,
  Pencil,
  CheckCircle2,
  XCircle,
  Clock,
  Copy,
  X,
} from "lucide-react";
import { Modal, appConfirm } from "@/app/components/dialogs";
import { showToast } from "@/app/components/Toast";

type Delivery = {
  id: number;
  event: string;
  status: string;
  attempts: number;
  lastError: string | null;
  nextRetryAt: string;
  createdAt: string;
};

type WebhookItem = {
  id: number;
  projectId: number | null;
  projectName: string | null;
  url: string;
  events: string[];
  active: boolean;
  createdAt: string;
  deliveries: Delivery[];
};

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("vi-VN");
  } catch {
    return iso;
  }
}

// Badge trạng thái 1 delivery — kèm icon (không chỉ dựa màu, a11y).
function DeliveryBadge({ d }: { d: Delivery }) {
  const map: Record<string, { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
    ok: {
      label: "Thành công",
      cls: "bg-emerald-950 text-emerald-300 border-emerald-800",
      Icon: CheckCircle2,
    },
    failed: {
      label: "Thất bại",
      cls: "bg-rose-950 text-rose-300 border-rose-800",
      Icon: XCircle,
    },
    pending: {
      label: "Đang chờ",
      cls: "bg-amber-950 text-amber-300 border-amber-800",
      Icon: Clock,
    },
  };
  const m = map[d.status] ?? {
    label: d.status,
    cls: "bg-zinc-800 text-zinc-300 border-zinc-700",
    Icon: Clock,
  };
  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-medium border rounded-full px-2 py-0.5 ${m.cls}`}
      title={d.lastError ?? undefined}
    >
      <m.Icon className="w-3 h-3" />
      {m.label}
      {d.attempts > 0 ? ` · ${d.attempts} lần` : ""}
    </span>
  );
}

export default function WebhookSection({ canManage }: { canManage: boolean }) {
  const [rows, setRows] = useState<WebhookItem[]>([]);
  const [allEvents, setAllEvents] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<WebhookItem | null>(null);
  const [formUrl, setFormUrl] = useState("");
  const [formEvents, setFormEvents] = useState<string[]>([]);
  const [formProjectId, setFormProjectId] = useState("");
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [newSecret, setNewSecret] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    return fetch("/api/admin/webhooks")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        setRows(j?.webhooks ?? []);
        setAllEvents(j?.events ?? []);
      })
      .catch(() => showToast("Không tải được danh sách webhook", "error"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setFormUrl("");
    setFormEvents([]);
    setFormProjectId("");
    setNewSecret(null);
    setModalOpen(true);
  }

  function openEdit(w: WebhookItem) {
    setEditing(w);
    setFormUrl(w.url);
    setFormEvents(w.events);
    setFormProjectId(w.projectId != null ? String(w.projectId) : "");
    setNewSecret(null);
    setModalOpen(true);
  }

  function toggleEvent(ev: string) {
    setFormEvents((prev) => (prev.includes(ev) ? prev.filter((e) => e !== ev) : [...prev, ev]));
  }

  async function save() {
    if (!formUrl.trim()) return showToast("Nhập URL webhook", "error");
    if (formEvents.length === 0) return showToast("Chọn ít nhất 1 sự kiện", "error");
    setSaving(true);
    try {
      const payload: Record<string, unknown> = { url: formUrl.trim(), events: formEvents };
      if (!editing) payload.projectId = formProjectId.trim() === "" ? null : Number(formProjectId);
      const res = await fetch(
        editing ? `/api/admin/webhooks/${editing.id}` : "/api/admin/webhooks",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        showToast(j?.error ?? "Lưu webhook thất bại", "error");
        return;
      }
      if (!editing && j?.secret) {
        // Secret chỉ trả 1 lần — giữ modal mở để Admin copy lại, không đóng vội.
        setNewSecret(j.secret);
        showToast("Đã tạo webhook — lưu lại secret ngay", "success");
      } else {
        showToast("Đã lưu webhook", "success");
        setModalOpen(false);
      }
      load();
    } catch {
      showToast("Mất kết nối — không lưu được", "error");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(w: WebhookItem) {
    try {
      const res = await fetch(`/api/admin/webhooks/${w.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !w.active }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        showToast(j?.error ?? "Không đổi được trạng thái", "error");
        return;
      }
      load();
    } catch {
      showToast("Mất kết nối — không đổi được trạng thái", "error");
    }
  }

  async function testWebhook(w: WebhookItem) {
    setTestingId(w.id);
    try {
      const res = await fetch(`/api/admin/webhooks/${w.id}/test`, { method: "POST" });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        showToast(j?.error ?? "Gửi thử thất bại", "error");
      } else if ((j?.sent ?? 0) > 0) {
        showToast("Đã gửi thử thành công (ping)", "success");
      } else {
        showToast("Đã xếp hàng ping nhưng gửi chưa thành công — xem lịch sử", "error");
      }
      load();
    } catch {
      showToast("Mất kết nối — không gửi thử được", "error");
    } finally {
      setTestingId(null);
    }
  }

  async function remove(w: WebhookItem) {
    if (!(await appConfirm(`Xoá webhook tới ${w.url}?`, { danger: true, confirmLabel: "Xoá" })))
      return;
    try {
      const res = await fetch(`/api/admin/webhooks/${w.id}`, { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        showToast(j?.error ?? "Xoá thất bại", "error");
        return;
      }
      showToast("Đã xoá webhook", "success");
      load();
    } catch {
      showToast("Mất kết nối — không xoá được", "error");
    }
  }

  async function copySecret() {
    if (!newSecret) return;
    try {
      await navigator.clipboard.writeText(newSecret);
      showToast("Đã sao chép secret", "success");
    } catch {
      showToast("Không sao chép được — chọn thủ công", "error");
    }
  }

  return (
    <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div className="min-w-0">
          <p className="font-semibold flex items-center gap-2">
            <Webhook className="w-4 h-4 text-violet-300" />
            Webhook ra ngoài
          </p>
          <p className="text-xs text-zinc-400 mt-1">
            Đẩy sự kiện nghiệp vụ (nghiệm thu, duyệt VO/IPC, vật tư vượt định mức, yêu cầu nghiệm
            thu) tới hệ ngoài qua HTTP POST có ký HMAC-SHA256.
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 bg-violet-600 hover:bg-violet-500 px-3 py-1.5 rounded-lg text-xs font-medium transition shrink-0"
          >
            <Plus className="w-3.5 h-3.5" /> Thêm webhook
          </button>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 2 }, (_, i) => (
            <div key={i} className="animate-pulse bg-zinc-800/60 rounded-lg h-14" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-zinc-500 py-2">
          Chưa có webhook nào. {canManage ? 'Bấm "Thêm webhook" để tạo.' : ""}
        </p>
      ) : (
        <div className="rounded-lg border border-zinc-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-zinc-500 bg-zinc-900/60 border-b border-zinc-800">
                  <th className="text-left font-medium px-3 py-2">URL</th>
                  <th className="text-left font-medium px-3 py-2">Sự kiện</th>
                  <th className="text-left font-medium px-3 py-2">Trạng thái</th>
                  <th className="text-left font-medium px-3 py-2">Lần gửi gần nhất</th>
                  <th className="text-right font-medium px-3 py-2">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {rows.map((w) => {
                  const last = w.deliveries[0] ?? null;
                  return (
                    <tr key={w.id} className="hover:bg-zinc-900/40 align-top">
                      <td className="px-3 py-3 font-mono text-xs text-zinc-200 break-all max-w-[16rem]">
                        {w.url}
                        <div className="text-[11px] text-zinc-500 font-sans mt-0.5">
                          {w.projectName ?? (w.projectId != null ? `#${w.projectId}` : "Mọi dự án")}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1 max-w-[14rem]">
                          {w.events.map((e) => (
                            <span
                              key={e}
                              className="text-[11px] bg-zinc-800 text-zinc-300 border border-zinc-700 rounded px-1.5 py-0.5"
                            >
                              {e}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        {canManage ? (
                          <button
                            type="button"
                            role="switch"
                            aria-checked={w.active}
                            aria-label={`${w.active ? "Tắt" : "Bật"} webhook`}
                            onClick={() => toggleActive(w)}
                            className="inline-flex items-center gap-2"
                          >
                            <span
                              className={`shrink-0 w-10 h-5 rounded-full relative transition-colors ${
                                w.active ? "bg-emerald-600" : "bg-zinc-700"
                              }`}
                            >
                              <span
                                className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                                  w.active ? "translate-x-5" : ""
                                }`}
                              />
                            </span>
                            <span className="text-xs text-zinc-400">
                              {w.active ? "Bật" : "Tắt"}
                            </span>
                          </button>
                        ) : (
                          <span className="text-xs text-zinc-400">
                            {w.active ? "Đang bật" : "Đang tắt"}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {last ? (
                          <div className="space-y-1">
                            <DeliveryBadge d={last} />
                            <div className="text-[11px] text-zinc-500">
                              {last.event} · {fmtTime(last.createdAt)}
                            </div>
                            {last.lastError && (
                              <div className="text-[11px] text-rose-300 truncate max-w-[12rem]">
                                {last.lastError}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-zinc-500">Chưa gửi lần nào</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right whitespace-nowrap">
                        {canManage && (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => testWebhook(w)}
                              disabled={testingId === w.id}
                              aria-label="Gửi thử"
                              className="inline-flex items-center gap-1 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 px-2 py-1.5 rounded-lg text-xs font-medium transition"
                            >
                              <Send className={`w-3.5 h-3.5 ${testingId === w.id ? "animate-pulse" : ""}`} />
                              Gửi thử
                            </button>
                            <button
                              type="button"
                              onClick={() => openEdit(w)}
                              aria-label="Sửa webhook"
                              className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => remove(w)}
                              aria-label="Xoá webhook"
                              className="p-1.5 rounded-lg bg-zinc-800 hover:bg-rose-900 text-rose-300 transition"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modalOpen && (
        <Modal onClose={() => setModalOpen(false)} className="max-w-lg">
          <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-2">
            <h3 className="font-semibold text-sm flex-1">
              {editing ? "Sửa webhook" : "Thêm webhook"}
            </h3>
            <button
              onClick={() => setModalOpen(false)}
              aria-label="Đóng"
              className="text-zinc-400 hover:text-white shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="p-4 space-y-4">
            <div>
              <label className="block text-xs text-zinc-400 mb-1">URL nhận (https://)</label>
              <input
                value={formUrl}
                onChange={(e) => setFormUrl(e.target.value)}
                placeholder="https://vi-du.com/webhook"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-violet-500 font-mono"
              />
            </div>

            {!editing && (
              <div>
                <label className="block text-xs text-zinc-400 mb-1">
                  ID dự án (để trống = mọi dự án)
                </label>
                <input
                  value={formProjectId}
                  onChange={(e) => setFormProjectId(e.target.value)}
                  inputMode="numeric"
                  placeholder="vd 1"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-violet-500"
                />
              </div>
            )}

            <div>
              <label className="block text-xs text-zinc-400 mb-2">Sự kiện gửi đi</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {allEvents.map((ev) => (
                  <label
                    key={ev}
                    className="flex items-center gap-2 text-sm bg-zinc-800/60 border border-zinc-700 rounded-lg px-3 py-2 cursor-pointer hover:bg-zinc-800"
                  >
                    <input
                      type="checkbox"
                      checked={formEvents.includes(ev)}
                      onChange={() => toggleEvent(ev)}
                      className="accent-violet-500"
                    />
                    <span className="font-mono text-xs">{ev}</span>
                  </label>
                ))}
              </div>
            </div>

            {newSecret && (
              <div className="bg-amber-950/40 border border-amber-800 rounded-lg p-3 space-y-2">
                <p className="text-xs text-amber-200">
                  Secret ký HMAC — chỉ hiện 1 lần duy nhất, hãy lưu lại ngay:
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-zinc-950 border border-zinc-700 rounded px-2 py-1.5 text-[11px] break-all font-mono">
                    {newSecret}
                  </code>
                  <button
                    type="button"
                    onClick={copySecret}
                    aria-label="Sao chép secret"
                    className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 shrink-0"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => setModalOpen(false)}
                className="px-3 py-1.5 text-sm bg-zinc-800 hover:bg-zinc-700 rounded-lg"
              >
                {newSecret ? "Đóng" : "Huỷ"}
              </button>
              {!newSecret && (
                <button
                  onClick={save}
                  disabled={saving}
                  className="px-4 py-1.5 text-sm rounded-lg font-medium bg-violet-600 hover:bg-violet-500 disabled:opacity-50"
                >
                  {editing ? "Lưu" : "Tạo"}
                </button>
              )}
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
}
