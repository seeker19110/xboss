"use client";

import { useCallback, useRef, useState } from "react";
import { showToast } from "@/app/components/Toast";

export interface CadHealthCheckResult {
  status: "ok" | "error";
  error?: string;
  entityCount?: number;
  totalHealthScore?: number;
  layerScore?: number;
  fontScore?: number;
  geometryScore?: number;
  dimScore?: number;
  blockScore?: number;
  xrefScore?: number;
  notes?: string[];
}

type VerificationPhase = "idle" | "uploading" | "processing" | "done" | "error";

const POLL_INTERVAL_MS = 2500;
const TASK_TYPE = "mepf.cad.health_check";

// Xác thực chéo điểm sức khỏe CAD bằng ezdxf chạy ở server (mepf-worker), độc lập với
// bộ parser TypeScript chạy ngay trên trình duyệt. Dùng hàng đợi tác vụ có sẵn
// (engineering_async_tasks) qua đúng 2 route đã có — không cần route mới:
// POST /api/engineering/queue/upload (enqueue) + GET .../tasks/[id]/progress (poll).
export function useCadServerVerification() {
  const [phase, setPhase] = useState<VerificationPhase>("idle");
  const [progressPercent, setProgressPercent] = useState(0);
  const [result, setResult] = useState<CadHealthCheckResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const pollTask = useCallback((taskId: string) => {
    const tick = async () => {
      try {
        const res = await fetch(`/api/engineering/queue/tasks/${taskId}/progress`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setPhase("error");
          setErrorMessage(body.error || "Không lấy được trạng thái tác vụ xác thực");
          return;
        }
        const data = await res.json();
        setProgressPercent(Number(data.progressPercent) || 0);

        if (data.status === "completed") {
          setResult(data.result as CadHealthCheckResult);
          setPhase("done");
          return;
        }
        if (data.status === "failed" || data.status === "cancelled") {
          setPhase("error");
          setErrorMessage(data.errorMessage || "Tác vụ xác thực ezdxf thất bại");
          return;
        }
        pollTimerRef.current = setTimeout(tick, POLL_INTERVAL_MS);
      } catch {
        setPhase("error");
        setErrorMessage("Mất kết nối khi chờ kết quả xác thực từ server");
      }
    };
    pollTimerRef.current = setTimeout(tick, POLL_INTERVAL_MS);
  }, []);

  const verifyWithServer = useCallback(
    async (file: File) => {
      stopPolling();
      setPhase("uploading");
      setProgressPercent(0);
      setResult(null);
      setErrorMessage(null);

      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("taskType", TASK_TYPE);

        const res = await fetch("/api/engineering/queue/upload", {
          method: "POST",
          body: formData,
        });
        const body = await res.json();

        if (!res.ok) {
          setPhase("error");
          setErrorMessage(body.error || "Không gửi được tệp lên hàng đợi xác thực");
          return;
        }

        setPhase("processing");
        pollTask(body.data.taskId as string);
      } catch {
        setPhase("error");
        setErrorMessage("Không kết nối được tới máy chủ xác thực (mepf-worker có đang chạy?)");
      }
    },
    [pollTask, stopPolling],
  );

  const reset = useCallback(() => {
    stopPolling();
    setPhase("idle");
    setProgressPercent(0);
    setResult(null);
    setErrorMessage(null);
  }, [stopPolling]);

  return {
    phase,
    progressPercent,
    result,
    errorMessage,
    verifyWithServer,
    reset,
    showComparisonToast: (clientScore: number) => {
      if (result?.status === "ok" && typeof result.totalHealthScore === "number") {
        const diff = Math.abs(clientScore - result.totalHealthScore);
        showToast(
          diff <= 5
            ? `✓ ezdxf xác nhận: ${result.totalHealthScore}/100 (client ${clientScore}/100 — khớp)`
            : `⚠ ezdxf: ${result.totalHealthScore}/100 khác client ${clientScore}/100 (lệch ${diff} điểm) — xem chi tiết bên dưới`,
        );
      }
    },
  };
}
