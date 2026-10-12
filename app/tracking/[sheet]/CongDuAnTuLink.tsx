"use client";
import { Suspense, useCallback, useEffect, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { Home } from "lucide-react";
import { PageSkeleton } from "@/app/components/Skeleton";
import { ErrorState } from "@/app/components/ErrorState";
import { ButtonLink } from "@/app/components/ui";
import { chuyenDuAn, duAnDangChon, kiemDuAnConXem } from "@/app/lib/chuyenDuAn";
import { redirectToLogin, redirectTo2faSetup } from "@/app/lib/me";
import { THAM_SO_DU_AN, docIdDuAn, quyetDinhDuAnTuLink } from "@/lib/nen/link-tracking";

type TrangThai = { loai: "dang-kiem" } | { loai: "san-sang" } | { loai: "loi"; loi: string };

function urlBoThamSoDuAn(): string {
  const u = new URL(window.location.href);
  u.searchParams.delete(THAM_SO_DU_AN);
  return u.pathname + u.search + u.hash;
}

// Cổng M132: link thông báo/push mang `?project=<id>` (sheet slug chỉ duy nhất theo dự án từ
// migration 0161). Khác dự án đang chọn → đổi dự án theo thủ tục chuẩn (server kiểm quyền) rồi
// tải lại URL sạch; KHÔNG bao giờ dựng lưới khi cookie còn trỏ dự án khác. Cùng dự án / tham số
// hỏng → gỡ tham số và hiển thị trang như thường. Theo dõi tham số qua useSearchParams để cả
// điều hướng client-side cùng slug (chuông thông báo `router.push`) cũng đi qua cổng.
function Cong({ children }: { children: ReactNode }) {
  const thamSo = useSearchParams().get(THAM_SO_DU_AN);
  const [tt, setTt] = useState<TrangThai>({ loai: "dang-kiem" });

  const xuLyLoi = useCallback((kq: { loi: string; status: number; code?: string }) => {
    if (kq.status === 401) return void redirectToLogin();
    if (kq.status === 403 && kq.code === "2fa_required") return redirectTo2faSetup();
    setTt({ loai: "loi", loi: kq.loi });
  }, []);

  const kiem = useCallback(
    async (ts: string | null, daHuy: () => boolean = () => false) => {
      const qd = quyetDinhDuAnTuLink(ts, duAnDangChon());
      if (qd === "khong-co") return setTt({ loai: "san-sang" });
      const id = docIdDuAn(ts);
      if (qd === "go-tham-so" && id != null) {
        // Trùng cookie nhưng cookie có thể trỏ dự án user đã bị gỡ (server rơi về dự án khác) → kiểm lại.
        setTt({ loai: "dang-kiem" });
        const kiemTra = await kiemDuAnConXem(id);
        if (daHuy()) return; // tham số đã đổi giữa chừng — lượt kiểm mới lo
        if (kiemTra.ok && !kiemTra.conXem)
          return setTt({ loai: "loi", loi: "Bạn không còn quyền xem dự án của liên kết này" });
        // Mất mạng (status 0): vẫn mở trang như trước — lưới offline chỉ có cache của phiên này.
        if (!kiemTra.ok && kiemTra.status !== 0) return xuLyLoi(kiemTra);
      }
      if (qd === "go-tham-so") {
        window.history.replaceState(window.history.state, "", urlBoThamSoDuAn());
        return setTt({ loai: "san-sang" });
      }
      setTt({ loai: "dang-kiem" });
      const kq = await chuyenDuAn(Number(ts)); // qd "chuyen" ⇒ ts là id hợp lệ
      // Đã đổi cookie mà tham số mới tới giữa chừng → tải lại nguyên URL hiện tại để cổng kiểm lại
      // theo cookie mới (lượt mới có thể đã so với cookie cũ).
      if (kq.ok) return window.location.replace(daHuy() ? window.location.href : urlBoThamSoDuAn());
      if (!daHuy()) xuLyLoi(kq);
    },
    [xuLyLoi],
  );

  useEffect(() => {
    // Tham số đổi khi lượt trước còn chờ mạng → lượt cũ không được ghi đè URL/trạng thái mới.
    let huy = false;
    void kiem(thamSo, () => huy);
    return () => {
      huy = true;
    };
  }, [kiem, thamSo]);

  if (tt.loai === "san-sang") return <>{children}</>;
  if (tt.loai === "loi")
    return (
      <main className="min-h-screen bg-zinc-950 text-white flex flex-col">
        <ErrorState message={tt.loi} onRetry={() => void kiem(thamSo)} />
        <div className="flex justify-center pb-16">
          <ButtonLink href="/" variant="ghost">
            <Home className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
            Về trang chủ
          </ButtonLink>
        </div>
      </main>
    );
  return <PageSkeleton />;
}

export function CongDuAnTuLink({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Cong>{children}</Cong>
    </Suspense>
  );
}
