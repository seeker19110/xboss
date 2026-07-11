"use client";
// Skeleton loading: thay chữ "Đang tải..." trống trải bằng khung mờ nhấp nháy —
// đỡ cảm giác chậm trên mạng yếu ngoài công trường.
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse bg-zinc-800/70 rounded-lg ${className}`} aria-hidden />;
}

// Khung trang đầy đủ: mirror cấu trúc thật Dashboard để tránh layout shift khi dữ liệu về.
export function PageSkeleton() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white" aria-busy aria-label="Đang tải">
      {/* Header giả */}
      <div className="border-b border-zinc-800 px-4 sm:px-6 py-3 flex items-center gap-3">
        <Skeleton className="h-7 w-36" />
        <Skeleton className="h-8 w-48 ml-2 hidden sm:block flex-1 max-w-md" />
        <div className="flex items-center gap-2 ml-auto">
          <Skeleton className="h-8 w-8 rounded-full" />
          <Skeleton className="h-8 w-8 rounded-full" />
        </div>
      </div>
      {/* Nav pills giả */}
      <div className="px-4 sm:px-6 py-2 flex gap-1">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-6 w-20" />
        ))}
      </div>
      <div className="p-4 sm:p-6 space-y-6">
        {/* Sheet nav pills */}
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-8 w-16" />
          ))}
        </div>
        {/* KPI cards — khớp breakpoint lưới thật ở app/page.tsx để không giật khi tải xong */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        {/* Heatmap */}
        <Skeleton className="h-48 rounded-xl" />
        {/* Forecast + S-curve */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
        </div>
        <Skeleton className="h-64 rounded-xl" />
        {/* Bảng trễ */}
        <Skeleton className="h-72 rounded-xl" />
      </div>
    </div>
  );
}
