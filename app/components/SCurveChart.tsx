"use client";
import { useEffect, useState } from "react";
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
import { diffColor } from "@/lib/chartColor";

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

// S-curve: tiến độ kế hoạch (nội suy từ ngày bắt đầu/kết thúc task)
// vs thực tế (tái dựng từ lịch sử cập nhật) — chuẩn báo cáo xây dựng.
// Chọn baseline đã chốt → đường kế hoạch dùng ngày gốc, đo được độ lệch thật khi PM dời ngày.
export default function SCurveChart({ system }: { system?: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [sheet, setSheet] = useState("");
  const [baselines, setBaselines] = useState<Baseline[]>([]);
  const [baseline, setBaseline] = useState(""); // id baseline | '' = kế hoạch hiện tại
  const [saving, setSaving] = useState(false);

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

  // Stop màu cho đường "Thực tế" theo độ lệch so với "Kế hoạch" tại từng điểm: thực tế
  // vượt/đúng kế hoạch → xanh, chậm nhẹ → vàng, chậm càng nhiều → càng ngả đỏ (lib/chartColor).
  const n = data.points.length;
  const gradientStops = data.points.map((p, i) => {
    const diff = p.actual != null && p.planned != null ? p.actual - p.planned : null;
    return { offset: `${(i / (n - 1)) * 100}%`, color: diffColor(diff) };
  });

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
            : "Đường kế hoạch nội suy từ ngày bắt đầu/kết thúc của từng task · đường thực tế tái dựng từ lịch sử cập nhật, màu theo độ lệch so với kế hoạch"}
        </p>
      </div>
      <div className="p-4" style={{ width: "100%", height: 260 }}>
        <ResponsiveContainer>
          <LineChart data={data.points} margin={{ top: 8, right: 8, bottom: 8, left: -16 }}>
            <defs>
              <linearGradient id="scurveActualStroke" x1="0" y1="0" x2="1" y2="0">
                {gradientStops.map((s, i) => (
                  <stop key={i} offset={s.offset} stopColor={s.color} />
                ))}
              </linearGradient>
            </defs>
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
            <Line
              type="monotone"
              dataKey="planned"
              stroke="var(--color-zinc-500)"
              strokeDasharray="6 4"
              dot={false}
              strokeWidth={2}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="actual"
              stroke="url(#scurveActualStroke)"
              dot={false}
              strokeWidth={2.5}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
