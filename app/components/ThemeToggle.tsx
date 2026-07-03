"use client";
// Bộ chọn giao diện — mọi vai trò đều dùng được.
// Lựa chọn lưu trong localStorage('xboss_theme'), script trong layout đọc lại khi tải trang.
import { useEffect, useRef, useState } from "react";
import { Sun, Moon, Crown, Droplet, Anchor, Palette, Check } from "lucide-react";

type Theme = "dark" | "light" | "kingblue" | "darkblue" | "navy";

const THEMES: { id: Theme; label: string; icon: typeof Sun; swatch: string }[] = [
  { id: "dark", label: "Tối", icon: Moon, swatch: "#18181b" },
  { id: "light", label: "Sáng", icon: Sun, swatch: "#ffffff" },
  { id: "kingblue", label: "King Blue", icon: Crown, swatch: "#1a3f94" },
  { id: "darkblue", label: "Dark Blue", icon: Droplet, swatch: "#1e3a5f" },
  { id: "navy", label: "Navy", icon: Anchor, swatch: "#111c30" },
];

const CLASSES: Theme[] = ["dark", "light", "kingblue", "darkblue", "navy"];

// dropUp: mở menu lên trên (khi đặt trong thanh nav dưới đáy).
export default function ThemeToggle({ dropUp = false }: { dropUp?: boolean }) {
  const [theme, setTheme] = useState<Theme>("dark");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = document.documentElement;
    const cur = CLASSES.find((c) => el.classList.contains(c));
    if (cur) setTheme(cur);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function pick(next: Theme) {
    const el = document.documentElement;
    el.classList.remove(...CLASSES);
    el.classList.add(next);
    try {
      localStorage.setItem("xboss_theme", next);
    } catch {
      /* private mode */
    }
    setTheme(next);
    setOpen(false);
  }

  const Active = THEMES.find((t) => t.id === theme) ?? THEMES[0];

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        title="Đổi giao diện"
        aria-label="Đổi giao diện"
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center justify-center text-zinc-400 hover:text-amber-400"
      >
        <Active.icon className="w-4 h-4" />
        <Palette className="w-2.5 h-2.5 -ml-0.5 -mb-2 opacity-60" aria-hidden />
      </button>

      {open && (
        <div
          role="menu"
          className={`absolute right-0 ${dropUp ? "bottom-full mb-2" : "mt-2"} w-44 rounded-xl border border-zinc-800 bg-zinc-950 shadow-xl p-1 z-50`}
        >
          <p className="px-3 pt-1.5 pb-1 text-[10px] uppercase tracking-wide text-zinc-500">
            Giao diện
          </p>
          {THEMES.map((t) => {
            const Icon = t.icon;
            const active = t.id === theme;
            return (
              <button
                key={t.id}
                role="menuitemradio"
                aria-checked={active}
                onClick={() => pick(t.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition
                  ${active ? "bg-zinc-800 text-zinc-100" : "text-zinc-300 hover:bg-zinc-900"}`}
              >
                <span
                  className="w-4 h-4 rounded-full border border-zinc-700 shrink-0"
                  style={{ backgroundColor: t.swatch }}
                  aria-hidden
                />
                <Icon className="w-3.5 h-3.5 shrink-0 opacity-80" aria-hidden />
                <span className="flex-1 text-left">{t.label}</span>
                {active && <Check className="w-3.5 h-3.5 text-amber-400 shrink-0" aria-hidden />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
