"use client";
import { Fragment, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X, ChevronDown, ArrowUp, ArrowDown } from "lucide-react";

// Toolbar dùng chung: tìm kiếm (debounce) + lọc multi-select + sort + đồng bộ URL.
// Toàn bộ lọc/sort/search chạy client-side (xem docs/nang-cap/M39-bang-filter-sort-sticky.md) —
// phù hợp dữ liệu tải 1 lần, không phân trang, không thêm thư viện ngoài.

export type ToolbarFilter<T> = {
  key: string;
  label: string;
  options: { value: string; label: string }[];
  getValue: (item: T) => string;
};

export type ToolbarSort<T> = {
  key: string;
  label: string;
  compare: (a: T, b: T) => number;
};

export type SortState = { key: string; dir: "asc" | "desc" };

type TableToolbarProps<T> = {
  data: T[];
  searchFields: (item: T) => string[];
  filters: ToolbarFilter<T>[];
  sorts?: ToolbarSort<T>[];
  defaultSort?: SortState;
  urlPrefix?: string;
  // filtered/sorted đã áp dụng; toolbar là JSX cần render; sort là state + hàm đổi cột
  // (đưa ra ngoài để trang gọi được từ chính header <th> — đúng yêu cầu "bấm header để sort");
  // query (đã debounce) trả thêm để trang tự highlight từ khoá trong nội dung dòng.
  children: (
    filtered: T[],
    toolbar: ReactNode,
    sort: SortState & { set: (key: string) => void },
    query: string,
  ) => ReactNode;
};

// Escape ký tự đặc biệt của regex trước khi dùng làm delimiter cho split — tránh vỡ khi
// query chứa ký tự như "(", ".", "+"...
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Bôi vàng phần khớp từ khoá tìm kiếm trong chuỗi hiển thị.
export function highlightMatch(text: string, query: string): ReactNode {
  const q = query.trim();
  if (!q) return text;
  const parts = text.split(new RegExp(`(${escapeRegExp(q)})`, "gi"));
  if (parts.length === 1) return text;
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === q.toLowerCase() ? (
          <mark key={i} className="bg-amber-500/30 text-inherit rounded-sm">
            {part}
          </mark>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}

export default function TableToolbar<T>({
  data,
  searchFields,
  filters,
  sorts,
  defaultSort,
  urlPrefix = "",
  children,
}: TableToolbarProps<T>) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const p = (name: string) => (urlPrefix ? `${urlPrefix}_${name}` : name);

  const [query, setQuery] = useState(() => searchParams.get(p("q")) ?? "");
  const [debouncedQuery, setDebouncedQuery] = useState(query);
  const [active, setActive] = useState<Record<string, string[]>>(() => {
    const init: Record<string, string[]> = {};
    for (const f of filters) {
      const raw = searchParams.get(p(f.key));
      init[f.key] = raw ? raw.split(",").filter(Boolean) : [];
    }
    return init;
  });
  const [sort, setSortState] = useState<SortState>(() => {
    const key = searchParams.get(p("sort")) ?? defaultSort?.key ?? sorts?.[0]?.key ?? "";
    const dir = (searchParams.get(p("dir")) as "asc" | "desc" | null) ?? defaultSort?.dir ?? "asc";
    return { key, dir };
  });

  const initialMount = useRef(true);

  // Debounce ô tìm kiếm 300ms
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  // Đồng bộ state hiện tại vào URL query params (không lưu giá trị rỗng/mặc định để URL gọn)
  useEffect(() => {
    if (initialMount.current) {
      initialMount.current = false;
      return;
    }
    const next = new URLSearchParams(searchParams.toString());
    if (debouncedQuery.trim()) next.set(p("q"), debouncedQuery.trim());
    else next.delete(p("q"));
    for (const f of filters) {
      const vals = active[f.key] ?? [];
      if (vals.length) next.set(p(f.key), vals.join(","));
      else next.delete(p(f.key));
    }
    if (sort.key && sort.key !== (defaultSort?.key ?? sorts?.[0]?.key))
      next.set(p("sort"), sort.key);
    else next.delete(p("sort"));
    if (sort.dir && sort.dir !== (defaultSort?.dir ?? "asc")) next.set(p("dir"), sort.dir);
    else next.delete(p("dir"));
    router.replace(`?${next.toString()}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery, active, sort]);

  function toggleOption(key: string, value: string) {
    setActive((a) => {
      const cur = a[key] ?? [];
      const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
      return { ...a, [key]: next };
    });
  }

  function clearFilter(key: string) {
    setActive((a) => ({ ...a, [key]: [] }));
  }

  function clearAll() {
    setQuery("");
    setActive((a) => {
      const next: Record<string, string[]> = {};
      for (const k of Object.keys(a)) next[k] = [];
      return next;
    });
  }

  function setSort(key: string) {
    setSortState((s) =>
      s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" },
    );
  }

  const filtered = useMemo(() => {
    let result = data;
    const q = debouncedQuery.trim().toLowerCase();
    if (q) {
      result = result.filter((item) => searchFields(item).some((s) => s.toLowerCase().includes(q)));
    }
    for (const f of filters) {
      const vals = active[f.key] ?? [];
      if (vals.length) result = result.filter((item) => vals.includes(f.getValue(item)));
    }
    if (sort.key) {
      const s = sorts?.find((x) => x.key === sort.key);
      if (s) {
        const cmp = s.compare;
        result = [...result].sort((a, b) => (sort.dir === "asc" ? cmp(a, b) : cmp(b, a)));
      }
    }
    return result;
  }, [data, debouncedQuery, active, sort, filters, searchFields, sorts]);

  const hasActiveFilters = query.trim() !== "" || Object.values(active).some((v) => v.length > 0);

  const chips: { key: string; label: string; onRemove: () => void }[] = [];
  if (query.trim()) {
    chips.push({ key: "__q", label: `Tìm: "${query.trim()}"`, onRemove: () => setQuery("") });
  }
  for (const f of filters) {
    for (const v of active[f.key] ?? []) {
      const opt = f.options.find((o) => o.value === v);
      chips.push({
        key: `${f.key}:${v}`,
        label: `${f.label}: ${opt?.label ?? v}`,
        onRemove: () => toggleOption(f.key, v),
      });
    }
  }

  const toolbar = (
    <div className="flex flex-col gap-2 p-3 border-b border-zinc-800 bg-zinc-900">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm kiếm…"
            aria-label="Tìm kiếm"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg pl-8 pr-8 py-1.5 text-sm outline-none focus:border-emerald-600"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              aria-label="Xoá tìm kiếm"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-200"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {filters.map((f) => {
          const sel = active[f.key] ?? [];
          return (
            <details key={f.key} className="relative group">
              <summary
                className={`list-none flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border cursor-pointer select-none transition ${
                  sel.length
                    ? "bg-emerald-950 border-emerald-900 text-emerald-200"
                    : "bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700"
                }`}
              >
                {f.label}
                {sel.length > 0 && ` (${sel.length})`}
                <ChevronDown className="w-3 h-3" />
              </summary>
              <div className="absolute z-40 mt-1 min-w-[200px] bg-zinc-900 border border-zinc-700 rounded-lg shadow-lg p-2 space-y-1">
                {f.options.map((opt) => (
                  <label
                    key={opt.value}
                    className="flex items-center gap-2 text-xs px-2 py-1.5 rounded hover:bg-zinc-800 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={sel.includes(opt.value)}
                      onChange={() => toggleOption(f.key, opt.value)}
                      className="accent-emerald-500"
                    />
                    {opt.label}
                  </label>
                ))}
                {f.options.length === 0 && (
                  <p className="text-xs text-zinc-500 px-2 py-1">Không có tuỳ chọn</p>
                )}
              </div>
            </details>
          );
        })}

        <span className="text-xs text-zinc-400 ml-auto whitespace-nowrap">
          Hiển thị {filtered.length} / {data.length}
        </span>
      </div>

      {chips.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {chips.map((c) => (
            <button
              key={c.key}
              onClick={c.onRemove}
              aria-label={`Xoá bộ lọc ${c.label}`}
              className="flex items-center gap-1 text-[11px] bg-zinc-800 border border-zinc-700 text-zinc-300 rounded-full pl-2 pr-1 py-0.5 hover:bg-zinc-700"
            >
              {c.label}
              <X className="w-3 h-3" />
            </button>
          ))}
          {hasActiveFilters && (
            <button
              onClick={clearAll}
              className="text-[11px] text-zinc-400 hover:text-red-400 underline underline-offset-2 ml-1"
            >
              Xoá tất cả
            </button>
          )}
        </div>
      )}
    </div>
  );

  return <>{children(filtered, toolbar, { ...sort, set: setSort }, debouncedQuery)}</>;
}

// Nút header cột có thể click để sort — dùng trong <th> của bảng.
export function SortableHeader({
  label,
  sortKey,
  sort,
  className = "",
}: {
  label: string;
  sortKey: string;
  sort: SortState & { set: (key: string) => void };
  className?: string;
}) {
  const active = sort.key === sortKey;
  return (
    <button
      onClick={() => sort.set(sortKey)}
      className={`flex items-center gap-1 hover:text-zinc-200 transition ${active ? "text-zinc-200" : ""} ${className}`}
    >
      {label}
      {active &&
        (sort.dir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
    </button>
  );
}
