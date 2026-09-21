import {
  AlertTriangle,
  ArrowUpRight,
  Brain,
  CalendarCheck,
  Coins,
  HardHat,
  Landmark,
  Package,
  type LucideIcon,
} from "lucide-react";
import EditableText from "@/app/components/EditableText";
import { Card, Section } from "@/app/components/ui";

// Cột phải trang chủ (M125): điều hướng + phân tích phụ, gom lại để cột chính chỉ còn
// tiến độ → đường găng → bảng trễ. Không có số liệu nào tự tính ở đây — Pareto nhận
// nguyên số đã tính trong `app/page.tsx`.

// 7 phân hệ hợp nhất: dữ liệu điều hướng thuần (không phải số liệu dự án). Trước đây khai
// ngay trong render của trang chủ kèm các chip trạng thái cắm cứng ("100% Khớp", "LOD
// 400", "Quyết toán kỳ 6") — số liệu giả, không đọc từ DB, dễ khiến người xem tin nhầm là
// tình trạng thật; đã bỏ hẳn, chỉ giữ phần điều hướng.
const HUBS: { title: string; desc: string; href: string; icon: LucideIcon; tint: string }[] = [
  {
    title: "1. Chỉ huy hiện trường & An toàn",
    desc: "Việc của tôi, Nhật ký TT06, Nghiệm thu, Mặt bằng & AI HSE",
    href: "/site",
    icon: HardHat,
    tint: "bg-emerald-500/10 text-emerald-300",
  },
  {
    title: "2. Kế hoạch & Tiến độ WBS",
    desc: "Lưới 6 hệ, CPM Gantt, Lookahead, EVM SPI/CPI & Báo cáo A4",
    href: "/schedule",
    icon: CalendarCheck,
    tint: "bg-sky-500/10 text-sky-300",
  },
  {
    title: "3. Chuỗi cung ứng & Vật tư",
    desc: "Định mức BOQ, Đấu thầu Vendor, Đơn hàng PO & QR GRN",
    href: "/procurement",
    icon: Package,
    tint: "bg-blue-500/10 text-blue-300",
  },
  {
    title: "4. Hợp đồng, Chi phí & FIDIC",
    desc: "Hợp đồng A-B, Chứng chỉ IPC, Phát sinh VO, Claims & Dòng tiền",
    href: "/commercial",
    icon: Coins,
    tint: "bg-violet-500/10 text-violet-300",
  },
  {
    title: "5. Trí tuệ AI & Digital Twin",
    desc: "Zalo/Voice Copilot, Gate 0, AI Swarm Debates & IoT Telemetry",
    href: "/engineering-intelligence",
    icon: Brain,
    tint: "bg-rose-500/10 text-rose-300",
  },
  {
    title: "6. Quản trị dự án & Hệ thống",
    desc: "Khởi công Đ107, Bàn giao Đ24, CDE Hồ sơ, Nhân sự & Audit Log",
    href: "/governance",
    icon: Landmark,
    tint: "bg-zinc-800 text-zinc-300",
  },
];

const LIFECYCLE = [
  {
    stage: "GĐ 0",
    title: "Khởi động & Pháp lý",
    desc: "Điều 107 · ĐTM · BOQ TT12",
    href: "/governance?tab=lifecycle",
  },
  {
    stage: "GĐ 1",
    title: "Kỹ thuật không gian",
    desc: "Xem không gian · Vòng đời thiết bị MEPF",
    href: "/engineering/spatial-viewer",
  },
  {
    stage: "GĐ 2",
    title: "Cung ứng & Vật tư",
    desc: "PO 6 bước · QR GRN cổng",
    href: "/procurement",
  },
  { stage: "GĐ 3", title: "Hiện trường & HSE", desc: "Nhật ký TT06 · AI Vision", href: "/site" },
  {
    stage: "GĐ 4",
    title: "Nghiệm thu & IPC",
    desc: "Ký số e-Sign · TT96 · FIDIC",
    href: "/commercial",
  },
  {
    stage: "GĐ 5",
    title: "Hoàn công & Bàn giao",
    desc: "T&C · Điều 24 · Digital Twin",
    href: "/governance?tab=lifecycle",
  },
];

export type ParetoRow = { slug: string; label: string; count: number };

export default function HomeRail({
  pareto,
}: {
  /** Nguyên nhân trễ (Pareto) — bấm một dòng để lọc bảng trễ ở cột chính. */
  pareto: {
    rows: ParetoRow[];
    noReason: number;
    /** Giá trị lớn nhất để quy đổi bề rộng thanh. */
    max: number;
    /** Tổng số công tác trễ, để tính tỷ lệ %. */
    total: number;
    /** Lý do đang lọc ("" = không lọc, "__none" = chưa gán lý do). */
    value: string;
    onToggle: (slug: string) => void;
  };
}) {
  const showPareto = pareto.total > 0 && (pareto.rows.length > 0 || pareto.noReason > 0);
  const bars = [
    ...pareto.rows.map((r) => ({ ...r, bar: "bg-amber-500/70 group-hover:bg-amber-400" })),
    ...(pareto.noReason > 0
      ? [
          {
            slug: "__none",
            label: "Chưa gán lý do",
            count: pareto.noReason,
            bar: "bg-zinc-600 group-hover:bg-zinc-500",
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-6">
      <Section
        title="Trung tâm điều hành"
        description="7 phân hệ hợp nhất — bấm để mở đúng cockpit"
      >
        <Card pad="sm" className="space-y-0.5">
          {HUBS.map((hub) => {
            const HubIcon = hub.icon;
            return (
              <a
                key={hub.href}
                href={hub.href}
                className="group flex items-center gap-2.5 min-h-11 px-2 rounded-lg hover:bg-zinc-800/60 transition interactive-press"
              >
                <span
                  className={`flex items-center justify-center w-8 h-8 shrink-0 rounded-lg ${hub.tint}`}
                >
                  <HubIcon className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-semibold text-zinc-100 truncate">
                    {hub.title}
                  </span>
                  <span className="block text-[11px] text-zinc-400 truncate">{hub.desc}</span>
                </span>
                <ArrowUpRight
                  className="w-3.5 h-3.5 shrink-0 text-zinc-600 group-hover:text-emerald-400 transition-colors"
                  aria-hidden="true"
                />
              </a>
            );
          })}

          {/* Dải 6 giai đoạn vòng đời — thuần điều hướng theo quy trình, thu gọn thành
              lưới 2 cột cho vừa bề ngang cột phải. */}
          <ol className="grid grid-cols-2 gap-1 pt-2 mt-1 border-t border-zinc-800">
            {LIFECYCLE.map((stg) => (
              <li key={stg.stage}>
                <a
                  href={stg.href}
                  title={stg.desc}
                  className="block rounded-lg border border-zinc-800 bg-zinc-950/70 px-2 py-1.5 hover:border-zinc-700 hover:bg-zinc-900/80 transition interactive-press"
                >
                  <span className="block text-[10px] font-mono font-bold uppercase text-zinc-400">
                    {stg.stage}
                  </span>
                  <span className="block text-[11px] font-semibold text-zinc-200 truncate">
                    {stg.title}
                  </span>
                </a>
              </li>
            ))}
          </ol>
        </Card>
      </Section>

      {showPareto && (
        <Section
          icon={AlertTriangle}
          title={
            <EditableText tkey="dashboard.pareto.title">Nguyên nhân trễ (Pareto)</EditableText>
          }
          description="Bấm một dòng để lọc bảng trễ theo lý do"
        >
          <Card tone="sunken" pad="sm" className="space-y-2">
            {bars.map((r) => (
              <button
                key={r.slug}
                onClick={() => pareto.onToggle(r.slug)}
                aria-pressed={pareto.value === r.slug}
                className={`w-full text-left group transition ${
                  pareto.value === r.slug ? "opacity-100" : pareto.value ? "opacity-40" : ""
                }`}
              >
                <span className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="text-zinc-300 truncate" title={r.label}>
                    {r.label}
                  </span>
                  <span className="shrink-0 tabular-nums text-zinc-400">
                    {r.count} ({Math.round((r.count / pareto.total) * 100)}%)
                  </span>
                </span>
                <span className="mt-1 block h-2 rounded-full bg-zinc-800 overflow-hidden">
                  <span
                    className={`block h-full rounded-full transition-all ${r.bar}`}
                    style={{ width: `${(r.count / pareto.max) * 100}%` }}
                  />
                </span>
              </button>
            ))}
          </Card>
        </Section>
      )}
    </div>
  );
}
