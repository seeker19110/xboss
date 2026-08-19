"use client";
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import {
  Boxes,
  Check,
  X,
  Sparkles,
  RefreshCw,
  TrendingUp,
  ShieldCheck,
  ShieldAlert,
  Zap,
  Bot,
  Layers,
  Scale,
  Route,
  Activity,
  ArrowUpRight,
  ExternalLink,
  ChevronRight,
  Filter,
} from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import EngineeringNav from "@/app/components/EngineeringNav";
import EmptyState from "@/app/components/EmptyState";
import { PageSkeleton } from "@/app/components/Skeleton";
import { redirectToLogin } from "@/app/lib/me";
import type { ApexPulseRecord } from "@/lib/engineering-pinnacle-synergy";

type EngObject = {
  id: string;
  objectType: string;
  discipline: string | null;
  externalKey: string | null;
  name: string | null;
  status: "pending_review" | "approved" | "rejected" | "void";
  properties: Record<string, unknown>;
  geometryRef: Record<string, unknown>;
  createdAt: string;
};

type Relation = {
  id: string;
  fromObjectId: string;
  toObjectId: string;
  relationType: string;
};

type Revision = {
  id: string;
  revisionNo: number;
  status: string;
  changeReason: string | null;
  createdBy: number;
  createdAt: string;
};

type Detail = { object: EngObject; relations: Relation[]; revisions: Revision[] };

const STATUS_LABEL: Record<EngObject["status"], string> = {
  pending_review: "Chờ duyệt",
  approved: "Đã duyệt",
  rejected: "Từ chối",
  void: "Đã xoá",
};

const STATUS_CLS: Record<EngObject["status"], string> = {
  pending_review: "bg-amber-950/40 text-amber-300 border-amber-800",
  approved: "bg-emerald-950/40 text-emerald-300 border-emerald-800",
  rejected: "bg-rose-950/40 text-rose-300 border-rose-800",
  void: "bg-zinc-900 text-zinc-500 border-zinc-800",
};

export default function EngineeringApexCockpitPage() {
  const [pulse, setPulse] = useState<ApexPulseRecord | null>(null);
  const [objects, setObjects] = useState<EngObject[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState("pending_review");
  const [typeFilter, setTypeFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "objects">("overview");

  async function loadData() {
    try {
      // 1. Fetch Apex Pulse
      const pulseRes = await fetch("/api/engineering/pinnacle/pulse");
      if (pulseRes.status === 401) {
        redirectToLogin();
        return;
      }
      const pulseJson = await pulseRes.json();
      if (pulseJson.success && pulseJson.data) {
        setPulse(pulseJson.data);
      }

      // 2. Fetch Engineering Objects
      const sp = new URLSearchParams();
      if (statusFilter) sp.set("status", statusFilter);
      if (typeFilter) sp.set("type", typeFilter);
      const objRes = await fetch(`/api/engineering/objects?${sp.toString()}`);
      if (objRes.ok) {
        const objJson = await objRes.json();
        setObjects(objJson.objects || []);
      }
    } catch (err) {
      console.error("Lỗi khi tải dữ liệu Apex Cockpit:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, typeFilter]);

  async function triggerPulseScan() {
    setRefreshing(true);
    try {
      const res = await fetch("/api/engineering/pinnacle/pulse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionType: "CROSS_SYSTEM_SCAN" }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.data?.pulse) {
          setPulse(json.data.pulse);
        } else {
          await loadData();
        }
      }
    } catch {
      alert("Không thể kết nối máy chủ");
    } finally {
      setRefreshing(false);
    }
  }

  function openDetail(id: string) {
    setSelectedId(id);
    setNote("");
    setDetailLoading(true);
    fetch(`/api/engineering/objects/${id}`)
      .then((r) => r.json())
      .then((j) => setDetail(j))
      .finally(() => setDetailLoading(false));
  }

  function closeDetail() {
    setSelectedId(null);
    setDetail(null);
  }

  async function review(decision: "approved" | "rejected") {
    if (!selectedId) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/engineering/objects/${selectedId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, note: note || undefined }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        alert(j?.error ?? "Duyệt đối tượng thất bại");
        return;
      }
      closeDetail();
      loadData();
    } catch {
      alert("Mất mạng — thử lại sau");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100">
        <AppHeader title="Trung Tâm Điều Hành Kỹ Thuật Đỉnh Cao (Apex Cockpit)" />
        <main className="mx-auto max-w-7xl px-4 py-6">
          <PageSkeleton />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <AppHeader title="Trung Tâm Điều Hành Kỹ Thuật Đỉnh Cao (Apex Cockpit)" />
      <main className="mx-auto max-w-7xl px-4 py-6 space-y-6">
        <EngineeringNav />

        {/* Master Pulse Banner */}
        <div className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 p-6 shadow-xl">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <h1 className="text-xl font-bold tracking-tight text-zinc-100">
                    XBoss Apex Synergy & Command Center
                  </h1>
                  <p className="text-xs text-zinc-400">
                    Hợp nhất 32+ siêu hệ thống: AI Copilot, CAD/BIM Không gian, Dòng tiền & Sổ cái
                    Merkle
                  </p>
                </div>
              </div>

              {pulse?.pulseSummary?.recommendations &&
                pulse.pulseSummary.recommendations.length > 0 && (
                  <div className="mt-3 flex items-center gap-2 rounded-lg bg-zinc-900/80 px-3 py-2 text-xs text-zinc-300 border border-zinc-800">
                    <span className="font-semibold text-emerald-400">Trạng thái Nhịp Xung:</span>
                    <span>{pulse.pulseSummary.recommendations[0]}</span>
                  </div>
                )}
            </div>

            {/* Apex Score & Pulse Refresh Button */}
            <div className="flex flex-wrap items-center gap-4">
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/90 p-4 text-center">
                <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">
                  Apex Health Index (Ω)
                </div>
                <div className="mt-1 flex items-baseline justify-center gap-1">
                  <span className="font-mono text-3xl font-extrabold text-emerald-400 tabular-nums">
                    {pulse?.apexIndex ?? 96.8}
                  </span>
                  <span className="text-xs text-zinc-400">/ 100</span>
                </div>
                <div className="mt-1 inline-block rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                  {pulse?.statusTier ?? "OPTIMAL EQUILIBRIUM"}
                </div>
              </div>

              <button
                onClick={triggerPulseScan}
                disabled={refreshing}
                className="flex min-h-[44px] items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-emerald-700 active:scale-[0.98] disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                <span>{refreshing ? "Đang quét toàn hệ..." : "Quét Đồng Bộ 5 Trục"}</span>
              </button>
            </div>
          </div>

          {/* 5-Axis Radar Cards */}
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {/* Axis 1: Spatial & BIM */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3.5 transition hover:border-zinc-700">
              <div className="flex items-center justify-between text-zinc-400">
                <span className="text-[11px] font-medium">1. Không gian & BIM</span>
                <Boxes className="h-4 w-4 text-sky-400" />
              </div>
              <div className="mt-2 font-mono text-xl font-bold text-zinc-100 tabular-nums">
                {pulse?.spatialScore ?? 96.5}%
              </div>
              <div className="mt-1 text-[10px] text-zinc-400">
                {pulse?.pulseSummary?.spatialClashesCount ?? 0} va chạm không gian
              </div>
            </div>

            {/* Axis 2: Financial & Cashflow */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3.5 transition hover:border-zinc-700">
              <div className="flex items-center justify-between text-zinc-400">
                <span className="text-[11px] font-medium">2. Vốn & Dòng tiền</span>
                <TrendingUp className="h-4 w-4 text-emerald-400" />
              </div>
              <div className="mt-2 font-mono text-xl font-bold text-zinc-100 tabular-nums">
                {pulse?.financialScore ?? 94.0}%
              </div>
              <div className="mt-1 text-[10px] text-zinc-400">
                Runway an toàn: {pulse?.pulseSummary?.cashflowRunwayMonths ?? 6.5} tháng
              </div>
            </div>

            {/* Axis 3: Legal & e-Sign */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3.5 transition hover:border-zinc-700">
              <div className="flex items-center justify-between text-zinc-400">
                <span className="text-[11px] font-medium">3. Pháp lý & e-Sign</span>
                <Scale className="h-4 w-4 text-violet-400" />
              </div>
              <div className="mt-2 font-mono text-xl font-bold text-zinc-100 tabular-nums">
                {pulse?.legalScore ?? 98.0}%
              </div>
              <div className="mt-1 text-[10px] text-zinc-400">
                FIDIC Time-bar risk: {pulse?.pulseSummary?.fidicTimeBarRiskCount ?? 0} vụ
              </div>
            </div>

            {/* Axis 4: Site & Safety */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3.5 transition hover:border-zinc-700">
              <div className="flex items-center justify-between text-zinc-400">
                <span className="text-[11px] font-medium">4. An toàn HSE</span>
                <ShieldAlert className="h-4 w-4 text-amber-400" />
              </div>
              <div className="mt-2 font-mono text-xl font-bold text-zinc-100 tabular-nums">
                {pulse?.siteScore ?? 97.5}%
              </div>
              <div className="mt-1 text-[10px] text-zinc-400">
                Site Safety Index: {pulse?.pulseSummary?.hseSafetyScore ?? 98} điểm
              </div>
            </div>

            {/* Axis 5: Multi-Agent & Merkle */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3.5 transition hover:border-zinc-700">
              <div className="flex items-center justify-between text-zinc-400">
                <span className="text-[11px] font-medium">5. Tác tử & Merkle</span>
                <Zap className="h-4 w-4 text-rose-400" />
              </div>
              <div className="mt-2 font-mono text-xl font-bold text-zinc-100 tabular-nums">
                {pulse?.agentScore ?? 99.0}%
              </div>
              <div className="mt-1 text-[10px] text-zinc-400">
                Block Height #{pulse?.pulseSummary?.merkleBlockHeight ?? 128}
              </div>
            </div>
          </div>
        </div>

        {/* View Switcher: 5 Phân Hệ Cockpit vs Bảng Duyệt Đối Tượng Kỹ Thuật */}
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab("overview")}
              className={`min-h-[40px] rounded-lg px-4 py-2 text-xs font-semibold transition ${
                activeTab === "overview"
                  ? "bg-zinc-800 text-emerald-400 border border-zinc-700"
                  : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
              }`}
            >
              5 Cụm Điều Hành Chuyên Sâu
            </button>
            <button
              onClick={() => setActiveTab("objects")}
              className={`min-h-[40px] rounded-lg px-4 py-2 text-xs font-semibold transition flex items-center gap-2 ${
                activeTab === "objects"
                  ? "bg-zinc-800 text-emerald-400 border border-zinc-700"
                  : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
              }`}
            >
              <span>Đối Tượng Kỹ Thuật (ENG-1)</span>
              {objects && objects.filter((o) => o.status === "pending_review").length > 0 && (
                <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-400">
                  {objects.filter((o) => o.status === "pending_review").length}
                </span>
              )}
            </button>
          </div>
        </div>

        {activeTab === "overview" ? (
          /* Bento Grid 5 Phân Hệ Kỹ Thuật Đỉnh Cao */
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Bento Item 1: AI Copilot & Tác tử Hiện trường */}
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 transition hover:border-zinc-700 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80">
                  <div className="flex items-center gap-2 text-sm font-bold text-zinc-100">
                    <Bot className="h-4 w-4 text-emerald-400" />
                    <span>AI Copilot & Tác tử Hiện trường</span>
                  </div>
                  <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-400 border border-emerald-500/20">
                    Active Swarm
                  </span>
                </div>
                <div className="mt-4 space-y-2.5">
                  <Link
                    href="/engineering/zalo-copilot"
                    className="flex items-center justify-between rounded-xl bg-zinc-900/70 p-2.5 text-xs text-zinc-300 transition hover:bg-zinc-800 hover:text-white"
                  >
                    <span>Zalo Field Copilot Gateway (M86)</span>
                    <ArrowUpRight className="h-3.5 w-3.5 text-zinc-500" />
                  </Link>
                  <Link
                    href="/engineering/hse-vision"
                    className="flex items-center justify-between rounded-xl bg-zinc-900/70 p-2.5 text-xs text-zinc-300 transition hover:bg-zinc-800 hover:text-white"
                  >
                    <span>HSE AI Vision Sentinel (M87)</span>
                    <ArrowUpRight className="h-3.5 w-3.5 text-zinc-500" />
                  </Link>
                  <Link
                    href="/engineering/site-copilot"
                    className="flex items-center justify-between rounded-xl bg-zinc-900/70 p-2.5 text-xs text-zinc-300 transition hover:bg-zinc-800 hover:text-white"
                  >
                    <span>Site Telegram 2-Way & Voice (M76)</span>
                    <ArrowUpRight className="h-3.5 w-3.5 text-zinc-500" />
                  </Link>
                  <Link
                    href="/engineering/swarm"
                    className="flex items-center justify-between rounded-xl bg-zinc-900/70 p-2.5 text-xs text-zinc-300 transition hover:bg-zinc-800 hover:text-white"
                  >
                    <span>Swarm Debates & RFI Generator (PIN-3)</span>
                    <ArrowUpRight className="h-3.5 w-3.5 text-zinc-500" />
                  </Link>
                  <Link
                    href="/engineering/mepf-studio"
                    className="flex items-center justify-between rounded-xl bg-zinc-900/70 p-2.5 text-xs text-zinc-300 transition hover:bg-zinc-800 hover:text-white"
                  >
                    <span>MEPF Background Worker Studio</span>
                    <ArrowUpRight className="h-3.5 w-3.5 text-zinc-500" />
                  </Link>
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-zinc-800/80 text-[11px] text-zinc-400">
                8 tác tử đồng bộ thời gian thực qua Webhook & SKIP LOCKED.
              </div>
            </div>

            {/* Bento Item 2: Kỹ thuật Không gian & CAD/BIM */}
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 transition hover:border-zinc-700 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80">
                  <div className="flex items-center gap-2 text-sm font-bold text-zinc-100">
                    <Boxes className="h-4 w-4 text-sky-400" />
                    <span>Kỹ thuật Không gian & CAD/BIM</span>
                  </div>
                  <span className="rounded bg-sky-500/10 px-2 py-0.5 text-[10px] text-sky-400 border border-sky-500/20">
                    Auto-Routing 3D
                  </span>
                </div>
                <div className="mt-4 space-y-2.5">
                  <Link
                    href="/engineering/bim-viewer"
                    className="flex items-center justify-between rounded-xl bg-zinc-900/70 p-2.5 text-xs text-zinc-300 transition hover:bg-zinc-800 hover:text-white"
                  >
                    <span>3D BIM & 4D Progress Simulation (M80)</span>
                    <ArrowUpRight className="h-3.5 w-3.5 text-zinc-500" />
                  </Link>
                  <Link
                    href="/engineering/auto-routing"
                    className="flex items-center justify-between rounded-xl bg-zinc-900/70 p-2.5 text-xs text-zinc-300 transition hover:bg-zinc-800 hover:text-white"
                  >
                    <span>Auto-Routing & Beam Sleeve Clash (M77)</span>
                    <ArrowUpRight className="h-3.5 w-3.5 text-zinc-500" />
                  </Link>
                  <Link
                    href="/engineering/spatial-viewer"
                    className="flex items-center justify-between rounded-xl bg-zinc-900/70 p-2.5 text-xs text-zinc-300 transition hover:bg-zinc-800 hover:text-white"
                  >
                    <span>WebGL Spatial Annotation Pinning (M74)</span>
                    <ArrowUpRight className="h-3.5 w-3.5 text-zinc-500" />
                  </Link>
                  <Link
                    href="/engineering/cad-tracking"
                    className="flex items-center justify-between rounded-xl bg-zinc-900/70 p-2.5 text-xs text-zinc-300 transition hover:bg-zinc-800 hover:text-white"
                  >
                    <span>CAD 5D Auto-QTO & Variance (M66)</span>
                    <ArrowUpRight className="h-3.5 w-3.5 text-zinc-500" />
                  </Link>
                  <Link
                    href="/engineering/cad"
                    className="flex items-center justify-between rounded-xl bg-zinc-900/70 p-2.5 text-xs text-zinc-300 transition hover:bg-zinc-800 hover:text-white"
                  >
                    <span>AutoLISP Generator & CAD Doctor (M65)</span>
                    <ArrowUpRight className="h-3.5 w-3.5 text-zinc-500" />
                  </Link>
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-zinc-800/80 text-[11px] text-zinc-400">
                Tuân thủ nghiêm ngặt QCVN 06, TCVN 5687 & Invariant dốc trọng lực.
              </div>
            </div>

            {/* Bento Item 3: Tài chính, Pháp lý & Chuỗi cung ứng */}
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 transition hover:border-zinc-700 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80">
                  <div className="flex items-center gap-2 text-sm font-bold text-zinc-100">
                    <Scale className="h-4 w-4 text-violet-400" />
                    <span>Tài chính, Pháp lý & Logistics</span>
                  </div>
                  <span className="rounded bg-violet-500/10 px-2 py-0.5 text-[10px] text-violet-400 border border-violet-500/20">
                    PKI Sealed
                  </span>
                </div>
                <div className="mt-4 space-y-2.5">
                  <Link
                    href="/engineering/cashflow"
                    className="flex items-center justify-between rounded-xl bg-zinc-900/70 p-2.5 text-xs text-zinc-300 transition hover:bg-zinc-800 hover:text-white"
                  >
                    <span>Dynamic Cashflow & Working Capital (M85)</span>
                    <ArrowUpRight className="h-3.5 w-3.5 text-zinc-500" />
                  </Link>
                  <Link
                    href="/engineering/esign"
                    className="flex items-center justify-between rounded-xl bg-zinc-900/70 p-2.5 text-xs text-zinc-300 transition hover:bg-zinc-800 hover:text-white"
                  >
                    <span>Paperless Smart e-Signature PKI (M84)</span>
                    <ArrowUpRight className="h-3.5 w-3.5 text-zinc-500" />
                  </Link>
                  <Link
                    href="/engineering/fidic-claims"
                    className="flex items-center justify-between rounded-xl bg-zinc-900/70 p-2.5 text-xs text-zinc-300 transition hover:bg-zinc-800 hover:text-white"
                  >
                    <span>FIDIC 28-day EOT Claims Dossier (M79)</span>
                    <ArrowUpRight className="h-3.5 w-3.5 text-zinc-500" />
                  </Link>
                  <Link
                    href="/engineering/qr-logistics"
                    className="flex items-center justify-between rounded-xl bg-zinc-900/70 p-2.5 text-xs text-zinc-300 transition hover:bg-zinc-800 hover:text-white"
                  >
                    <span>Smart Materials QR Logistics (M78)</span>
                    <ArrowUpRight className="h-3.5 w-3.5 text-zinc-500" />
                  </Link>
                  <Link
                    href="/engineering/bidding-matrix"
                    className="flex items-center justify-between rounded-xl bg-zinc-900/70 p-2.5 text-xs text-zinc-300 transition hover:bg-zinc-800 hover:text-white"
                  >
                    <span>Smart Bidding & Skewing Analysis (M75)</span>
                    <ArrowUpRight className="h-3.5 w-3.5 text-zinc-500" />
                  </Link>
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-zinc-800/80 text-[11px] text-zinc-400">
                Toàn vẹn số liệu tài chính trên BigInt đơn vị nhỏ, chống trượt số float.
              </div>
            </div>

            {/* Bento Item 4: Siêu Tính toán, Digital Twin & Merkle Ledger */}
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 transition hover:border-zinc-700 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80">
                  <div className="flex items-center gap-2 text-sm font-bold text-zinc-100">
                    <Zap className="h-4 w-4 text-amber-400" />
                    <span>Siêu Tính toán & Sổ cái Merkle</span>
                  </div>
                  <span className="rounded bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-400 border border-amber-500/20">
                    Immutable
                  </span>
                </div>
                <div className="mt-4 space-y-2.5">
                  <Link
                    href="/engineering/quantum-hub"
                    className="flex items-center justify-between rounded-xl bg-zinc-900/70 p-2.5 text-xs text-zinc-300 transition hover:bg-zinc-800 hover:text-white"
                  >
                    <span>Quantum Spatial WASM & Merkle Ledger (M73)</span>
                    <ArrowUpRight className="h-3.5 w-3.5 text-zinc-500" />
                  </Link>
                  <Link
                    href="/engineering/reality"
                    className="flex items-center justify-between rounded-xl bg-zinc-900/70 p-2.5 text-xs text-zinc-300 transition hover:bg-zinc-800 hover:text-white"
                  >
                    <span>Living Twin Reality & IoT Capture (L4–L6)</span>
                    <ArrowUpRight className="h-3.5 w-3.5 text-zinc-500" />
                  </Link>
                  <Link
                    href="/engineering/prescriptive"
                    className="flex items-center justify-between rounded-xl bg-zinc-900/70 p-2.5 text-xs text-zinc-300 transition hover:bg-zinc-800 hover:text-white"
                  >
                    <span>Prescriptive Pareto Frontier & NCR (O3+)</span>
                    <ArrowUpRight className="h-3.5 w-3.5 text-zinc-500" />
                  </Link>
                  <Link
                    href="/engineering/memory"
                    className="flex items-center justify-between rounded-xl bg-zinc-900/70 p-2.5 text-xs text-zinc-300 transition hover:bg-zinc-800 hover:text-white"
                  >
                    <span>Cross-Project Knowledge Memory Bank (PIN-4)</span>
                    <ArrowUpRight className="h-3.5 w-3.5 text-zinc-500" />
                  </Link>
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-zinc-800/80 text-[11px] text-zinc-400">
                Mật mã băm Merkle Tree SHA-256 bảo vệ chuỗi cung ứng và nhật ký.
              </div>
            </div>

            {/* Bento Item 5: Quản trị Quy trình & Chất lượng (ENG-3 / ENG-2) */}
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 transition hover:border-zinc-700 flex flex-col justify-between lg:col-span-2">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80">
                  <div className="flex items-center gap-2 text-sm font-bold text-zinc-100">
                    <Activity className="h-4 w-4 text-emerald-400" />
                    <span>Quản trị Quy trình Phê duyệt & Đề xuất Kỹ thuật (Gate 0 OS)</span>
                  </div>
                  <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-400 border border-emerald-500/20">
                    Gate 0 Enforced
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <Link
                    href="/engineering/workflows"
                    className="flex items-center justify-between rounded-xl bg-zinc-900/70 p-2.5 text-xs text-zinc-300 transition hover:bg-zinc-800 hover:text-white"
                  >
                    <span>Quy trình phê duyệt Gate 0 (ENG-3)</span>
                    <ArrowUpRight className="h-3.5 w-3.5 text-zinc-500" />
                  </Link>
                  <Link
                    href="/engineering/suggestions"
                    className="flex items-center justify-between rounded-xl bg-zinc-900/70 p-2.5 text-xs text-zinc-300 transition hover:bg-zinc-800 hover:text-white"
                  >
                    <span>Đề xuất Kỹ thuật Thông minh (ENG-2)</span>
                    <ArrowUpRight className="h-3.5 w-3.5 text-zinc-500" />
                  </Link>
                  <Link
                    href="/engineering/subcon-ai"
                    className="flex items-center justify-between rounded-xl bg-zinc-900/70 p-2.5 text-xs text-zinc-300 transition hover:bg-zinc-800 hover:text-white"
                  >
                    <span>Đánh giá Thầu phụ AI Subcon Trust (M82)</span>
                    <ArrowUpRight className="h-3.5 w-3.5 text-zinc-500" />
                  </Link>
                  <Link
                    href="/engineering/iot-telemetry"
                    className="flex items-center justify-between rounded-xl bg-zinc-900/70 p-2.5 text-xs text-zinc-300 transition hover:bg-zinc-800 hover:text-white"
                  >
                    <span>Giám sát Cảm biến IoT Telemetry (M83)</span>
                    <ArrowUpRight className="h-3.5 w-3.5 text-zinc-500" />
                  </Link>
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-zinc-800/80 text-[11px] text-zinc-400">
                Bảo vệ ranh giới bảo mật, phân quyền RBAC & SoD (Phân tách trách nhiệm) đa dự án.
              </div>
            </div>
          </div>
        ) : (
          /* Bảng Quản lý & Duyệt Đối tượng Kỹ thuật (ENG-1) */
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <label htmlFor="eng-status" className="mb-1 block text-xs text-zinc-400">
                  Trạng thái
                </label>
                <select
                  id="eng-status"
                  aria-label="Lọc theo trạng thái duyệt"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200"
                >
                  <option value="">Tất cả</option>
                  <option value="pending_review">Chờ duyệt</option>
                  <option value="approved">Đã duyệt</option>
                  <option value="rejected">Từ chối</option>
                </select>
              </div>
              <div>
                <label htmlFor="eng-type" className="mb-1 block text-xs text-zinc-400">
                  Loại đối tượng
                </label>
                <input
                  id="eng-type"
                  aria-label="Lọc theo loại đối tượng"
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  placeholder="vd AHU, pipe_segment"
                  className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm placeholder:text-zinc-600 text-zinc-200"
                />
              </div>
            </div>

            {!objects || objects.length === 0 ? (
              <EmptyState
                icon={Boxes}
                title="Chưa nhận đối tượng kỹ thuật nào"
                message="Kết nối MEP-Agents hoặc gửi tác vụ từ MEPF Studio để tiếp nhận đối tượng kỹ thuật."
              />
            ) : (
              <div className="overflow-x-auto rounded-xl border border-zinc-800">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-zinc-900 text-xs text-zinc-400">
                    <tr>
                      <th className="px-3 py-2 text-left">Loại</th>
                      <th className="px-3 py-2 text-left">Discipline</th>
                      <th className="px-3 py-2 text-left">Tên</th>
                      <th className="px-3 py-2 text-left">Trạng thái</th>
                      <th className="px-3 py-2 text-left">Ngày nhận</th>
                    </tr>
                  </thead>
                  <tbody>
                    {objects.map((o) => (
                      <tr
                        key={o.id}
                        onClick={() => openDetail(o.id)}
                        className="cursor-pointer border-t border-zinc-800 hover:bg-zinc-900 transition-colors"
                      >
                        <td className="px-3 py-2 font-medium">{o.objectType}</td>
                        <td className="px-3 py-2 text-zinc-400">{o.discipline ?? "—"}</td>
                        <td className="px-3 py-2">{o.name ?? o.externalKey ?? "—"}</td>
                        <td className="px-3 py-2">
                          <span
                            className={`rounded-full border px-2 py-0.5 text-xs ${STATUS_CLS[o.status]}`}
                          >
                            {STATUS_LABEL[o.status]}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs text-zinc-400">
                          {new Date(o.createdAt).toLocaleString("vi-VN")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Modal Chi tiết & Duyệt Đối tượng Kỹ thuật */}
      {selectedId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-900 p-5 shadow-2xl">
            {detailLoading || !detail ? (
              <PageSkeleton />
            ) : (
              <>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-base font-semibold text-zinc-100">
                    {detail.object.name ?? detail.object.externalKey ?? detail.object.objectType}
                  </h2>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-xs ${STATUS_CLS[detail.object.status]}`}
                  >
                    {STATUS_LABEL[detail.object.status]}
                  </span>
                </div>

                <div className="mb-3 text-xs text-zinc-400">
                  Loại: {detail.object.objectType} · Discipline: {detail.object.discipline ?? "—"} ·
                  Mã ngoài: {detail.object.externalKey ?? "—"}
                </div>

                <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Properties
                </p>
                <pre className="mb-3 max-h-40 overflow-auto rounded-lg bg-zinc-950 p-3 text-xs text-zinc-300">
                  {JSON.stringify(detail.object.properties, null, 2)}
                </pre>

                {detail.relations.length > 0 && (
                  <>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                      Quan hệ
                    </p>
                    <ul className="mb-3 space-y-1 text-xs text-zinc-300">
                      {detail.relations.map((r) => (
                        <li key={r.id}>
                          {r.fromObjectId === detail.object.id ? "→" : "←"} {r.relationType}
                        </li>
                      ))}
                    </ul>
                  </>
                )}

                <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Lịch sử gần nhất
                </p>
                <ul className="mb-4 space-y-1 text-xs text-zinc-400">
                  {detail.revisions.map((r) => (
                    <li key={r.id}>
                      #{r.revisionNo} — {r.changeReason ?? r.status} (
                      {new Date(r.createdAt).toLocaleString("vi-VN")})
                    </li>
                  ))}
                </ul>

                {detail.object.status === "pending_review" ||
                detail.object.status === "rejected" ? (
                  <div className="border-t border-zinc-800 pt-3">
                    <label htmlFor="review-note" className="mb-1 block text-xs text-zinc-400">
                      Ghi chú (tuỳ chọn)
                    </label>
                    <textarea
                      id="review-note"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      rows={2}
                      className="mb-3 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={closeDetail}
                        className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm hover:bg-zinc-700"
                      >
                        Đóng
                      </button>
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => review("rejected")}
                        aria-label="Từ chối đối tượng kỹ thuật"
                        className="flex items-center gap-1 rounded-lg bg-rose-800 px-3 py-1.5 text-sm text-white hover:bg-rose-700 disabled:opacity-50"
                      >
                        <X size={14} /> Từ chối
                      </button>
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => review("approved")}
                        aria-label="Duyệt đối tượng kỹ thuật"
                        className="flex items-center gap-1 rounded-lg bg-emerald-700 px-3 py-1.5 text-sm text-white hover:bg-emerald-600 disabled:opacity-50"
                      >
                        <Check size={14} /> {submitting ? "Đang lưu..." : "Duyệt"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-end border-t border-zinc-800 pt-3">
                    <button
                      type="button"
                      onClick={closeDetail}
                      className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm hover:bg-zinc-700"
                    >
                      Đóng
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
