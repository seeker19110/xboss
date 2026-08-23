"use client";

import { Dispatch, SetStateAction } from "react";
import { Layers, Boxes, Sparkles, Check, Split, Activity, Zap, Loader2 } from "lucide-react";
import type { SaveConfig, Step1SubTab } from "../types";

// Thanh điều hướng 2 bước (Bước 1 Studio chuẩn hóa / Bước 2 Đặt tên ISO 19650)
// kèm 4 sub-tab của Bước 1.

// Nhãn hiển thị chung khi đang xử lý chuẩn hóa (không còn thanh % giả lập)
const HEALING_LABEL = "Đang xử lý…";

interface StepTabsNavProps {
  activeStep: 1 | 2;
  setActiveStep: Dispatch<SetStateAction<1 | 2>>;
  step1SubTab: Step1SubTab;
  setStep1SubTab: Dispatch<SetStateAction<Step1SubTab>>;
  isAutoHealing: boolean;
  healCompleted: boolean;
  saveConfig: SaveConfig;
  totalHealthScore: number;
  triggerAutoHealWithProgress: () => void;
}

export default function StepTabsNav({
  activeStep,
  setActiveStep,
  step1SubTab,
  setStep1SubTab,
  isAutoHealing,
  healCompleted,
  saveConfig,
  totalHealthScore,
  triggerAutoHealWithProgress,
}: StepTabsNavProps) {
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* BƯỚC 1: STUDIO CHUẨN HÓA TOÀN DIỆN */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => {
            setActiveStep(1);
            if (!isAutoHealing) {
              triggerAutoHealWithProgress();
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              setActiveStep(1);
              if (!isAutoHealing) triggerAutoHealWithProgress();
            }
          }}
          className={`relative overflow-hidden p-4 rounded-2xl border text-left transition-all cursor-pointer select-none group ${
            activeStep === 1
              ? "bg-amber-500/15 border-amber-500 text-amber-300 shadow-md ring-1 ring-amber-500/30"
              : "bg-zinc-900/80 border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200"
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3.5">
              <span
                className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-black transition-all shrink-0 ${
                  isAutoHealing
                    ? "bg-amber-500 text-zinc-950 shadow-md animate-pulse"
                    : healCompleted || totalHealthScore >= 90
                      ? "bg-emerald-500 text-zinc-950 shadow-sm"
                      : activeStep === 1
                        ? "bg-amber-500 text-zinc-950 shadow-sm"
                        : "bg-zinc-800 text-zinc-300"
                }`}
              >
                {isAutoHealing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : healCompleted || totalHealthScore >= 90 ? (
                  <Check className="w-4 h-4 stroke-[3]" />
                ) : (
                  "1"
                )}
              </span>
              <div>
                <div className="text-xs sm:text-sm font-bold uppercase tracking-wide text-zinc-100 flex items-center gap-2 flex-wrap">
                  <span>Bước 1: Studio Chuẩn Hóa Bản Vẽ CAD 2D</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold flex items-center gap-1 transition ${
                      isAutoHealing
                        ? "bg-amber-500 text-zinc-950 shadow-sm animate-pulse"
                        : "bg-amber-500/20 text-amber-400 group-hover:bg-amber-500/30"
                    }`}
                  >
                    {isAutoHealing ? (
                      <>
                        <Loader2 className="w-2.5 h-2.5 animate-spin" />
                        <span>{HEALING_LABEL}</span>
                      </>
                    ) : (
                      <>
                        <Zap className="w-2.5 h-2.5" />
                        <span>1-Chạm Auto</span>
                      </>
                    )}
                  </span>
                </div>
                <div className="text-xs text-zinc-400 mt-0.5 line-clamp-1">
                  {isAutoHealing ? (
                    <span className="text-amber-400 font-medium flex items-center gap-1.5">
                      <Sparkles className="w-3 h-3 animate-spin shrink-0" />
                      {HEALING_LABEL}
                    </span>
                  ) : (
                    "Tự động dọn rác, WCS 2D (X,Y), sửa font UTF-8, layer AIA, sửa Dim đo thực & Block BOQ"
                  )}
                </div>
              </div>
            </div>
            <div className="text-right shrink-0">
              {isAutoHealing ? (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/40 text-xs font-mono font-bold animate-pulse">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>{HEALING_LABEL}</span>
                </div>
              ) : (
                <span
                  className={`text-xs font-mono font-bold px-2.5 py-1 rounded-lg ${
                    healCompleted || totalHealthScore >= 90
                      ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                      : "bg-zinc-800 text-zinc-400"
                  }`}
                >
                  {healCompleted || totalHealthScore >= 90
                    ? "100/100 ✓"
                    : `${totalHealthScore}/100 ✓`}
                </span>
              )}
            </div>
          </div>

          {/* Trạng thái đang xử lý ngay phía dưới (không còn thanh % giả lập) */}
          {isAutoHealing && (
            <div className="mt-3 pt-2.5 border-t border-amber-500/20 animate-in fade-in duration-200">
              <span className="text-amber-300 font-medium flex items-center gap-1.5 text-[11px] font-mono">
                <Sparkles className="w-3 h-3 text-amber-400 animate-spin shrink-0" />
                {HEALING_LABEL}
              </span>
            </div>
          )}

          {/* Đường viền đáy phát sáng khi hoàn thành */}
          {healCompleted && !isAutoHealing && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-500" />
          )}
        </div>

        {/* BƯỚC 2: ĐẶT TÊN CHUẨN ISO & LƯU TRỮ DỰ ÁN */}
        <button
          onClick={() => setActiveStep(2)}
          className={`p-4 rounded-2xl border text-left transition flex items-center justify-between gap-3 ${
            activeStep === 2
              ? "bg-emerald-500/15 border-emerald-500 text-emerald-300 shadow-md ring-1 ring-emerald-500/30"
              : "bg-zinc-900/80 border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200"
          }`}
        >
          <div className="flex items-center gap-3.5">
            <span
              className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-black ${
                activeStep === 2
                  ? "bg-emerald-500 text-zinc-950 shadow-sm"
                  : "bg-zinc-800 text-zinc-300"
              }`}
            >
              2
            </span>
            <div>
              <div className="text-xs sm:text-sm font-bold uppercase tracking-wide text-zinc-100 flex items-center gap-2">
                <span>Bước 2: Đặt Tên Chuẩn ISO & Lưu Trữ Dự Án</span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-mono font-bold">
                  ISO 19650
                </span>
              </div>
              <div className="text-xs text-zinc-400 mt-0.5">
                Lưu vào drawings/{saveConfig.systems}/... & tải Trọn Bộ Master Pack
              </div>
            </div>
          </div>
          <div className="text-right shrink-0">
            <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              drawings/ ✓
            </span>
          </div>
        </button>
      </div>

      {/* SUB-TABS INSPECTOR CHO BƯỚC 1 */}
      {activeStep === 1 && (
        <div className="space-y-4">
          <div className="flex items-center gap-1.5 p-1.5 rounded-2xl bg-zinc-900/90 border border-zinc-800 overflow-x-auto scrollbar-none">
            <button
              onClick={() => setStep1SubTab("diagnostic_purge")}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition shrink-0 ${
                step1SubTab === "diagnostic_purge"
                  ? "bg-amber-500 text-zinc-950 font-bold shadow-xs"
                  : "bg-zinc-800/70 text-zinc-300 hover:text-white"
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>1. Chẩn Đoán & WCS 2D (X, Y)</span>
            </button>

            <button
              onClick={() => setStep1SubTab("layers_font")}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition shrink-0 ${
                step1SubTab === "layers_font"
                  ? "bg-amber-500 text-zinc-950 font-bold shadow-xs"
                  : "bg-zinc-800/70 text-zinc-300 hover:text-white"
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>2. Layer AIA & Bác Sĩ Font UTF-8</span>
            </button>

            <button
              onClick={() => setStep1SubTab("boq_dim_ctb")}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition shrink-0 ${
                step1SubTab === "boq_dim_ctb"
                  ? "bg-amber-500 text-zinc-950 font-bold shadow-xs"
                  : "bg-zinc-800/70 text-zinc-300 hover:text-white"
              }`}
            >
              <Boxes className="w-3.5 h-3.5" />
              <span>3. Block BOQ, Sửa Dim & Nét In</span>
            </button>

            <button
              onClick={() => setStep1SubTab("xref_diff_lisp")}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition shrink-0 ${
                step1SubTab === "xref_diff_lisp"
                  ? "bg-sky-500 text-zinc-950 font-bold shadow-xs"
                  : "bg-zinc-800/70 text-zinc-300 hover:text-white"
              }`}
            >
              <Split className="w-3.5 h-3.5 text-sky-400" />
              <span>4. Cây XREF, So Sánh Diff & AutoLISP 2D</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
