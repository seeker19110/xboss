"use client";

import { useState, useEffect } from "react";
import {
  FilePlus2,
  Percent,
  Calculator,
  Plus,
  ArrowUpRight,
  Layers,
  FileCheck2,
  Sparkles,
} from "lucide-react";
import { Skeleton } from "@/app/components/Skeleton";
import { showToast } from "@/app/components/Toast";
import MaskedValue from "@/app/components/MaskedValue";
import { mSumTien } from "@/app/lib/masked";
import { HEADER_TIEN_V1, fmtDongGonMinor, minorTuWire } from "@/lib/nen/money-dto";

/** Dòng VO đọc ở decimal-string-v1 (S15): tiền là chuỗi canonical; null = API che. */
type VoTomTat = {
  id: number;
  code: string;
  title: string;
  reason: string;
  systemCode: string | null;
  status: string;
  proposedValue: string | null;
  approvedValue: string | null;
};

/** Tiền gọn (tỷ/tr/đồng) từ đồng×100 — bigint, không qua float. */
function fmtVND(v: string | bigint): string {
  const minor = typeof v === "bigint" ? v : minorTuWire(v);
  const abs = minor < 0n ? -minor : minor;
  if (minor === 0n) return "0 đ";
  return abs >= 100_000_000n ? fmtDongGonMinor(minor) : `${fmtDongGonMinor(minor)} đ`;
}

export default function VariationsTab() {
  const [variations, setVariations] = useState<VoTomTat[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    setLoading(true);
    // API trả khoá `items` (trước đây đọc nhầm `variations` → bảng luôn rỗng). S15: chọn
    // decimal-string-v1 để tổng VO lớn không dính 422 của định dạng number cũ.
    fetch("/api/variations", { headers: HEADER_TIEN_V1 })
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((data) => setVariations(data.items || []))
      .catch(() => showToast("Không tải được sổ phát sinh VO", "error"))
      .finally(() => setLoading(false));
  }, []);

  // Cộng bigint; một giá trị bị che → tổng cũng che ("•••"), không ngầm thành 0 (M50 PR2).
  const totalVoProposed = mSumTien(0n, ...variations.map((v) => v.proposedValue));
  const totalVoApproved = mSumTien(0n, ...variations.map((v) => v.approvedValue));

  return (
    <div className="space-y-6">
      {/* FIDIC Pricing Rule Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
              <Percent className="w-3.5 h-3.5 text-sky-400" /> Thứ Bậc Đơn Giá Điều 12.3 FIDIC
            </span>
            <span className="text-[10px] font-mono text-zinc-400">Valuation Hierarchy</span>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            1. Đơn giá Hợp đồng gốc → 2. Đơn giá Tương tự đã duyệt → 3. Đơn giá Chiết tính mới theo
            Thông tư 12/2021/TT-BXD.
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
              <Calculator className="w-3.5 h-3.5 text-emerald-400" /> Bù Giá GSO Đa Thành Phần
            </span>
            <span className="text-[10px] font-mono text-zinc-400">Formula Pn/P0</span>
          </div>
          <p className="text-xs font-mono text-emerald-300/90">
            Pn = P0 × (a + b·Ln/L0 + c·Mn/M0 + d·En/E0)
          </p>
          <p className="text-[11px] text-zinc-400">
            Tự động cập nhật chỉ số nhân công, vật liệu, ca máy từ Sở Xây dựng
          </p>
        </div>
      </div>

      {/* VO List Table */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
              <FilePlus2 className="w-4 h-4 text-sky-400" />
              Sổ Thay Đổi Phát Sinh (Variation Orders - VO)
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Theo dõi phát sinh chi phí, thay đổi thiết kế và phụ lục hợp đồng
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono">
            <span className="text-zinc-400">
              Đề xuất:{" "}
              <strong className="text-zinc-200">
                <MaskedValue value={totalVoProposed} format={fmtVND} />
              </strong>
            </span>
            <span className="text-zinc-600">•</span>
            <span className="text-emerald-400">
              Đã duyệt:{" "}
              <strong>
                <MaskedValue value={totalVoApproved} format={fmtVND} />
              </strong>
            </span>
          </div>
        </div>

        {loading ? (
          <Skeleton className="h-48 rounded-xl" />
        ) : variations.length === 0 ? (
          <div className="text-center py-12 text-zinc-500 text-xs">
            Chưa có phiếu phát sinh VO nào được ghi nhận.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-400 font-medium">
                  <th className="py-2.5 px-3">Mã VO</th>
                  <th className="py-2.5 px-3">Nội Dung Thay Đổi / Lý Do</th>
                  <th className="py-2.5 px-3 text-right">Giá Trị Đề Xuất</th>
                  <th className="py-2.5 px-3 text-right">Giá Trị Duyệt</th>
                  <th className="py-2.5 px-3 text-center">Trạng Thái</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {variations.map((vo) => (
                  <tr key={vo.id} className="hover:bg-zinc-900/40 transition">
                    <td className="py-3 px-3 font-mono font-bold text-zinc-200">{vo.code}</td>
                    <td className="py-3 px-3">
                      <div className="font-semibold text-zinc-200">{vo.title}</div>
                      <div className="text-[11px] text-zinc-500">
                        {vo.reason} • Hệ: {vo.systemCode || "Chung"}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-zinc-300">
                      <MaskedValue value={vo.proposedValue} format={fmtVND} />
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-semibold text-emerald-400">
                      <MaskedValue value={vo.approvedValue} format={fmtVND} />
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          vo.status === "approved" || vo.status === "contract_added"
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                            : vo.status === "submitted"
                              ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                              : "bg-zinc-800 text-zinc-300"
                        }`}
                      >
                        {vo.status === "approved"
                          ? "Đã duyệt"
                          : vo.status === "contract_added"
                            ? "Vào Phụ Lục HĐ"
                            : vo.status === "submitted"
                              ? "Đang trình"
                              : "Nháp"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
