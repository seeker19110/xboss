"use client";
import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  X,
  Trash2,
  Pencil,
  Banknote,
  Landmark,
  Receipt,
  Users,
  ExternalLink,
  CheckCircle2,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from "recharts";
import AppHeader from "@/app/components/AppHeader";
import EmptyState from "@/app/components/EmptyState";
import { PageSkeleton } from "@/app/components/Skeleton";
import { Modal, appConfirm } from "@/app/components/dialogs";
import { showToast } from "@/app/components/Toast";
import { fetchMe, type Me } from "@/app/lib/me";
import { formatDateVN, todayISO } from "@/lib/date";

function fmtVND(n: number) {
  if (!n) return "0 đ";
  return Math.round(n).toLocaleString("vi-VN") + " đ";
}

// ===== Kiểu dữ liệu (client) — mirror lib/finance.ts =====

type CashflowMonth = { month: string; in: number; out: number };

type VatSummary = { vatIn: number; vatOut: number; netVat: number };

type FinanceSummary = {
  period: string;
  cashflow: CashflowMonth[];
  receivables: number;
  payables: number;
  advanceOutstanding: number;
  vat: VatSummary;
};

type InvoiceDirection = "in" | "out";

type Invoice = {
  id: number;
  invoiceNo: string | null;
  invoiceDate: string | null;
  direction: InvoiceDirection;
  netAmount: number;
  vatAmount: number;
  vatRate: number | null;
  counterparty: string | null;
  contractId: number | null;
  paymentBillId: number | null;
  createdByName: string | null;
};

type PayrollStatus = "draft" | "approved" | "paid";
const PAYROLL_STATUS_LABEL: Record<PayrollStatus, string> = {
  draft: "Nháp",
  approved: "Đã duyệt",
  paid: "Đã trả",
};
const PAYROLL_STATUS_BADGE: Record<PayrollStatus, string> = {
  draft: "bg-zinc-800 text-zinc-400",
  approved: "bg-sky-900 text-sky-200",
  paid: "bg-emerald-900 text-emerald-200",
};

type PayrollRow = {
  id: number;
  period: string;
  crewId: number | null;
  crewName: string | null;
  personnelId: number | null;
  personnelName: string | null;
  workdays: number;
  rate: number;
  gross: number;
  deductions: number;
  net: number;
  status: PayrollStatus;
};

type PayrollSuggestion = { personnelId: number; personnelName: string; workdays: number };

type Tab = "cashflow" | "debt" | "invoices" | "payroll";
const TABS: { key: Tab; label: string; icon: typeof Banknote }[] = [
  { key: "cashflow", label: "Dòng tiền", icon: Banknote },
  { key: "debt", label: "Công nợ", icon: Landmark },
  { key: "invoices", label: "Hoá đơn & thuế", icon: Receipt },
  { key: "payroll", label: "Lương", icon: Users },
];

export default function FinancePage() {
  const [me, setMe] = useState<Me | null>(null);
  const [period, setPeriod] = useState(todayISO().slice(0, 7));
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payroll, setPayroll] = useState<PayrollRow[]>([]);
  const [suggestions, setSuggestions] = useState<PayrollSuggestion[]>([]);
  const [personnelOptions, setPersonnelOptions] = useState<{ id: number; fullName: string }[]>([]);
  const [crewOptions, setCrewOptions] = useState<{ id: number; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("cashflow");

  const [addInvoiceOpen, setAddInvoiceOpen] = useState(false);
  const [editInvoice, setEditInvoice] = useState<Invoice | null>(null);
  const [addPayrollOpen, setAddPayrollOpen] = useState(false);
  const [editPayroll, setEditPayroll] = useState<PayrollRow | null>(null);
  const [payrollPrefill, setPayrollPrefill] = useState<PayrollSuggestion | null>(null);

  const canManage = me?.role === "admin" || me?.role === "pm";

  function load(p: string) {
    return Promise.all([
      fetch(`/api/finance/summary?period=${p}`).then((r) => (r.ok ? r.json() : null)),
      fetch("/api/invoices").then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/payroll?period=${p}&suggest=1`).then((r) => (r.ok ? r.json() : null)),
    ]);
  }

  useEffect(() => {
    Promise.all([fetchMe(), load(period)])
      .then(([meData, [summaryRes, invoicesRes, payrollRes]]) => {
        if (!meData) return;
        setMe(meData);
        setSummary(summaryRes);
        setInvoices(invoicesRes?.invoices ?? []);
        setPayroll(payrollRes?.payroll ?? []);
        setSuggestions(payrollRes?.suggestions ?? []);
        if (meData.role === "admin" || meData.role === "pm") {
          fetch("/api/personnel")
            .then((r) => (r.ok ? r.json() : null))
            .then((j) => setPersonnelOptions(j?.personnel ?? []));
          fetch("/api/crews")
            .then((r) => (r.ok ? r.json() : null))
            .then((j) => setCrewOptions(j?.crews ?? []));
        }
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refresh(p = period) {
    const [summaryRes, invoicesRes, payrollRes] = await load(p);
    setSummary(summaryRes);
    setInvoices(invoicesRes?.invoices ?? []);
    setPayroll(payrollRes?.payroll ?? []);
    setSuggestions(payrollRes?.suggestions ?? []);
  }

  function changePeriod(p: string) {
    setPeriod(p);
    refresh(p);
  }

  // KPI strip: tồn quỹ ước tính = Σin − Σout (toàn bộ cashflow trả về), công nợ ròng =
  // phải thu − phải trả, tạm ứng chưa hoàn — tính từ /api/finance/summary (đã gộp sẵn).
  const kpi = useMemo(() => {
    const cash = summary?.cashflow ?? [];
    const totalIn = cash.reduce((s, m) => s + m.in, 0);
    const totalOut = cash.reduce((s, m) => s + m.out, 0);
    return {
      fundBalance: totalIn - totalOut,
      netDebt: (summary?.receivables ?? 0) - (summary?.payables ?? 0),
      advanceOutstanding: summary?.advanceOutstanding ?? 0,
    };
  }, [summary]);

  async function deleteEntity(url: string, label: string) {
    if (!(await appConfirm(`Xoá ${label} này? Không thể hoàn tác.`, { danger: true }))) return;
    const res = await fetch(url, { method: "DELETE" });
    if (!res.ok) {
      showToast((await res.json().catch(() => null))?.error ?? "Xoá thất bại", "error");
      return;
    }
    refresh();
  }

  async function cyclePayrollStatus(row: PayrollRow) {
    const next: PayrollStatus =
      row.status === "draft" ? "approved" : row.status === "approved" ? "paid" : "draft";
    const res = await fetch(`/api/payroll/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    if (!res.ok) {
      showToast((await res.json().catch(() => null))?.error ?? "Cập nhật thất bại", "error");
      return;
    }
    refresh();
  }

  if (loading) return <PageSkeleton />;

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <AppHeader
        title="Tài chính – Kế toán"
        subtitle="Dòng tiền, công nợ, hoá đơn & thuế VAT, lương công trường"
        bottomActions={
          canManage ? (
            <div className="flex items-center gap-2">
              {tab === "invoices" && (
                <button
                  onClick={() => setAddInvoiceOpen(true)}
                  aria-label="Thêm hoá đơn"
                  className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-600 px-3 sm:px-4 py-2 rounded-lg text-sm font-semibold transition shrink-0 text-on-accent"
                >
                  <Plus className="w-4 h-4" />{" "}
                  <span className="hidden sm:inline">Thêm hoá đơn</span>
                </button>
              )}
              {tab === "payroll" && (
                <button
                  onClick={() => {
                    setPayrollPrefill(null);
                    setAddPayrollOpen(true);
                  }}
                  aria-label="Thêm kỳ lương"
                  className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-600 px-3 sm:px-4 py-2 rounded-lg text-sm font-semibold transition shrink-0 text-on-accent"
                >
                  <Plus className="w-4 h-4" />{" "}
                  <span className="hidden sm:inline">Thêm kỳ lương</span>
                </button>
              )}
            </div>
          ) : undefined
        }
      />

      <main className="p-4 sm:p-6 pb-24 space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
            <p
              className={`text-lg sm:text-2xl font-bold ${kpi.fundBalance < 0 ? "text-rose-400" : "text-emerald-400"}`}
            >
              {fmtVND(kpi.fundBalance)}
            </p>
            <p className="text-xs text-zinc-400">Tồn quỹ ước tính</p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
            <p
              className={`text-lg sm:text-2xl font-bold ${kpi.netDebt < 0 ? "text-rose-400" : "text-sky-400"}`}
            >
              {fmtVND(kpi.netDebt)}
            </p>
            <p className="text-xs text-zinc-400">Công nợ ròng (thu − trả)</p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
            <p
              className={`text-lg sm:text-2xl font-bold ${kpi.advanceOutstanding > 0 ? "text-amber-400" : ""}`}
            >
              {fmtVND(kpi.advanceOutstanding)}
            </p>
            <p className="text-xs text-zinc-400">Tạm ứng chưa hoàn</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 justify-between">
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Nhóm tài chính">
            {TABS.map((t) => (
              <button
                key={t.key}
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => setTab(t.key)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border flex items-center gap-1.5 ${
                  tab === t.key
                    ? "bg-zinc-700 border-zinc-600 text-white"
                    : "border-zinc-700 text-zinc-400 hover:text-white"
                }`}
              >
                <t.icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            ))}
          </div>
          <label className="text-xs text-zinc-400 flex items-center gap-2">
            Kỳ
            <input
              type="month"
              value={period}
              onChange={(e) => changePeriod(e.target.value)}
              className="bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-white"
            />
          </label>
        </div>

        {tab === "cashflow" && <CashflowTab cashflow={summary?.cashflow ?? []} />}

        {tab === "debt" && (
          <DebtTab receivables={summary?.receivables ?? 0} payables={summary?.payables ?? 0} />
        )}

        {tab === "invoices" && (
          <InvoicesTab
            items={invoices}
            vat={summary?.vat ?? { vatIn: 0, vatOut: 0, netVat: 0 }}
            canManage={canManage}
            onEdit={setEditInvoice}
            onDelete={(id) => deleteEntity(`/api/invoices/${id}`, "hoá đơn")}
          />
        )}

        {tab === "payroll" && (
          <PayrollTab
            items={payroll}
            suggestions={suggestions}
            canManage={canManage}
            onEdit={setEditPayroll}
            onDelete={(id) => deleteEntity(`/api/payroll/${id}`, "kỳ lương")}
            onCycle={cyclePayrollStatus}
            onUseSuggestion={(s) => {
              setPayrollPrefill(s);
              setAddPayrollOpen(true);
            }}
          />
        )}
      </main>

      {(addInvoiceOpen || editInvoice) && (
        <InvoiceModal
          item={editInvoice}
          onClose={() => {
            setAddInvoiceOpen(false);
            setEditInvoice(null);
          }}
          onSaved={() => {
            setAddInvoiceOpen(false);
            setEditInvoice(null);
            refresh();
          }}
        />
      )}

      {(addPayrollOpen || editPayroll) && (
        <PayrollModal
          item={editPayroll}
          prefill={payrollPrefill}
          period={period}
          personnelOptions={personnelOptions}
          crewOptions={crewOptions}
          onClose={() => {
            setAddPayrollOpen(false);
            setEditPayroll(null);
            setPayrollPrefill(null);
          }}
          onSaved={() => {
            setAddPayrollOpen(false);
            setEditPayroll(null);
            setPayrollPrefill(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

// ===== Tab Dòng tiền =====

function CashflowTab({ cashflow }: { cashflow: CashflowMonth[] }) {
  if (cashflow.length === 0)
    return (
      <EmptyState
        icon={Banknote}
        title="Chưa có giao dịch quỹ tiền mặt"
        message="Ghi thu/chi qua sổ quỹ để thấy biểu đồ dòng tiền theo tháng."
      />
    );
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <h2 className="text-sm font-semibold text-zinc-300 mb-3">Thu/chi theo tháng (thực tế)</h2>
      <div style={{ width: "100%", height: 280 }}>
        <ResponsiveContainer>
          <BarChart data={cashflow} margin={{ top: 8, right: 8, bottom: 8, left: -16 }}>
            <XAxis dataKey="month" stroke="var(--color-zinc-500)" fontSize={11} />
            <YAxis stroke="var(--color-zinc-500)" fontSize={11} />
            <Tooltip
              contentStyle={{
                background: "var(--color-zinc-900)",
                border: "1px solid var(--color-zinc-700)",
                color: "var(--foreground)",
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(v, name) => [fmtVND(Number(v)), name === "in" ? "Thu" : "Chi"]}
            />
            <Legend
              formatter={(v) => (v === "in" ? "Thu" : "Chi")}
              wrapperStyle={{ fontSize: 12 }}
            />
            <Bar dataKey="in" fill="var(--color-emerald-400)" radius={[4, 4, 0, 0]} />
            <Bar dataKey="out" fill="var(--color-rose-400)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ===== Tab Công nợ =====

function DebtTab({ receivables, payables }: { receivables: number; payables: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <p className="text-xs text-zinc-400 mb-1">Phải thu (Chủ đầu tư)</p>
        <p className="text-2xl font-bold text-sky-400">{fmtVND(receivables)}</p>
        <p className="text-xs text-zinc-500 mt-1">
          Suy từ giá trị hợp đồng nhận thầu (gồm phụ lục) trừ đã thanh toán.
        </p>
        <a
          href="/contracts"
          className="mt-3 inline-flex items-center gap-1 text-sky-400 hover:text-sky-300 text-xs"
        >
          Xem hợp đồng <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <p className="text-xs text-zinc-400 mb-1">Phải trả (NCC/NTP)</p>
        <p className="text-2xl font-bold text-amber-400">{fmtVND(payables)}</p>
        <p className="text-xs text-zinc-500 mt-1">
          Suy từ hợp đồng giao thầu/NCC + đơn đặt hàng chưa gắn hợp đồng, trừ đã trả.
        </p>
        <div className="mt-3 flex items-center gap-3">
          <a
            href="/contracts"
            className="inline-flex items-center gap-1 text-sky-400 hover:text-sky-300 text-xs"
          >
            Xem hợp đồng <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <a
            href="/materials/purchase-orders"
            className="inline-flex items-center gap-1 text-sky-400 hover:text-sky-300 text-xs"
          >
            Xem đơn đặt hàng <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </div>
  );
}

// ===== Tab Hoá đơn & thuế =====

function InvoicesTab({
  items,
  vat,
  canManage,
  onEdit,
  onDelete,
}: {
  items: Invoice[];
  vat: VatSummary;
  canManage: boolean;
  onEdit: (item: Invoice) => void;
  onDelete: (id: number) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
          <p className="text-lg font-bold text-sky-400">{fmtVND(vat.vatIn)}</p>
          <p className="text-xs text-zinc-400">VAT đầu vào (được khấu trừ)</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
          <p className="text-lg font-bold text-amber-400">{fmtVND(vat.vatOut)}</p>
          <p className="text-xs text-zinc-400">VAT đầu ra (phải nộp)</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
          <p
            className={`text-lg font-bold ${vat.netVat >= 0 ? "text-rose-400" : "text-emerald-400"}`}
          >
            {fmtVND(Math.abs(vat.netVat))}
          </p>
          <p className="text-xs text-zinc-400">
            VAT ròng {vat.netVat >= 0 ? "phải nộp" : "được hoàn"} (kỳ)
          </p>
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="Chưa có hoá đơn"
          message="Bấm “Thêm hoá đơn” để ghi hoá đơn VAT vào/ra."
        />
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Hoá đơn VAT">
            <table className="w-full text-sm sm:min-w-[820px]">
              <thead>
                <tr className="text-xs text-zinc-400 border-b border-zinc-800">
                  <th className="text-left p-3">SỐ HOÁ ĐƠN</th>
                  <th className="text-left p-3">NGÀY</th>
                  <th className="text-left p-3">CHIỀU</th>
                  <th className="text-left p-3">ĐỐI TÁC</th>
                  <th className="text-left p-3">TRƯỚC THUẾ</th>
                  <th className="text-left p-3">VAT</th>
                  <th className="text-left p-3 w-24"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((inv) => (
                  <tr key={inv.id} className="border-b border-zinc-800/60 last:border-0">
                    <td className="p-3">{inv.invoiceNo ?? "—"}</td>
                    <td className="p-3 text-xs text-zinc-400">
                      {inv.invoiceDate ? formatDateVN(inv.invoiceDate) : "—"}
                    </td>
                    <td className="p-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                          inv.direction === "in"
                            ? "bg-sky-900 text-sky-200"
                            : "bg-amber-900 text-amber-200"
                        }`}
                      >
                        {inv.direction === "in" ? "Đầu vào" : "Đầu ra"}
                      </span>
                    </td>
                    <td className="p-3 text-xs text-zinc-400">{inv.counterparty ?? "—"}</td>
                    <td className="p-3">{fmtVND(inv.netAmount)}</td>
                    <td className="p-3">
                      {fmtVND(inv.vatAmount)}
                      {inv.vatRate != null && (
                        <span className="text-zinc-500 text-xs"> ({inv.vatRate}%)</span>
                      )}
                    </td>
                    <td className="p-3">
                      {canManage && (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => onEdit(inv)}
                            aria-label="Sửa hoá đơn"
                            className="text-zinc-400 hover:text-white"
                            title="Sửa"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => onDelete(inv.id)}
                            aria-label="Xoá hoá đơn"
                            className="text-zinc-400 hover:text-rose-400"
                            title="Xoá"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ===== Tab Lương =====

function PayrollTab({
  items,
  suggestions,
  canManage,
  onEdit,
  onDelete,
  onCycle,
  onUseSuggestion,
}: {
  items: PayrollRow[];
  suggestions: PayrollSuggestion[];
  canManage: boolean;
  onEdit: (item: PayrollRow) => void;
  onDelete: (id: number) => void;
  onCycle: (item: PayrollRow) => void;
  onUseSuggestion: (s: PayrollSuggestion) => void;
}) {
  // Chỉ gợi ý người chưa có kỳ lương ghi trong kỳ này (tránh gợi ý trùng).
  const donePersonnelIds = new Set(items.map((p) => p.personnelId).filter((v) => v != null));
  const pendingSuggestions = suggestions.filter((s) => !donePersonnelIds.has(s.personnelId));

  return (
    <div className="space-y-3">
      {canManage && pendingSuggestions.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-zinc-300 mb-2">
            Gợi ý từ chấm công ({pendingSuggestions.length})
          </h2>
          <p className="text-xs text-zinc-500 mb-3">
            Công tính từ chấm công theo người trong kỳ — bấm để xác nhận/chỉnh số trước khi lưu.
          </p>
          <div className="flex flex-wrap gap-2">
            {pendingSuggestions.map((s) => (
              <button
                key={s.personnelId}
                onClick={() => onUseSuggestion(s)}
                className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-300"
              >
                <span className="font-medium text-white">{s.personnelName}</span>
                <span className="text-zinc-400">{s.workdays} công</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Chưa có kỳ lương"
          message="Xác nhận gợi ý từ chấm công hoặc bấm “Thêm kỳ lương” để nhập tay."
        />
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Kỳ lương">
            <table className="w-full text-sm sm:min-w-[820px]">
              <thead>
                <tr className="text-xs text-zinc-400 border-b border-zinc-800">
                  <th className="text-left p-3">NGƯỜI/TỔ ĐỘI</th>
                  <th className="text-left p-3">CÔNG</th>
                  <th className="text-left p-3">ĐƠN GIÁ</th>
                  <th className="text-left p-3">LƯƠNG GỘP</th>
                  <th className="text-left p-3">KHẤU TRỪ</th>
                  <th className="text-left p-3">THỰC NHẬN</th>
                  <th className="text-left p-3">TRẠNG THÁI</th>
                  <th className="text-left p-3 w-24"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((p) => (
                  <tr key={p.id} className="border-b border-zinc-800/60 last:border-0">
                    <td className="p-3">{p.personnelName ?? p.crewName ?? "—"}</td>
                    <td className="p-3">{p.workdays}</td>
                    <td className="p-3">{fmtVND(p.rate)}</td>
                    <td className="p-3">{fmtVND(p.gross)}</td>
                    <td className="p-3">{fmtVND(p.deductions)}</td>
                    <td className="p-3 font-medium">{fmtVND(p.net)}</td>
                    <td className="p-3">
                      <button
                        onClick={() => canManage && p.status !== "paid" && onCycle(p)}
                        disabled={!canManage || p.status === "paid"}
                        aria-label={`Đổi trạng thái, hiện tại: ${PAYROLL_STATUS_LABEL[p.status]}`}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${PAYROLL_STATUS_BADGE[p.status]} ${
                          canManage && p.status !== "paid"
                            ? "cursor-pointer hover:opacity-80"
                            : "cursor-default"
                        }`}
                      >
                        {p.status === "paid" && <CheckCircle2 className="w-3 h-3" />}
                        {PAYROLL_STATUS_LABEL[p.status]}
                      </button>
                    </td>
                    <td className="p-3">
                      {canManage && (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => onEdit(p)}
                            aria-label="Sửa kỳ lương"
                            className="text-zinc-400 hover:text-white"
                            title="Sửa"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => onDelete(p.id)}
                            aria-label="Xoá kỳ lương"
                            className="text-zinc-400 hover:text-rose-400 disabled:opacity-30"
                            disabled={p.status === "paid"}
                            title={p.status === "paid" ? "Đã trả, không thể xoá" : "Xoá"}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ===== Modal Hoá đơn =====

function InvoiceModal({
  item,
  onClose,
  onSaved,
}: {
  item: Invoice | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [invoiceNo, setInvoiceNo] = useState(item?.invoiceNo ?? "");
  const [invoiceDate, setInvoiceDate] = useState(item?.invoiceDate ?? todayISO());
  const [direction, setDirection] = useState<InvoiceDirection>(item?.direction ?? "out");
  const [netAmount, setNetAmount] = useState(item ? String(item.netAmount) : "");
  const [vatAmount, setVatAmount] = useState(item ? String(item.vatAmount) : "");
  const [vatRate, setVatRate] = useState(item?.vatRate != null ? String(item.vatRate) : "10");
  const [counterparty, setCounterparty] = useState(item?.counterparty ?? "");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const canSubmit = netAmount !== "" && vatAmount !== "";

  async function submit() {
    setSaving(true);
    setErr("");
    try {
      const payload = {
        invoiceNo: invoiceNo.trim() || null,
        invoiceDate: invoiceDate || null,
        direction,
        netAmount: Number(netAmount),
        vatAmount: Number(vatAmount),
        vatRate: vatRate === "" ? null : Number(vatRate),
        counterparty: counterparty.trim() || null,
      };
      const url = item ? `/api/invoices/${item.id}` : "/api/invoices";
      const res = await fetch(url, {
        method: item ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        setErr((await res.json().catch(() => null))?.error ?? "Không lưu được hoá đơn");
        return;
      }
      onSaved();
    } catch {
      setErr("Mất kết nối — kiểm tra mạng rồi thử lại");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal onClose={onClose} className="max-w-lg">
      <div className="p-5 space-y-3 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">{item ? "Sửa hoá đơn" : "Thêm hoá đơn"}</h2>
          <button onClick={onClose} aria-label="Đóng" className="text-zinc-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-zinc-400">
            Số hoá đơn
            <input
              value={invoiceNo}
              onChange={(e) => setInvoiceNo(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-zinc-400">
            Ngày hoá đơn
            <input
              type="date"
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
        </div>

        <label className="text-xs text-zinc-400 block">
          Chiều hoá đơn
          <select
            value={direction}
            onChange={(e) => setDirection(e.target.value as InvoiceDirection)}
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          >
            <option value="out">Đầu ra (xuất cho CĐT)</option>
            <option value="in">Đầu vào (nhận từ NCC/NTP)</option>
          </select>
        </label>

        <label className="text-xs text-zinc-400 block">
          Đối tác
          <input
            value={counterparty}
            onChange={(e) => setCounterparty(e.target.value)}
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          />
        </label>

        <div className="grid grid-cols-3 gap-3">
          <label className="text-xs text-zinc-400">
            Trước thuế
            <input
              type="number"
              min={0}
              value={netAmount}
              onChange={(e) => setNetAmount(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-zinc-400">
            Thuế suất %
            <input
              type="number"
              min={0}
              max={100}
              value={vatRate}
              onChange={(e) => {
                setVatRate(e.target.value);
                const net = Number(netAmount) || 0;
                const rate = Number(e.target.value) || 0;
                setVatAmount(String(Math.round((net * rate) / 100)));
              }}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-zinc-400">
            Tiền thuế VAT
            <input
              type="number"
              min={0}
              value={vatAmount}
              onChange={(e) => setVatAmount(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
        </div>

        {err && <p className="text-sm text-rose-300">{err}</p>}
        <button
          onClick={submit}
          disabled={saving || !canSubmit}
          className="w-full bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-on-accent font-semibold py-2 rounded-lg text-sm"
        >
          {saving ? "Đang lưu…" : "Lưu"}
        </button>
      </div>
    </Modal>
  );
}

// ===== Modal Lương =====

function PayrollModal({
  item,
  prefill,
  period,
  personnelOptions,
  crewOptions,
  onClose,
  onSaved,
}: {
  item: PayrollRow | null;
  prefill: PayrollSuggestion | null;
  period: string;
  personnelOptions: { id: number; fullName: string }[];
  crewOptions: { id: number; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const locked = item != null || prefill != null; // đã gắn sẵn người/tổ, không cho đổi
  const [personnelId, setPersonnelId] = useState<number | "">(
    item?.personnelId ?? prefill?.personnelId ?? "",
  );
  const [crewId, setCrewId] = useState<number | "">(item?.crewId ?? "");
  const [workdays, setWorkdays] = useState(String(item?.workdays ?? prefill?.workdays ?? 0));
  const [rate, setRate] = useState(item ? String(item.rate) : "0");
  const [deductions, setDeductions] = useState(item ? String(item.deductions) : "0");
  const [status, setStatus] = useState<PayrollStatus>(item?.status ?? "draft");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const gross = Math.round((Number(workdays) || 0) * (Number(rate) || 0));
  const net = Math.max(0, gross - (Number(deductions) || 0));

  const canSubmit =
    (personnelId !== "" || crewId !== "") && Number(workdays) >= 0 && Number(rate) >= 0;

  async function submit() {
    setSaving(true);
    setErr("");
    try {
      const payload = {
        period,
        personnelId: personnelId === "" ? null : personnelId,
        crewId: crewId === "" ? null : crewId,
        workdays: Number(workdays),
        rate: Number(rate),
        gross,
        deductions: Number(deductions),
        net,
        status,
      };
      const url = item ? `/api/payroll/${item.id}` : "/api/payroll";
      const res = await fetch(url, {
        method: item ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        setErr((await res.json().catch(() => null))?.error ?? "Không lưu được kỳ lương");
        return;
      }
      onSaved();
    } catch {
      setErr("Mất kết nối — kiểm tra mạng rồi thử lại");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal onClose={onClose} className="max-w-lg">
      <div className="p-5 space-y-3 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">{item ? "Sửa kỳ lương" : "Thêm kỳ lương"}</h2>
          <button onClick={onClose} aria-label="Đóng" className="text-zinc-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-zinc-300">Kỳ {period}</p>

        {locked ? (
          <p className="text-sm text-zinc-300">
            Nhân sự/tổ đội:{" "}
            <span className="font-medium">
              {item?.personnelName ?? item?.crewName ?? prefill?.personnelName ?? "—"}
            </span>
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-zinc-400">
              Nhân sự
              <select
                value={personnelId}
                onChange={(e) => {
                  setPersonnelId(e.target.value ? Number(e.target.value) : "");
                  if (e.target.value) setCrewId("");
                }}
                className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
              >
                <option value="">— Không chọn —</option>
                {personnelOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.fullName}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-zinc-400">
              Tổ đội
              <select
                value={crewId}
                onChange={(e) => {
                  setCrewId(e.target.value ? Number(e.target.value) : "");
                  if (e.target.value) setPersonnelId("");
                }}
                className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
              >
                <option value="">— Không chọn —</option>
                {crewOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-zinc-400">
            Công
            <input
              type="number"
              min={0}
              value={workdays}
              onChange={(e) => setWorkdays(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-zinc-400">
            Đơn giá công
            <input
              type="number"
              min={0}
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
        </div>

        <label className="text-xs text-zinc-400 block">
          Khoản trừ (BHXH, tạm ứng…)
          <input
            type="number"
            min={0}
            value={deductions}
            onChange={(e) => setDeductions(e.target.value)}
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          />
        </label>

        <div className="bg-zinc-800/60 rounded-lg p-3 text-sm flex items-center justify-between">
          <span className="text-zinc-400">Lương gộp / thực nhận</span>
          <span className="font-semibold">
            {fmtVND(gross)} / {fmtVND(net)}
          </span>
        </div>

        <label className="text-xs text-zinc-400 block">
          Trạng thái
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as PayrollStatus)}
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          >
            {(Object.keys(PAYROLL_STATUS_LABEL) as PayrollStatus[]).map((s) => (
              <option key={s} value={s}>
                {PAYROLL_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>

        {err && <p className="text-sm text-rose-300">{err}</p>}
        <button
          onClick={submit}
          disabled={saving || !canSubmit}
          className="w-full bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-on-accent font-semibold py-2 rounded-lg text-sm"
        >
          {saving ? "Đang lưu…" : "Lưu"}
        </button>
      </div>
    </Modal>
  );
}
