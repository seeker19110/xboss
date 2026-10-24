"use client";
import { useId, useRef, useState, type FormEvent } from "react";
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
  const [creating, setCreating] = useState(false);
  const creatingRef = useRef(false);
  const id = useId();

  function close() {
    // POST có thể đã ghi: chờ kết quả trước khi đóng/mở lại để tránh tạo trùng.
    if (!creatingRef.current) onClose();
  }

  async function createSheet(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (creatingRef.current || !name.trim()) return;
    creatingRef.current = true;
    setCreating(true);
    setErr("");
    let redirecting = false;
    try {
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
        setErr(typeof j?.error === "string" ? j.error : "Không tạo được trang");
        return;
      }
      window.location.href = `/tracking/${j.sheet.slug}`;
      redirecting = true;
    } catch {
      setErr("Mất kết nối khi tạo trang. Hãy kiểm tra danh sách trang trước khi thử lại.");
    } finally {
      // Thành công giữ khoá tới khi điều hướng; lỗi thì cho phép người dùng thử lại.
      if (!redirecting) {
        creatingRef.current = false;
        setCreating(false);
      }
    }
  }

  const field =
    "w-full min-w-0 min-h-11 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-base sm:text-sm outline-none focus:border-emerald-600 transition";

  return (
    <Modal onClose={close}>
      <form className="p-5" onSubmit={createSheet} aria-busy={creating}>
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <Plus className="w-4 h-4 text-emerald-400" /> Thêm trang tracking
        </h3>
        <div className="space-y-3">
          <div>
            <label htmlFor={`${id}-name`} className="block text-xs text-zinc-400 mb-1">
              Tên trang
            </label>
            <input
              id={`${id}-name`}
              autoFocus
              readOnly={creating}
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
            <label htmlFor={`${id}-code`} className="block text-xs text-zinc-400 mb-1">
              Mã sheet
            </label>
            <input
              id={`${id}-code`}
              readOnly={creating}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="VD: ONC Z3"
              className={field}
            />
          </div>
          <div>
            <label htmlFor={`${id}-slug`} className="block text-xs text-zinc-400 mb-1">
              Đường dẫn
            </label>
            <div className="flex items-center gap-1">
              <span className="text-sm text-zinc-400 shrink-0">/tracking/</span>
              <input
                id={`${id}-slug`}
                aria-describedby={`${id}-slug-description`}
                readOnly={creating}
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="ong-nuoc-cap-zone-3"
                className={`${field} font-mono`}
              />
            </div>
            <p id={`${id}-slug-description`} className="text-[11px] text-zinc-400 mt-1">
              Chỉ dùng chữ thường a–z, số và gạch nối.
            </p>
          </div>
          <div>
            <label htmlFor={`${id}-copy`} className="block text-xs text-zinc-400 mb-1">
              Sao chép cấu trúc từ
            </label>
            <select
              id={`${id}-copy`}
              aria-describedby={`${id}-copy-description`}
              disabled={creating}
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
            <p id={`${id}-copy-description`} className="text-[11px] text-zinc-400 mt-1">
              Copy nhóm + công việc, tiến độ reset về 0.
            </p>
          </div>
        </div>
        {err && (
          <p role="alert" className="text-xs text-red-400 mt-3">
            {err}
          </p>
        )}
        {creating && (
          <p role="status" className="text-xs text-zinc-400 mt-3">
            Đang tạo trang. Vui lòng chờ trước khi đóng.
          </p>
        )}
        <div className="flex justify-end gap-2 mt-5">
          <Button className="min-h-11" onClick={close} disabled={creating}>
            Huỷ
          </Button>
          <Button
            className="min-h-11"
            variant="primary"
            type="submit"
            disabled={creating || !name.trim()}
          >
            {creating ? "Đang tạo..." : "Tạo trang"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
