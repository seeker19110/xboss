"use client";
import { useEffect, useState } from "react";
import { LineChart as LineChartIcon } from "lucide-react";
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
import EditableText from "@/app/components/EditableText";
import { formatVnd } from "@/lib/money";
import { formatDateVN } from "@/lib/date";

type Point = { date: string; pv: number | null; ev: number | null; ac: number | null };
type Summary = {
  hasValues: boolean;
  valuedTasks: number;
  totalTasks: number;
  bac: number | null;
  pv: number | null;
  ev: number | null;
  ac: number;
  sv: number | null;
  cv: number | null;
  spi: number | null;
  cpi: number | null;
  eac: number | null;
  etc: number | null;
  vac: number | null;
};
type Data = { series: Point[]; summary: Summary | null; today?: string };
type Baseline = { id: number; name: string };

// Màu theo ngưỡng chỉ số (SPI/CPI): ≥1 tốt, 0.9–1 hơi lệch, <0.9 lệch đáng kể —
// cùng thang với SpiCards, kèm nhãn chữ để không truyền tải chỉ bằng màu.
function tone(v: number | null, goodLabel: string, warnLabel: string, badLabel: string) {
  if (v === null)
    return { text: "text-zinc-400", ring: "border-zinc-800", label: "Chưa đủ dữ liệu" };
  if (v >= 1) return { text: "text-emerald-400", ring: "border-emerald-500/30", label: goodLabel };
  if (v >= 0.9) return { text: "text-amber-400", ring: "border-amber-500/30", label: warnLabel };
  return { text: "text-rose-400", ring: "border-rose-500/30", label: badLabel };
}

// Trục tiền gọn: 1.234.000.000 → "1,23 tỷ", 5.600.000 → "5,6 tr".
function fmtShortVnd(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${(n / 1e9).toLocaleString("vi-VN", { maximumFractionDigits: 2 })} tỷ`;
  if (abs >= 1e6) return `${(n / 1e6).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} tr`;
  return n.toLocaleString("vi-VN");
}

const fmtTick = (d: string) => {
  const dt = new Date(d);
  return `${dt.getDate()}/${dt.getMonth() + 1}`;
};

const LINE_LABELS: Record<string, string> = {
  pv: "Kế hoạch (PV)",
  ev: "Giá trị đạt (EV)",
  ac: "Thực chi (AC)",
};

// EVM (M47): 3 đường PV/EV/AC theo giá trị BOQ + card SPI/CPI/EAC. Chỉ role tài chính
// (admin/pm/bch) — API trả 403 cho role khác nên component tự ẩn.
export default function EvmChart({ system }: { system?: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [visible, setVisible] = useState(true);
  const [baselines, setBaselines] = useState<Baseline[]>([]);
  const [baseline, setBaseline] = useState(""); // id baseline | '' = kế hoạch hiện tại

  useEffect(() => {
    fetch("/api/baselines")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setBaselines(j?.baselines ?? []));
  }, []);

  useEffect(() => {
    const qs = new URLSearchParams();
    if (baseline) qs.set("baseline", baseline);
    if (system) qs.set("system", system);
    const s = qs.toString();
    fetch(`/api/dashboard/evm${s ? `?${s}` : ""}`).then(async (r) => {
      if (!r.ok) {
        setVisible(false); // 401/403 — role không xem được chỉ số tiền
        return;
      }
      setData(await r.json());
    });
  }, [baseline, system]);

  if (!visible || !data?.summary) return null;
  const s = data.summary;

  // Chưa map BOQ vào task → không có trọng số giá trị, chỉ hiện hướng dẫn ngắn.
  if (!s.hasValues)
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-8">
        <h2 className="font-semibold text-sm text-zinc-300 flex items-center gap-2">
          <LineChartIcon className="w-4 h-4 text-violet-400" />{" "}
          <EditableText tkey="evm.title">EVM: Giá trị đạt (PV/EV/AC)</EditableText>
        </h2>
        <p className="text-xs text-zinc-400 mt-2">
          Chưa có task nào gắn giá trị BOQ — vào trang BOQ, map dòng BOQ (có đơn giá) vào task để
          tính EVM (SPI/CPI/EAC theo tiền).
        </p>
      </div>
    );

  const spiTone = tone(s.spi, "Đúng/vượt tiến độ", "Hơi chậm", "Chậm đáng kể");
  const cpiTone = tone(s.cpi, "Trong ngân sách", "Sát ngân sách", "Vượt chi");

  return (
    <div className="chart-vivid bg-zinc-900 border border-zinc-800 rounded-xl mb-8">
      <div className="flex items-center gap-2 flex-wrap p-4 border-b border-zinc-800">
        <h2 className="font-semibold text-sm text-zinc-300 flex items-center gap-2">
          <LineChartIcon className="w-4 h-4 text-violet-400" />{" "}
          <EditableText tkey="evm.title">EVM: Giá trị đạt (PV/EV/AC)</EditableText>
        </h2>
        <div className="ml-auto flex items-center gap-2">
          <select
            value={baseline}
            onChange={(e) => setBaseline(e.target.value)}
            aria-label="Chọn baseline cho đường kế hoạch EVM"
            className="bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1 text-xs outline-none text-zinc-300"
          >
            <option value="">Kế hoạch hiện tại</option>
            {baselines.map((b) => (
              <option key={b.id} value={b.id}>
                📌 {b.name}
              </option>
            ))}
          </select>
        </div>
        <p className="text-xs text-zinc-400 w-full">
          PV = giá trị kế hoạch tại từng ngày · EV = giá trị công việc đã làm · AC = thực chi. SPI
          &lt; 1 chậm tiến độ, CPI &lt; 1 vượt chi, EAC = dự báo tổng chi khi hoàn thành.
          {s.valuedTasks < s.totalTasks && (
            <>
              {" "}
              Trọng số theo BOQ — {s.totalTasks - s.valuedTasks}/{s.totalTasks} task chưa có giá
              trị, tính bằng trung bình các task đã có.
            </>
          )}
        </p>
      </div>

      <div
        className={`grid grid-cols-2 lg:grid-cols-4 gap-3 p-4${data.series.length >= 2 ? " pb-0" : ""}`}
      >
        <div className={`bg-zinc-950/60 border ${spiTone.ring} rounded-lg p-3`}>
          <p className="text-xs text-zinc-400 uppercase mb-1">SPI (tiến độ)</p>
          <p className={`text-2xl font-bold ${spiTone.text}`}>
            {s.spi === null ? "—" : s.spi.toFixed(2)}
          </p>
          <p className={`text-[11px] mt-1 font-medium ${spiTone.text}`}>{spiTone.label}</p>
        </div>
        <div className={`bg-zinc-950/60 border ${cpiTone.ring} rounded-lg p-3`}>
          <p className="text-xs text-zinc-400 uppercase mb-1">CPI (chi phí)</p>
          <p className={`text-2xl font-bold ${cpiTone.text}`}>
            {s.cpi === null ? "—" : s.cpi.toFixed(2)}
          </p>
          <p className={`text-[11px] mt-1 font-medium ${cpiTone.text}`}>{cpiTone.label}</p>
        </div>
        <div className="bg-zinc-950/60 border border-zinc-800 rounded-lg p-3">
          <p className="text-xs text-zinc-400 uppercase mb-1">EAC (dự báo tổng chi)</p>
          <p className="text-2xl font-bold text-zinc-200">
            {s.eac === null ? "—" : fmtShortVnd(s.eac)}
          </p>
          <p className="text-[11px] text-zinc-400 mt-1">
            Ngân sách (BAC) {s.bac === null ? "—" : fmtShortVnd(s.bac)}
            {s.vac !== null && (
              <span className={s.vac < 0 ? " text-rose-400 font-medium" : " text-emerald-400"}>
                {" "}
                · lệch {fmtShortVnd(s.vac)}
              </span>
            )}
          </p>
        </div>
        <div className="bg-zinc-950/60 border border-zinc-800 rounded-lg p-3">
          <p className="text-xs text-zinc-400 uppercase mb-1">Đã chi (AC)</p>
          <p className="text-2xl font-bold text-zinc-200">{fmtShortVnd(s.ac)}</p>
          <p className="text-[11px] text-zinc-400 mt-1">
            EV {s.ev === null ? "—" : fmtShortVnd(s.ev)}
            {s.cv !== null && (
              <span className={s.cv < 0 ? " text-rose-400 font-medium" : " text-emerald-400"}>
                {" "}
                · CV {fmtShortVnd(s.cv)}
              </span>
            )}
          </p>
        </div>
      </div>

      {data.series.length >= 2 && (
        <div className="p-4" style={{ width: "100%", height: 260 }}>
          <ResponsiveContainer>
            <LineChart data={data.series} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <XAxis
                dataKey="date"
                stroke="var(--color-zinc-500)"
                fontSize={10}
                tickFormatter={fmtTick}
                minTickGap={40}
              />
              <YAxis
                stroke="var(--color-zinc-500)"
                fontSize={10}
                tickFormatter={fmtShortVnd}
                width={64}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--color-zinc-900)",
                  border: "1px solid var(--color-zinc-700)",
                  color: "var(--foreground)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                labelFormatter={(d) => formatDateVN(String(d))}
                formatter={(v, name) => [
                  v == null ? "—" : formatVnd(Number(v)),
                  LINE_LABELS[String(name)] ?? String(name),
                ]}
              />
              <Legend formatter={(v) => LINE_LABELS[v] ?? v} wrapperStyle={{ fontSize: 12 }} />
              {data.today && (
                <ReferenceLine
                  x={data.today}
                  stroke="var(--color-amber-400)"
                  strokeDasharray="4 4"
                />
              )}
              <Line
                type="monotone"
                dataKey="pv"
                stroke="var(--color-zinc-500)"
                strokeDasharray="6 4"
                dot={false}
                strokeWidth={2}
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="ev"
                stroke="var(--color-emerald-400)"
                dot={false}
                strokeWidth={2.5}
              />
              <Line
                type="monotone"
                dataKey="ac"
                stroke="var(--color-rose-400)"
                dot={false}
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
