"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Boxes, Lightbulb, GitBranch, Bot, Network, ShieldCheck } from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  icon: typeof Boxes;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/engineering", label: "Đối tượng kỹ thuật", icon: Boxes },
  { href: "/engineering/suggestions", label: "Đề xuất AI", icon: Lightbulb },
  { href: "/engineering/workflows", label: "Quy trình phê duyệt", icon: GitBranch },
  { href: "/engineering/agent-sessions", label: "Phiên Agent", icon: Bot },
  { href: "/engineering/graph", label: "Knowledge Graph", icon: Network },
  { href: "/engineering/data-quality", label: "Chất lượng dữ liệu", icon: ShieldCheck },
];

export default function EngineeringNav() {
  const pathname = usePathname();

  return (
    <nav className="mb-6 flex flex-wrap gap-1 border-b border-zinc-800 pb-2">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const isActive =
          item.href === "/engineering"
            ? pathname === "/engineering"
            : pathname.startsWith(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              isActive
                ? "bg-zinc-800 text-amber-400"
                : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
            }`}
          >
            <Icon size={16} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
