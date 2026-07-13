"use client";
// Bộ chọn giao diện — mọi vai trò đều dùng được.
// Lựa chọn lưu trong localStorage('xboss_theme'), script trong layout đọc lại khi tải trang.
// Dạng nút bấm: mỗi lần bấm chuyển tuần tự sang giao diện kế tiếp trong danh sách.
import { useEffect, useState } from "react";
import { Sun, Moon, Crown, Droplet, Anchor } from "lucide-react";

type Theme = "dark" | "light" | "kingblue" | "darkblue" | "navy";

const THEMES: { id: Theme; label: string; icon: typeof Sun }[] = [
  { id: "light", label: "Sáng", icon: Sun },
  { id: "dark", label: "Tối", icon: Moon },
  { id: "kingblue", label: "King Blue", icon: Crown },
  { id: "darkblue", label: "Dark Blue", icon: Droplet },
  { id: "navy", label: "Navy", icon: Anchor },
];

const CLASSES: Theme[] = THEMES.map((t) => t.id);

// Màu `--background` của từng theme (globals.css) — dùng để cập nhật
// <meta name="theme-color"> động. Trùng với map trong script init ở
// app/layout.tsx (không thể chia sẻ vì script đó chạy inline trước hydrate,
// không import được module ngoài) — sửa 1 bên nhớ sửa bên kia.
const THEME_COLORS: Record<Theme, string> = {
  light: "#f6f7f9",
  dark: "#0a0a0a",
  kingblue: "#0a1f4d",
  darkblue: "#0c1a2e",
  navy: "#060b18",
};

function setThemeColorMeta(theme: Theme) {
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute("name", "theme-color");
    document.head.appendChild(meta);
  }
  meta.setAttribute("content", THEME_COLORS[theme]);
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

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
    setThemeColorMeta(next);
    setTheme(next);
  }

  const Active = THEMES.find((t) => t.id === theme) ?? THEMES[0];
  const nextLabel = THEMES[(CLASSES.indexOf(theme) + 1) % CLASSES.length].label;

  return (
    <button
      onClick={cycle}
      title={`Giao diện: ${Active.label} — bấm để chuyển sang ${nextLabel}`}
      aria-label={`Đổi giao diện, hiện tại: ${Active.label}`}
      className="flex items-center justify-center min-w-[44px] min-h-[44px] rounded-lg text-zinc-400 hover:text-amber-400 hover:bg-zinc-900 transition shrink-0"
    >
      <Active.icon className="w-4 h-4" />
    </button>
  );
}
