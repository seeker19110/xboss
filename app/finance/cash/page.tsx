"use client";
// Trang /finance/cash — Sổ thu chi & Tạm ứng (M27). Bảng cash_transactions/advances và toàn bộ
// API xem/tạo/sửa/xoá/hoàn ứng có từ M27 PR1 nhưng chưa từng có UI; /finance chỉ hiện biểu đồ
// dòng tiền tổng hợp từ các bảng này. Xem: admin/pm/bch (CAN.viewPayments); ghi: admin/pm
// (CAN.manageFinance) — API là ranh giới thật, trang chỉ ẩn nút.
import { useEffect, useState } from "react";
import { ArrowLeft, HandCoins, Wallet } from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import { PageSkeleton } from "@/app/components/Skeleton";
import { ButtonLink, Tabs, TabPanel } from "@/app/components/ui";
import { fetchMe, type Me } from "@/app/lib/me";
import CashTab from "./_components/CashTab";
import AdvancesTab from "./_components/AdvancesTab";

type TabId = "cash" | "advances";

export default function FinanceCashPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabId>("cash");

  useEffect(() => {
    // ?tab=advances — link từ thẻ "Tạm ứng chưa hoàn" của /finance mở thẳng tab tạm ứng.
    if (new URLSearchParams(window.location.search).get("tab") === "advances") setTab("advances");
    fetchMe().then((u) => {
      setMe(u);
      setLoading(false);
    });
  }, []);

  function changeTab(id: string) {
    const next = id as TabId;
    setTab(next);
    const url = new URL(window.location.href);
    if (next === "cash") url.searchParams.delete("tab");
    else url.searchParams.set("tab", next);
    window.history.replaceState(null, "", url);
  }

  if (loading) return <PageSkeleton />;
  const canManage = me?.role === "admin" || me?.role === "pm";

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <AppHeader
        title="Thu chi & Tạm ứng"
        subtitle="Sổ phiếu thu/chi quỹ công trường, tạm ứng và hoàn ứng"
        bottomActions={
          <ButtonLink href="/finance" icon={ArrowLeft} size="sm">
            Tài chính
          </ButtonLink>
        }
      />
      <main className="p-4 sm:p-6 pb-24 space-y-4 max-w-screen-2xl mx-auto">
        <Tabs
          group="finance-cash"
          label="Thu chi và tạm ứng"
          value={tab}
          onChange={changeTab}
          items={[
            { id: "cash", label: "Sổ thu chi", icon: Wallet },
            { id: "advances", label: "Tạm ứng", icon: HandCoins },
          ]}
        />
        <TabPanel group="finance-cash" value={tab}>
          {tab === "cash" ? (
            <CashTab canManage={canManage} />
          ) : (
            <AdvancesTab canManage={canManage} />
          )}
        </TabPanel>
      </main>
    </div>
  );
}
