"use client";
import { useState } from "react";
import { Plus } from "lucide-react";
import { Modal } from "@/app/components/dialogs";
import { Button } from "@/app/components/ui";
import { toSlug } from "@/lib/nen/sheets";

// Hộp thoại "Thêm trang tracking" của trang chủ (Admin/PM) — tách khỏi `app/page.tsx`
// ở M125 để trang chủ chỉ còn phần bố cục. Form tự giữ state, tạo xong điều hướng
// thẳng sang trang tracking vừa tạo.

export default function NewSheetModal({
  sheets,
  onClose,
}: {
  /** Danh sách trang hiện có — để chọn trang nguồn sao chép cấu trúc. */
  sheets: { id: number; code: string; name: string }[];
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [slug, setSlug] = useState("");
  const [copyFromId, setCopyFromId] = useState<number | "">(sheets[sheets.length - 1]?.id ?? "");
  const [err, setErr] = useState("");

  async function createSheet() {
    if (!name.trim()) return;
    const res = await fetch("/api/sheets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        code: code.trim() || undefined,
        slug: slug.trim() || undefined,
        copyFromId: copyFromId || undefined,
      }),
    });
    const j = await res.json().catch(() => null);
    if (!res.ok) {
      setErr(j?.error ?? "Không tạo được trang");
      return;
    }
    window.location.href = `/tracking/${j.sheet.slug}`;
  }

  const field =
    "w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-600 transition";

  return (
    <Modal onClose={onClose}>
      <div className="p-5">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <Plus className="w-4 h-4 text-emerald-400" /> Thêm trang tracking
        </h3>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Tên trang</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setSlug(toSlug(e.target.value));
                setCode(e.target.value);
              }}
              placeholder="VD: Ống nước cấp Zone 3"
              className={field}
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Mã sheet</label>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="VD: ONC Z3"
              className={field}
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Đường dẫn</label>
            <div className="flex items-center gap-1">
              <span className="text-sm text-zinc-400 shrink-0">/tracking/</span>
              <input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="ong-nuoc-cap-zone-3"
                className={`${field} font-mono`}
              />
            </div>
            <p className="text-[11px] text-zinc-400 mt-1">
              Chỉ dùng chữ thường a–z, số và gạch nối.
            </p>
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Sao chép cấu trúc từ</label>
            <select
              value={copyFromId}
              onChange={(e) => setCopyFromId(e.target.value ? Number(e.target.value) : "")}
              className={field}
            >
              <option value="">— Trang trống —</option>
              {sheets.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} — {s.name}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-zinc-400 mt-1">
              Copy nhóm + công việc, tiến độ reset về 0.
            </p>
          </div>
        </div>
        {err && <p className="text-xs text-red-400 mt-3">{err}</p>}
        <div className="flex justify-end gap-2 mt-5">
          <Button onClick={onClose}>Huỷ</Button>
          <Button variant="primary" onClick={createSheet} disabled={!name.trim()}>
            Tạo trang
          </Button>
        </div>
      </div>
    </Modal>
  );
}
