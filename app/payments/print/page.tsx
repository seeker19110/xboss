"use client";
import { useEffect, useState } from "react";
import { Printer } from "lucide-react";
import { fetchMe, redirectToLogin } from "@/app/lib/me";
import { formatDateDMY } from "@/lib/date";

// ── Types ──────────────────────────────────────────────────────────────────────

type BillType = "bill" | "advance" | "item";
type Bill = {
  id: number;
  responsible: string;
  type: BillType;
  period: string | null;
  amount: number;
  description: string | null;
  paidDate: string;
  note: string | null;
  unit: string | null;
  quantity: number | null;
  labor: number | null;
  floorLabel: string | null;
  sheetCode: string | null;
  workPackageName: string | null;
};
type ProjectInfo = {
  name: string | null;
  code: string | null;
  tower: string | null;
  investor: string | null;
  contractor: string | null;
  logo: string | null;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtVND(n: number) {
  if (n === 0) return "—";
  return n.toLocaleString("vi-VN");
}

// ── Print Page ─────────────────────────────────────────────────────────────────

export default function PrintPage() {
  const [bills, setBills] = useState<Bill[]>([]);
  const [project, setProject] = useState<ProjectInfo>({
    name: null,
    code: null,
    tower: null,
    investor: null,
    contractor: null,
    logo: null,
  });
  const [loading, setLoading] = useState(true);
  const [periodLabel, setPeriodLabel] = useState("");
  const [canEdit, setCanEdit] = useState(false);
  const [logo, setLogo] = useState<string | null>(null);
  const [savingLogo, setSavingLogo] = useState(false);

  // Đọc query params phía client
  const params =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search)
      : new URLSearchParams();
  const person = params.get("person") ?? "";
  const period = params.get("period") ?? "";

  useEffect(() => {
    async function load() {
      const [br, pr, me] = await Promise.all([
        fetch("/api/payments/bills"),
        fetch("/api/project"),
        fetchMe(),
      ]);
      if (br.status === 401) {
        redirectToLogin();
        return;
      }
      const { bills: all }: { bills: Bill[] } = await br.json();
      const proj: ProjectInfo = pr.ok ? await pr.json() : {};
      setCanEdit(me?.role === "admin" || me?.role === "pm");
      setLogo(proj.logo ?? null);
      // Lọc theo người + kỳ (nếu có)
      const filtered = all.filter(
        (b) => b.responsible === person && (period ? b.period === period : true),
      );
      // Sắp xếp: bill trước, item sau, advance cuối
      const order: Record<BillType, number> = { bill: 0, item: 1, advance: 2 };
      filtered.sort((a, b) => order[a.type] - order[b.type]);
      setBills(filtered);
      setProject(proj);
      setPeriodLabel(period || filtered[0]?.period || "");
      setLoading(false);
    }
    load();
  }, [person, period]);

  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center text-zinc-500 text-sm">
        Đang tải...
      </div>
    );

  const billRows = bills.filter((b) => b.type === "bill");
  const itemRows = bills.filter((b) => b.type === "item");
  const advances = bills.filter((b) => b.type === "advance");

  // Lấy ngày bill đầu tiên (hoặc hôm nay)
  const billDate = bills[0]?.paidDate ?? new Date().toISOString().slice(0, 10);

  // Tính toán
  const sumA = billRows.reduce((s, b) => s + b.amount, 0); // Section A
  const sumB = itemRows.reduce((s, b) => s + b.amount, 0); // Section B (khấu trừ)
  const gtthtc = sumA; // Tổng GT công việc hoàn thành
  const tuAmount = advances.reduce((s, b) => s + b.amount, 0); // Tạm ứng
  const gtttk = gtthtc - sumB - tuAmount; // Được TT kỳ này

  async function uploadLogo(file: File) {
    if (!file.type.startsWith("image/")) {
      alert("Chỉ nhận file ảnh");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      alert("Ảnh tối đa 2MB");
      return;
    }
    const dataUrl: string = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
    setSavingLogo(true);
    const res = await fetch("/api/project", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ logo: dataUrl }),
    });
    setSavingLogo(false);
    if (res.ok) setLogo(dataUrl);
    else alert((await res.json().catch(() => null))?.error ?? "Lưu logo thất bại");
  }

  async function removeLogo() {
    setSavingLogo(true);
    await fetch("/api/project", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ logo: null }),
    });
    setSavingLogo(false);
    setLogo(null);
  }

  // STT counter chỉ cho dòng dữ liệu thật
  let stt = 0;

  return (
    <div className="min-h-screen bg-white text-black">
      {/* Nút in — ẩn khi print */}
      <div className="print:hidden fixed top-4 right-4 z-50">
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 bg-blue-700 hover:bg-blue-600 text-white text-sm px-4 py-2 rounded-lg shadow-lg transition"
        >
          <Printer className="w-4 h-4" />
          In / Xuất PDF
        </button>
      </div>

      {/* ── Trang in ── */}
      <div
        className="print-page mx-auto px-8 py-6"
        style={{ maxWidth: 960, fontFamily: "Arial, sans-serif", fontSize: 13 }}
      >
        {/* ── Header ── */}
        <div className="flex items-start gap-6 mb-4">
          {/* Logo — bấm để tải lên (Admin/PM); in ra chỉ còn ảnh */}
          <div className="shrink-0 w-32 h-36 relative group">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt="Logo nhà thầu" className="w-full h-full object-contain" />
            ) : (
              <div className="w-full h-full flex items-center justify-center border-2 border-zinc-300 rounded text-[10px] text-zinc-400 text-center leading-tight print:border-zinc-400">
                LOGO
                <br />
                M&amp;E
                <br />
                CONTRACTOR
              </div>
            )}
            {canEdit && (
              <div className="print:hidden absolute inset-0 flex flex-col items-center justify-center gap-1 bg-white/85 opacity-0 group-hover:opacity-100 transition rounded">
                <label className="cursor-pointer text-[10px] font-semibold text-blue-700 hover:underline">
                  {savingLogo ? "Đang lưu…" : logo ? "Đổi logo" : "Tải logo"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={savingLogo}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) uploadLogo(f);
                      e.target.value = "";
                    }}
                  />
                </label>
                {logo && !savingLogo && (
                  <button onClick={removeLogo} className="text-[10px] text-red-600 hover:underline">
                    Xoá
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="flex-1 text-center">
            <h1 className="text-xl font-bold uppercase tracking-wide mb-1">
              Bảng Khối Lượng Thanh Toán
            </h1>
            <p className="text-sm">
              Công trình:{" "}
              <strong>
                {project.name ?? "..."}
                {project.tower ? ` (${project.tower})` : ""}
              </strong>
            </p>
            {project.contractor && (
              <p className="text-sm">
                Gói thầu: <strong>{project.contractor}</strong>
              </p>
            )}
            <p className="text-sm">
              Tên NTP: <strong>TỔ ĐỘI THI CÔNG {person.toUpperCase()}</strong>
            </p>
            <p className="text-sm">Ngày {formatDateDMY(billDate)}</p>
            <p className="text-sm font-bold flex items-center justify-center gap-2">
              <span>KỲ BILL THỨ:</span>
              {/* Sửa được trên màn hình, in ra chỉ còn chữ */}
              <input
                type="text"
                value={periodLabel}
                onChange={(e) => setPeriodLabel(e.target.value)}
                placeholder="VD: Đợt 1"
                className="print:hidden border border-zinc-300 rounded px-2 py-0.5 text-sm font-bold uppercase text-center w-40 focus:outline-none focus:border-blue-500"
              />
              <span className="hidden print:inline">{(periodLabel || "—").toUpperCase()}</span>
            </p>
          </div>
        </div>

        {/* ── Bảng chính ── */}
        <table
          className="w-full border-collapse text-[12px]"
          style={{ borderCollapse: "collapse" }}
        >
          <thead>
            <tr className="bg-[#4472c4] text-white text-center">
              <th className="border border-black px-1 py-2 w-10">STT</th>
              <th className="border border-black px-2 py-2 text-left">DIỄN GIẢI</th>
              <th className="border border-black px-1 py-2 w-14">ĐVT</th>
              <th className="border border-black px-1 py-2 w-20">KHỐI LƯỢNG</th>
              <th className="border border-black px-2 py-2 w-28">NHÂN CÔNG (VNĐ)</th>
              <th className="border border-black px-2 py-2 w-32">THÀNH TIỀN (VNĐ)</th>
              <th className="border border-black px-2 py-2 w-28">GHI CHÚ</th>
            </tr>
          </thead>
          <tbody>
            {/* ── Section A: Công việc hoàn thành ── */}
            <SectionHeader label="A" title="CÔNG VIỆC HOÀN THÀNH" />
            {billRows.length === 0 && (
              <tr>
                <td className="border border-black px-2 py-1.5 text-zinc-400 italic" colSpan={7}>
                  Chưa có khoản thanh toán
                </td>
              </tr>
            )}
            {billRows.map((b) => {
              stt++;
              return (
                <tr key={b.id} className="hover:bg-yellow-50">
                  <td className="border border-black px-1 py-1.5 text-center">{stt}</td>
                  <td className="border border-black px-2 py-1.5">
                    {b.description ??
                      b.workPackageName ??
                      ([b.sheetCode, b.floorLabel ? `tầng ${b.floorLabel}` : ""]
                        .filter(Boolean)
                        .join(" ") ||
                        "Thanh toán tiến độ")}
                  </td>
                  <td className="border border-black px-1 py-1.5 text-center">{b.unit ?? "LS"}</td>
                  <td className="border border-black px-1 py-1.5 text-center">
                    {b.quantity != null ? b.quantity.toLocaleString("vi-VN") : "—"}
                  </td>
                  <td className="border border-black px-2 py-1.5 text-right">
                    {b.labor != null && b.labor > 0 ? fmtVND(b.labor) : "—"}
                  </td>
                  <td className="border border-black px-2 py-1.5 text-right font-medium">
                    {fmtVND(b.amount)}
                  </td>
                  <td className="border border-black px-2 py-1.5 text-[11px]">{b.note ?? ""}</td>
                </tr>
              );
            })}

            {/* ── Section B: Chi phí khấu trừ / phát sinh ── */}
            {(itemRows.length > 0 || advances.length > 0) && (
              <SectionHeader label="B" title="CHI PHÍ KHẤU TRỪ KHÁC" />
            )}
            {itemRows.map((b) => {
              stt++;
              return (
                <tr key={b.id} className="hover:bg-yellow-50">
                  <td className="border border-black px-1 py-1.5 text-center">{stt}</td>
                  <td className="border border-black px-2 py-1.5">{b.description}</td>
                  <td className="border border-black px-1 py-1.5 text-center">{b.unit ?? "Lô"}</td>
                  <td className="border border-black px-1 py-1.5 text-center">
                    {b.quantity != null ? b.quantity.toLocaleString("vi-VN") : "—"}
                  </td>
                  <td className="border border-black px-2 py-1.5 text-right">
                    {b.labor != null && b.labor > 0 ? fmtVND(b.labor) : fmtVND(b.amount)}
                  </td>
                  <td className="border border-black px-2 py-1.5 text-right text-red-700">
                    ({fmtVND(b.amount)})
                  </td>
                  <td className="border border-black px-2 py-1.5 text-[11px]">{b.note ?? ""}</td>
                </tr>
              );
            })}

            {/* ── Dòng tổng GTTHTC ── */}
            <SummaryRow
              code="GTTHTC"
              label="TỔNG GIÁ TRỊ CÔNG VIỆC HOÀN THÀNH (CHƯA VAT)"
              unit="TC"
              value={gtthtc}
              bold
            />

            {/* ── Tiền giữ lại ── */}
            <SummaryRow code="(GL)" label="TIỀN GIỮ LẠI (NẾU CÓ)" unit="0%" value={0} />

            {/* ── Tạm ứng ── */}
            {advances.map((b, i) => (
              <tr key={b.id} className="bg-[#fff2cc]">
                <td className="border border-black px-1 py-1.5 text-center font-bold text-[11px]">
                  {i === 0 ? "(TU)" : ""}
                </td>
                <td className="border border-black px-2 py-1.5 font-bold">
                  {i === 0 ? "TẠM ỨNG" : ""}
                  {b.description ? ` — ${b.description}` : ""}
                  {b.period ? ` [${b.period}]` : ""}
                </td>
                <td className="border border-black px-1 py-1.5" />
                <td className="border border-black px-1 py-1.5" />
                <td className="border border-black px-2 py-1.5" />
                <td className="border border-black px-2 py-1.5 text-right font-semibold text-violet-700">
                  {fmtVND(b.amount)}
                </td>
                <td className="border border-black px-2 py-1.5 text-[11px]">{b.note ?? ""}</td>
              </tr>
            ))}
            {advances.length === 0 && <SummaryRow code="(TU)" label="TẠM ỨNG" value={0} />}

            {/* ── Khấu trừ tạm ứng ── */}
            <SummaryRow code="(HU)" label="KHẤU TRỪ TẠM ỨNG" unit="0%" value={tuAmount} />

            {/* ── Tổng được TT kỳ này ── */}
            <SummaryRow
              code="(GTTTK)"
              label="TỔNG GIÁ TRỊ ĐƯỢC THANH TOÁN ĐẾN KỲ NÀY"
              value={gtttk}
              bold
            />

            {/* ── Tổng đã TT kỳ trước ── */}
            <SummaryRow
              code="(GTTTKT)"
              label="TỔNG GIÁ TRỊ ĐÃ THANH TOÁN ĐẾN KỲ TRƯỚC (GỒM TẠM ỨNG)"
              value={0}
            />

            {/* ── Đề nghị TT ── */}
            <SummaryRow
              code="(DNTT)"
              label="ĐỀ NGHỊ THANH TOÁN (CÓ VAT)"
              value={gtttk}
              bold
              highlight
            />
          </tbody>
        </table>

        {/* ── Chữ ký ── */}
        <div className="mt-10 grid grid-cols-4 gap-4 text-center text-[12px]">
          {["NTP/NCC", "GS THI CÔNG", "GS QUẢN LÝ KL", "CHỈ HUY TRƯỞNG CT"].map((role) => (
            <div key={role}>
              <p className="font-bold mb-16">{role}</p>
            </div>
          ))}
        </div>
      </div>

      {/* CSS riêng cho print */}
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 10mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .print-page { max-width: 100% !important; padding: 0 !important; }
        }
      `}</style>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SectionHeader({ label, title }: { label: string; title: string }) {
  return (
    <tr className="bg-[#d9e1f2]">
      <td className="border border-black px-1 py-1.5 text-center font-bold">{label}</td>
      <td className="border border-black px-2 py-1.5 font-bold" colSpan={6}>
        {title}
      </td>
    </tr>
  );
}

function SummaryRow({
  code,
  label,
  unit,
  value,
  bold,
  highlight,
}: {
  code: string;
  label: string;
  unit?: string;
  value: number;
  bold?: boolean;
  highlight?: boolean;
}) {
  return (
    <tr className={highlight ? "bg-[#e2efda]" : "bg-[#fff2cc]"}>
      <td
        className={`border border-black px-1 py-1.5 text-center text-[11px] ${bold ? "font-bold" : ""}`}
      >
        {code}
      </td>
      <td className={`border border-black px-2 py-1.5 ${bold ? "font-bold" : ""}`}>{label}</td>
      <td className="border border-black px-1 py-1.5 text-center text-[11px]">{unit ?? ""}</td>
      <td className="border border-black px-1 py-1.5" />
      <td className="border border-black px-2 py-1.5" />
      <td
        className={`border border-black px-2 py-1.5 text-right ${bold ? "font-bold" : ""} ${highlight ? "text-green-800" : ""}`}
      >
        {fmtVND(value)}
      </td>
      <td className="border border-black px-2 py-1.5" />
    </tr>
  );
}
