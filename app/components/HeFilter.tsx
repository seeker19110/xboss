"use client";
import { useEffect, useState } from "react";

// Lọc theo hệ (M36) — dùng chung cho các trang tiến độ (timeline/gantt/lookahead/report).
// Chuẩn duy nhất: query param `?he=<disciplines.code>`. Đổi lựa chọn gọi onChange (trang
// cha tự refetch) VÀ đồng bộ URL bằng history.replaceState (giữ nguyên các param khác) —
// để link chia sẻ/hub trỏ thẳng vào đúng bộ lọc.

type Discipline = { id: number; code: string; name: string; color: string | null };

export default function HeFilter({
  value,
  onChange,
  selectClassName,
  labelClassName,
}: {
  value: string;
  onChange: (he: string) => void;
  /** Class tuỳ biến cho <select> — mặc định bám thang zinc dark-first. Trang in
   *  (report/lookahead — nền trắng cố định, không theo theme) truyền class riêng. */
  selectClassName?: string;
  labelClassName?: string;
}) {
  const [disciplines, setDisciplines] = useState<Discipline[]>([]);

  useEffect(() => {
    fetch("/api/disciplines")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setDisciplines(j?.disciplines ?? []))
      .catch(() => {});
  }, []);

  function handleChange(next: string) {
    onChange(next);
    try {
      const url = new URL(window.location.href);
      if (next) url.searchParams.set("he", next);
      else url.searchParams.delete("he");
      window.history.replaceState(null, "", url.toString());
    } catch {
      /* URL không hợp lệ (hiếm) — bỏ qua, state vẫn cập nhật qua onChange */
    }
  }

  return (
    <label className={labelClassName ?? "flex items-center gap-1.5 text-xs text-zinc-400"}>
      <span className="shrink-0">Hệ:</span>
      <select
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        aria-label="Lọc theo hệ"
        className={
          selectClassName ??
          "min-h-10 bg-zinc-900 border border-zinc-800 text-zinc-200 rounded-lg px-3 py-1.5 text-sm outline-none"
        }
      >
        <option value="">Tổng thể</option>
        {disciplines.map((d) => (
          <option key={d.code} value={d.code}>
            {d.name}
          </option>
        ))}
      </select>
    </label>
  );
}
