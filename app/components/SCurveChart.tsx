"use client";
import { useEffect, useId, useState } from "react";
import { TrendingUp, Flag } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from "recharts";
import { appAlert, appPrompt } from "@/app/components/dialogs";
import EditableText from "@/app/components/EditableText";
import { formatDateVN } from "@/lib/date";

type Point = { date: string; planned: number | null; actual: number | null };
type Data = { points: Point[]; sheets: string[]; today?: string };
type Baseline = {
  id: number;
  name: string;
  createdAt: string;
  createdBy: string | null;
  taskCount: number;
};

const fmtTick = (d: string) => {
  const dt = new Date(d);
  return `${dt.getDate()}/${dt.getMonth() + 1}`;
};

// Màu đường thực tế theo mức lệch với kế hoạch tại từng ngày: đạt/vượt kế hoạch = xanh;
// chậm thì ngả vàng dần rồi sang đỏ, đỏ hẳn khi chậm ≥ SLIP_FULL_RED điểm %. Dùng
// color-mix trên token màu Tailwind để giữ cơ chế đảo màu light/dark của globals.css.
const SLIP_FULL_RED = 15;
function slipColor(planned: number | null | undefined, actual: number | null | undefined) {
  if (planned == null || actual == null || actual >= planned) return "var(--color-emerald-400)";
  const t = Math.min((planned - actual) / SLIP_FULL_RED, 1);
  return t <= 0.5
    ? `color-mix(in oklab, var(--color-amber-400) ${Math.round(t * 200)}%, var(--color-emerald-400))`
    : `color-mix(in oklab, var(--color-red-400) ${Math.round((t - 0.5) * 200)}%, var(--color-amber-400))`;
}

// Chấm tuỳ biến trên đường thực tế — mỗi chấm 1 ngày, tô theo mức lệch của chính ngày đó.
type DotProps = { cx?: number; cy?: number; index?: number; payload?: Point };
function actualDot({ cx, cy, index, payload }: DotProps) {
  if (cx == null || cy == null || payload?.actual == null) return <g key={`d${index}`} />;
  return (
    <circle
      key={`d${index}`}
      cx={cx}
      cy={cy}
      r={1.6}
      fill={slipColor(payload.planned, payload.actual)}
      stroke="none"
    />
  );
}

// S-curve: tiến độ kế hoạch (nội suy từ ngày bắt đầu/kết thúc task)
// vs thực tế (tái dựng từ lịch sử cập nhật) — chuẩn báo cáo xây dựng.
// Chọn baseline đã chốt → đường kế hoạch dùng ngày gốc, đo được độ lệch thật khi PM dời ngày.
export default function SCurveChart({ system }: { system?: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [sheet, setSheet] = useState("");
  const [baselines, setBaselines] = useState<Baseline[]>([]);
  const [baseline, setBaseline] = useState(""); // id baseline | '' = kế hoạch hiện tại
  const [saving, setSaving] = useState(false);
  // Id gradient duy nhất per instance (chart xuất hiện ở Dashboard, /scurve, /progress/[system]).
  const gradId = `scurve-actual-${useId().replace(/:/g, "")}`;

  useEffect(() => {
    fetch("/api/baselines")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setBaselines(j?.baselines ?? []));
  }, []);

  useEffect(() => {
    const qs = new URLSearchParams();
    if (sheet) qs.set("sheet", sheet);
    if (baseline) qs.set("baseline", baseline);
    if (system) qs.set("system", system);
    const s = qs.toString();
    fetch(`/api/dashboard/scurve${s ? `?${s}` : ""}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setData);
  }, [sheet, baseline, system]);

  async function snapshotBaseline() {
    const name = await appPrompt("Tên baseline", "", {
      placeholder: "VD: Kế hoạch hợp đồng, Điều chỉnh đợt 1",
    });
    if (name === null) return;
    setSaving(true);
    const res = await fetch("/api/baselines", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => null);
      appAlert(j?.error ?? "Không chốt được baseline");
      return;
    }
    const j = await res.json();
    setBaselines((b) => [
      { id: j.id, name: j.name, createdAt: "", createdBy: null, taskCount: j.taskCount },
      ...b,
    ]);
    setBaseline(String(j.id));
  }

  if (!data || data.points.length < 2) return null;

  // Gradient tô đường thực tế theo trục ngang: mỗi ngày một stop, màu theo mức lệch
  // (slipColor). Offset chuẩn hoá trên đoạn có dữ liệu thực tế (bbox của path chính
  // là đoạn đó vì trục X category chia đều theo ngày).
  const actualPts = data.points.map((p, i) => ({ p, i })).filter((x) => x.p.actual != null);
  const firstIdx = actualPts[0]?.i ?? 0;
  const actualSpan = Math.max(1, (actualPts[actualPts.length - 1]?.i ?? 0) - firstIdx);

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl mb-8">
      <div className="flex items-center gap-2 flex-wrap p-4 border-b border-zinc-800">
        <h2 className="font-semibold text-sm text-zinc-300 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-emerald-400" />{" "}
          <EditableText tkey="scurve.title">S-curve: Kế hoạch vs Thực tế</EditableText>
        </h2>
        <div className="ml-auto flex items-center gap-2">
          <select
            value={baseline}
            onChange={(e) => setBaseline(e.target.value)}
            aria-label="Chọn baseline so sánh"
            className="bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1 text-xs outline-none text-zinc-300"
          >
            <option value="">Kế hoạch hiện tại</option>
            {baselines.map((b) => (
              <option key={b.id} value={b.id}>
                📌 {b.name}
              </option>
            ))}
          </select>
          <select
            value={sheet}
            onChange={(e) => setSheet(e.target.value)}
            aria-label="Lọc S-curve theo sheet"
            className="bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1 text-xs outline-none text-zinc-300"
          >
            <option value="">Toàn dự án</option>
            {data.sheets.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button
            onClick={snapshotBaseline}
            disabled={saving}
            title="Lưu snapshot ngày BĐ/KT hiện tại làm mốc so sánh (Admin/PM)"
            className="flex items-center gap-1 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 border border-zinc-700 rounded-lg px-2 py-1 text-xs text-zinc-300 transition"
          >
            <Flag className="w-3 h-3 text-amber-400" /> {saving ? "Đang chốt…" : "Chốt baseline"}
          </button>
        </div>
        <p className="text-xs text-zinc-400 w-full">
          {baseline
            ? "Đường kế hoạch theo ngày đã chốt trong baseline — thấy được độ lệch so với kế hoạch gốc kể cả khi đã dời ngày"
            : "Đường kế hoạch (xám, nét đứt) nội suy từ ngày bắt đầu/kết thúc của từng task · đường thực tế tái dựng từ lịch sử cập nhật — xanh khi đạt/vượt kế hoạch, ngả vàng rồi đỏ theo mức chậm · mỗi chấm = 1 ngày"}
        </p>
      </div>
      <div className="p-4" style={{ width: "100%", height: 260 }}>
        <ResponsiveContainer>
          <LineChart data={data.points} margin={{ top: 8, right: 8, bottom: 8, left: -16 }}>
            <XAxis
              dataKey="date"
              stroke="var(--color-zinc-500)"
              fontSize={10}
              tickFormatter={fmtTick}
              minTickGap={40}
            />
            <YAxis stroke="var(--color-zinc-500)" fontSize={11} domain={[0, 100]} unit="%" />
            <Tooltip
              contentStyle={{
                background: "var(--color-zinc-900)",
                border: "1px solid var(--color-zinc-700)",
                color: "var(--foreground)",
                borderRadius: 8,
                fontSize: 12,
              }}
              labelFormatter={(d) => formatDateVN(String(d))}
              formatter={(v, name) => [`${v ?? "—"}%`, name === "planned" ? "Kế hoạch" : "Thực tế"]}
            />
            <Legend
              formatter={(v) => (v === "planned" ? "Kế hoạch" : "Thực tế")}
              wrapperStyle={{ fontSize: 12 }}
            />
            {data.today && (
              <ReferenceLine x={data.today} stroke="var(--color-amber-400)" strokeDasharray="4 4" />
            )}
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
                {actualPts.map(({ p, i }) => (
                  <stop
                    key={i}
                    offset={(i - firstIdx) / actualSpan}
                    stopColor={slipColor(p.planned, p.actual)}
                  />
                ))}
              </linearGradient>
            </defs>
            <Line
              type="monotone"
              dataKey="planned"
              stroke="var(--color-zinc-500)"
              strokeDasharray="6 4"
              dot={{ r: 1.2, fill: "var(--color-zinc-500)", stroke: "none", strokeDasharray: "" }}
              strokeWidth={2}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="actual"
              stroke={`url(#${gradId})`}
              dot={actualDot}
              strokeWidth={2.5}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
