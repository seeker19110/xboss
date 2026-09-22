"use client";
import { Suspense, useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { PageSkeleton } from "@/app/components/Skeleton";
import { fetchMe, type Me } from "@/app/lib/me";
import { readSavedMode, resolveHomeMode, saveMode, type HomeMode } from "@/app/lib/homeMode";

// Trang chủ "/" — 2 chế độ theo vai trò (M127, xem docs/nang-cap/M127-trang-chu-theo-vai-tro.md):
//   - Điều hành  : tổng quan dự án (bố cục M125) — mặc định cho admin/pm/bch/cdt/viewer
//   - Hiện trường: việc của tôi hôm nay — mặc định cho kỹ sư, bắt buộc với thầu phụ
// Trang này chỉ còn 3 việc: lấy phiên, chọn chế độ, render view tương ứng. Toàn bộ dữ liệu
// và bố cục nằm trong `app/components/home/*`.
//
// Hai view nạp bằng `next/dynamic` để chế độ Hiện trường KHÔNG kéo theo chunk của bố cục
// Điều hành (biểu đồ recharts, các panel tự fetch) — người thi công mở trang trên điện
// thoại sóng yếu chỉ tải đúng phần mình dùng (NFR2).
const HomeDieuHanh = dynamic(() => import("@/app/components/home/HomeDieuHanh"), {
  ssr: false,
  loading: () => <PageSkeleton />,
});
const HomeHienTruong = dynamic(() => import("@/app/components/home/HomeHienTruong"), {
  ssr: false,
  loading: () => <PageSkeleton />,
});

export default function Dashboard() {
  // `HomeDieuHanh` dùng useSearchParams (tab đang mở ghi vào URL) → cần Suspense ở đây.
  return (
    <Suspense fallback={<PageSkeleton />}>
      <TrangChu />
    </Suspense>
  );
}

function TrangChu() {
  const [me, setMe] = useState<Me | null>(null);
  const [mode, setMode] = useState<HomeMode | null>(null);

  useEffect(() => {
    // fetchMe tự điều hướng về /login khi 401 (và dọn cache/hàng đợi của phiên cũ).
    fetchMe().then((u) => {
      if (!u) return;
      setMe(u);
      setMode(resolveHomeMode(u.role, readSavedMode()));
    });
  }, []);

  // Đổi chế độ (chỉ kỹ sư có nút): ghi localStorage để lần sau vào giữ lựa chọn.
  // `luu = false` khi hệ thống tự chuyển (phân hệ Hiện trường bị tắt cho dự án) — không
  // ghi đè lựa chọn của người dùng.
  const doiCheDo = useCallback(
    (moi: HomeMode, luu = true) => {
      if (!me) return;
      const hopLe = resolveHomeMode(me.role, moi);
      setMode(hopLe);
      if (luu) saveMode(hopLe);
    },
    [me],
  );

  if (!me || !mode) return <PageSkeleton />;

  // Chỉ kỹ sư được chuyển qua lại: thầu phụ không có quyền xem dashboard, các vai trò còn
  // lại không có việc được giao nên chế độ Hiện trường sẽ trống với họ (FR1).
  const doiDuoc = me.role === "engineer";

  return mode === "hien-truong" ? (
    <HomeHienTruong
      me={me}
      onSwitchMode={doiDuoc ? (luu?: boolean) => doiCheDo("dieu-hanh", luu) : undefined}
    />
  ) : (
    <HomeDieuHanh me={me} onSwitchMode={doiDuoc ? () => doiCheDo("hien-truong") : undefined} />
  );
}
