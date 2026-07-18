"use client";
// Trang điều hướng QR (M58 PR1): quét mã dán trên thiết bị/vật tư/mặt bằng/task →
// GET /api/r/:kind/:id tra đích rồi router.replace() sang đúng trang. KHÔNG phải trang
// nội dung — chỉ là bước trung chuyển, nên KHÔNG hiện trong SW cache cứng (xem swExclude
// "/api/r/" trong lib/modules.ts + public/sw.js).
import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { PageSkeleton } from "@/app/components/Skeleton";
import type { QrResolveResult } from "@/lib/qr";

function targetUrl(data: QrResolveResult): string {
  switch (data.kind) {
    case "eq":
      return `/equipment?id=${data.id}`;
    case "mt":
      return `/materials?id=${data.id}`;
    case "wf":
      return `/work-fronts/${encodeURIComponent(data.id)}`;
    case "tk":
      return `/tracking/${data.sheetSlug}?task=${data.id}`;
  }
}

export default function QrResolvePage({
  params,
}: {
  params: Promise<{ kind: string; id: string }>;
}) {
  const { kind, id } = use(params);
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const path = `/r/${encodeURIComponent(kind)}/${encodeURIComponent(id)}`;
    fetch(`/api/r/${encodeURIComponent(kind)}/${encodeURIComponent(id)}`)
      .then(async (r) => {
        if (cancelled) return;
        if (r.status === 401) {
          router.replace(`/login?next=${encodeURIComponent(path)}`);
          return;
        }
        if (!r.ok) {
          setError("Không tìm thấy hồ sơ này hoặc bạn không có quyền xem");
          return;
        }
        const data = (await r.json()) as QrResolveResult;
        router.replace(targetUrl(data));
      })
      .catch(() => {
        if (!cancelled) setError("Không tìm thấy hồ sơ này hoặc bạn không có quyền xem");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, id]);

  if (error) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-6">
        <div className="text-center space-y-3 max-w-sm">
          <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto" aria-hidden="true" />
          <p className="text-sm text-zinc-300">{error}</p>
        </div>
      </div>
    );
  }

  return <PageSkeleton />;
}
