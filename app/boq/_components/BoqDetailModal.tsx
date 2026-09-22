"use client";
import { useCallback, useEffect, useState } from "react";
import { Layers, Search, Trash2, X } from "lucide-react";
import { Modal } from "@/app/components/dialogs";
import { taiJson } from "@/app/lib/taiDuLieu";
import { Button } from "@/app/components/ui";
import NormsSection from "./NormsSection";
import { NGUONG_TICK_SAN, type BoqItem, type TaskHit, type TaskTheoTang } from "./types";

export default function BoqDetailModal({
  item,
  canManage,
  onClose,
  onSaved,
  onDelete,
}: {
  item: BoqItem;
  canManage: boolean;
  onClose: () => void;
  onSaved: () => void;
  onDelete: () => void;
}) {
  const [qtyContract, setQtyContract] = useState(String(item.qtyContract));
  const [unitPrice, setUnitPrice] = useState(String(item.unitPrice));
  const [qtySub, setQtySub] = useState(String(item.qtySub));
  const [subUnitPrice, setSubUnitPrice] = useState(String(item.subUnitPrice));
  const [savingFields, setSavingFields] = useState(false);
  const [fieldsErr, setFieldsErr] = useState("");

  const [mapEntries, setMapEntries] = useState<
    { taskId: number; taskCode: string; taskName: string; weight: number }[]
  >(
    item.map.map((m) => ({
      taskId: m.taskId,
      taskCode: m.taskCode,
      taskName: m.taskName,
      weight: m.weight,
    })),
  );
  const [savingMap, setSavingMap] = useState(false);
  const [mapMsg, setMapMsg] = useState<{ text: string; warn: boolean } | null>(null);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<TaskHit[]>([]);

  // Panel "Thêm theo tầng" (M124 việc 1): chọn tầng ⇒ danh sách task cùng hệ, tick nhiều rồi
  // thêm một lượt. `chonTang` rỗng nghĩa là chưa chọn tầng nào.
  const [moTang, setMoTang] = useState(false);
  const [dsTang, setDsTang] = useState<string[]>([]);
  const [chonTang, setChonTang] = useState("");
  const [dsTask, setDsTask] = useState<TaskTheoTang[]>([]);
  const [dangTaiTang, setDangTaiTang] = useState(false);
  const [loiTang, setLoiTang] = useState("");
  const [tickTang, setTickTang] = useState<Set<number>>(new Set());

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setHits([]);
      return;
    }
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(term)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          const taskHits = (j?.hits ?? []).filter((h: { kind: string }) => h.kind === "task");
          setHits(taskHits);
        })
        .catch(() => setHits([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const sumWeight = mapEntries.reduce((s, e) => s + (Number(e.weight) || 0), 0);

  async function saveFields() {
    setSavingFields(true);
    setFieldsErr("");
    try {
      const res = await fetch(`/api/boq/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          qtyContract: Number(qtyContract) || 0,
          unitPrice: Number(unitPrice) || 0,
          qtySub: Number(qtySub) || 0,
          subUnitPrice: Number(subUnitPrice) || 0,
        }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        setFieldsErr(j?.error ?? "Lưu thất bại");
        return;
      }
      onSaved();
    } catch {
      setFieldsErr("Mất kết nối — kiểm tra mạng rồi thử lại");
    } finally {
      setSavingFields(false);
    }
  }

  function addTask(t: TaskHit) {
    if (mapEntries.some((e) => e.taskId === t.id)) return;
    setMapEntries((prev) => [
      ...prev,
      { taskId: t.id, taskCode: t.code, taskName: t.name, weight: 1 },
    ]);
    setQ("");
    setHits([]);
  }
  function removeTask(taskId: number) {
    setMapEntries((prev) => prev.filter((e) => e.taskId !== taskId));
  }
  function splitEvenly() {
    if (mapEntries.length === 0) return;
    const w = 1 / mapEntries.length;
    setMapEntries((prev) => prev.map((e) => ({ ...e, weight: w })));
  }

  // Tải gợi ý theo tầng. `floor` rỗng ⇒ chỉ lấy danh sách tầng (mở panel lần đầu).
  const taiTheoTang = useCallback(
    async (floor: string) => {
      setDangTaiTang(true);
      setLoiTang("");
      const kq = await taiJson<{ floors: string[]; tasks: TaskTheoTang[] }>(
        `/api/boq/${item.id}/tasks-theo-tang${floor ? `?floor=${encodeURIComponent(floor)}` : ""}`,
      );
      setDangTaiTang(false);
      if (!kq.ok) {
        setLoiTang(kq.loi);
        return;
      }
      setDsTang(kq.data.floors);
      setDsTask(kq.data.tasks);
      // Tick sẵn task giống tên rõ rệt và chưa map ở đâu — người dùng chỉ cần bỏ tick ngoại lệ.
      setTickTang(
        new Set(
          kq.data.tasks
            .filter((t) => t.diemGiong >= NGUONG_TICK_SAN && !t.daMapDongKhac)
            .map((t) => t.id),
        ),
      );
    },
    [item.id],
  );

  function moPanelTang() {
    setMoTang(true);
    if (dsTang.length === 0) void taiTheoTang("");
  }

  function doiTang(floor: string) {
    setChonTang(floor);
    setDsTask([]);
    setTickTang(new Set());
    if (floor) void taiTheoTang(floor);
  }

  // Thêm các task đã tick vào map rồi CHIA ĐỀU toàn bộ map (D3 của M124): thêm cả chục task với
  // weight = 1 sẽ làm Σ vượt 1 và bị PUT chặn, nên chia đều ngay trong cùng một lần setState —
  // gọi splitEvenly() rời sẽ chạy trên state cũ.
  function themTaskTheoTang() {
    const chon = dsTask.filter((t) => tickTang.has(t.id));
    if (chon.length === 0) return;
    setMapEntries((prev) => {
      const co = new Set(prev.map((e) => e.taskId));
      const gop = [
        ...prev,
        ...chon
          .filter((t) => !co.has(t.id))
          .map((t) => ({ taskId: t.id, taskCode: t.code, taskName: t.name, weight: 1 })),
      ];
      const w = gop.length > 0 ? 1 / gop.length : 1;
      return gop.map((e) => ({ ...e, weight: w }));
    });
    setTickTang(new Set());
    setMapMsg({
      text: `Đã thêm ${chon.length} task và chia đều tỷ trọng. Bấm "Lưu map" để ghi.`,
      warn: false,
    });
  }

  async function saveMap() {
    setSavingMap(true);
    setMapMsg(null);
    try {
      const res = await fetch(`/api/boq/${item.id}/map`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          map: mapEntries.map((e) => ({ taskId: e.taskId, weight: Number(e.weight) || 0 })),
        }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        setMapMsg({ text: j?.error ?? "Lưu map thất bại", warn: true });
        return;
      }
      setMapMsg(
        j.warning ? { text: j.warning, warn: true } : { text: "Đã lưu map task.", warn: false },
      );
      onSaved();
    } catch {
      setMapMsg({ text: "Mất kết nối — kiểm tra mạng rồi thử lại", warn: true });
    } finally {
      setSavingMap(false);
    }
  }

  return (
    <Modal onClose={onClose} className="max-w-xl">
      <div className="p-5 space-y-5 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold font-mono text-sm">{item.code}</h2>
            <p className="text-sm text-zinc-300">{item.name}</p>
          </div>
          <div className="flex items-center gap-2">
            {canManage && (
              <button
                onClick={onDelete}
                aria-label={`Xoá dòng BOQ ${item.code}`}
                className="text-zinc-400 hover:text-rose-300"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button onClick={onClose} aria-label="Đóng" className="text-zinc-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {canManage && (
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Sửa nhanh
            </h3>
            <div className="grid grid-cols-2 gap-3">
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
            {fieldsErr && <p className="text-sm text-rose-300">{fieldsErr}</p>}
            <button
              onClick={saveFields}
              disabled={savingFields}
              className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg"
            >
              {savingFields ? "Đang lưu…" : "Lưu"}
            </button>
          </section>
        )}

        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Map task ({mapEntries.length}) — tổng weight {sumWeight.toFixed(4)}
          </h3>

          {mapEntries.length > 0 && (
            <ul className="space-y-1.5">
              {mapEntries.map((e) => (
                <li key={e.taskId} className="flex items-center gap-2">
                  <span className="flex-1 min-w-0 truncate text-sm">
                    <span className="font-mono text-xs text-zinc-400">{e.taskCode}</span>{" "}
                    {e.taskName}
                  </span>
                  {canManage ? (
                    <input
                      type="number"
                      step="0.01"
                      value={e.weight}
                      onChange={(ev) =>
                        setMapEntries((prev) =>
                          prev.map((m) =>
                            m.taskId === e.taskId ? { ...m, weight: Number(ev.target.value) } : m,
                          ),
                        )
                      }
                      className="w-20 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-xs text-white text-right"
                    />
                  ) : (
                    <span className="text-xs text-zinc-400">{e.weight}</span>
                  )}
                  {canManage && (
                    <button
                      onClick={() => removeTask(e.taskId)}
                      aria-label={`Bỏ task ${e.taskCode} khỏi map`}
                      className="text-zinc-500 hover:text-rose-300"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {canManage && (
            <>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-2.5" />
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Tìm task theo mã/tên để thêm vào map…"
                    aria-label="Tìm task để thêm vào map"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg pl-8 pr-3 py-2 text-sm text-white"
                  />
                </div>
                {mapEntries.length > 1 && (
                  <button
                    onClick={splitEvenly}
                    className="text-xs text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 px-3 py-2 rounded-lg shrink-0"
                  >
                    Chia đều
                  </button>
                )}
                <Button
                  size="sm"
                  variant={moTang ? "primary" : "secondary"}
                  icon={Layers}
                  onClick={() => (moTang ? setMoTang(false) : moPanelTang())}
                  aria-expanded={moTang}
                  className="shrink-0"
                >
                  Thêm theo tầng
                </Button>
              </div>

              {moTang && (
                <div className="border border-zinc-700 rounded-xl p-3 space-y-2 bg-zinc-950/70">
                  <div className="flex items-center gap-2">
                    <select
                      value={chonTang}
                      onChange={(e) => doiTang(e.target.value)}
                      aria-label="Chọn tầng"
                      className="flex-1 min-h-10 bg-zinc-800 border border-zinc-700 rounded-lg px-2 text-sm text-white"
                    >
                      <option value="">— Chọn tầng —</option>
                      {dsTang.map((f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                    </select>
                    <Button
                      size="sm"
                      variant="primary"
                      disabled={tickTang.size === 0}
                      onClick={themTaskTheoTang}
                    >
                      Thêm {tickTang.size} task
                    </Button>
                  </div>

                  {dangTaiTang && <p className="text-xs text-zinc-400">Đang tải…</p>}
                  {loiTang && (
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-rose-300 flex-1">{loiTang}</p>
                      <Button size="sm" onClick={() => void taiTheoTang(chonTang)}>
                        Thử lại
                      </Button>
                    </div>
                  )}
                  {!dangTaiTang && !loiTang && chonTang && dsTask.length === 0 && (
                    <p className="text-xs text-zinc-400">Tầng này chưa có task cùng hệ.</p>
                  )}
                  {!dangTaiTang && dsTang.length === 0 && !loiTang && (
                    <p className="text-xs text-zinc-400">
                      Chưa có nhóm công việc nào gắn tầng cho hệ của dòng BOQ này.
                    </p>
                  )}

                  {dsTask.length > 0 && (
                    <ul className="max-h-56 overflow-y-auto divide-y divide-zinc-800">
                      {dsTask.map((t) => {
                        const daCo = mapEntries.some((e) => e.taskId === t.id);
                        return (
                          <li key={t.id} className="flex items-start gap-2 py-1.5">
                            <input
                              type="checkbox"
                              checked={daCo || tickTang.has(t.id)}
                              disabled={daCo}
                              aria-label={`Chọn task ${t.code} ${t.name}`}
                              onChange={(ev) =>
                                setTickTang((prev) => {
                                  const s = new Set(prev);
                                  if (ev.target.checked) s.add(t.id);
                                  else s.delete(t.id);
                                  return s;
                                })
                              }
                              className="mt-1 w-4 h-4 accent-emerald-500"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm truncate">
                                <span className="font-mono text-xs text-zinc-400">{t.code}</span>{" "}
                                {t.name}
                              </p>
                              <p className="text-xs text-zinc-500 truncate">
                                {t.sheetName} · {t.pkgCode} {t.pkgName} ·{" "}
                                {Math.round(t.progressPercent * 100)}%
                              </p>
                            </div>
                            {daCo ? (
                              <span className="text-xs text-emerald-300 shrink-0">đã có</span>
                            ) : (
                              t.daMapDongKhac && (
                                <span className="text-xs text-amber-300 shrink-0">
                                  đã map dòng khác
                                </span>
                              )
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}
              {hits.length > 0 && (
                <ul className="border border-zinc-700 rounded-lg divide-y divide-zinc-800 max-h-40 overflow-y-auto">
                  {hits.map((h) => (
                    <li key={h.id}>
                      <button
                        onClick={() => addTask(h)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-zinc-800 flex items-center justify-between gap-2"
                      >
                        <span className="truncate">
                          <span className="font-mono text-xs text-zinc-400">{h.code}</span> {h.name}
                        </span>
                        <span className="text-xs text-zinc-500 shrink-0">{h.sheetType}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {mapMsg && (
                <p className={`text-sm ${mapMsg.warn ? "text-amber-300" : "text-emerald-300"}`}>
                  {mapMsg.text}
                </p>
              )}
              <button
                onClick={saveMap}
                disabled={savingMap}
                className="bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-on-accent text-sm font-medium px-4 py-2 rounded-lg"
              >
                {savingMap ? "Đang lưu…" : "Lưu map"}
              </button>
            </>
          )}
        </section>

        <NormsSection boqItemId={item.id} canManage={canManage} />
      </div>
    </Modal>
  );
}
