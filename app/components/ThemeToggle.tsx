"use client";
// Bộ chọn giao diện — mọi vai trò đều dùng được.
// Lựa chọn lưu trong localStorage('xboss_theme'), script trong layout đọc lại khi tải trang.
// Dạng nút bấm: mỗi lần bấm chuyển tuần tự sang giao diện kế tiếp trong danh sách.
import { useEffect, useState } from "react";
import { Sun, Moon, Crown, Droplet, Anchor } from "lucide-react";

type Theme = "dark" | "light" | "kingblue" | "darkblue" | "navy";

const THEMES: { id: Theme; label: string; icon: typeof Sun }[] = [
  { id: "dark", label: "Tối", icon: Moon },
  { id: "light", label: "Sáng", icon: Sun },
  { id: "kingblue", label: "King Blue", icon: Crown },
  { id: "darkblue", label: "Dark Blue", icon: Droplet },
  { id: "navy", label: "Navy", icon: Anchor },
];

const CLASSES: Theme[] = THEMES.map((t) => t.id);

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const el = document.documentElement;
    const cur = CLASSES.find((c) => el.classList.contains(c));
    if (cur) setTheme(cur);
  }, []);

  function cycle() {
    const idx = CLASSES.indexOf(theme);
    const next = CLASSES[(idx + 1) % CLASSES.length];
    const el = document.documentElement;
    el.classList.remove(...CLASSES);
    el.classList.add(next);
    try {
      localStorage.setItem("xboss_theme", next);
    } catch {
      /* private mode */
    }
    setTheme(next);
  }

  const Active = THEMES.find((t) => t.id === theme) ?? THEMES[0];
  const nextLabel = THEMES[(CLASSES.indexOf(theme) + 1) % CLASSES.length].label;

  return (
    <button
      onClick={cycle}
      title={`Giao diện: ${Active.label} — bấm để chuyển sang ${nextLabel}`}
      aria-label={`Đổi giao diện, hiện tại: ${Active.label}`}
      className="flex items-center justify-center w-7 h-7 rounded-lg text-zinc-400 hover:text-amber-400 hover:bg-zinc-900 transition shrink-0"
    >
      <Active.icon className="w-4 h-4" />
    </button>
  );
}
