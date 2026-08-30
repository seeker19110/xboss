"use client";

import { useCallback, useState } from "react";
import { showToast } from "@/app/components/Toast";
import type { Cad2dApprovalStatus } from "../types";

// Ghi chú rà soát cục bộ cho bản vẽ CAD 2D — trạng thái, người rà soát và ghi chú CHỈ
// tồn tại trong state trình duyệt (không gọi API, không ghi DB) nên reload trang là mất.
// ĐÂY KHÔNG PHẢI PHÊ DUYỆT CHÍNH THỨC: chữ ký duyệt/nghiệm thu thật của hồ sơ bản vẽ
// (có audit trail, tồn tại sau reload) thực hiện ở sổ bản vẽ `/ban-ve` (revision status
// qua `PATCH /api/drawings/revisions/:id`). Đổi tên/nhãn theo hướng trung thực này để
// tránh gây hiểu nhầm đã ký duyệt chính thức khi thực chất chỉ là ghi chú tạm thời.
export function useCadReviewApproval() {
  const [cad2dApprovalStatus, setCad2dApprovalStatus] =
    useState<Cad2dApprovalStatus>("in_progress");
  const [approverName, setApproverName] = useState<string>("");
  const [approvedAt, setApprovedAt] = useState<string>("");
  const [approvalNotes, setApprovalNotes] = useState<string>("");
  const [isReviewDone, setIsReviewDone] = useState(false);
  const [reviewerRemarks, setReviewerRemarks] = useState("");

  const handleSaveManualReview = useCallback(() => {
    setIsReviewDone(true);
    setCad2dApprovalStatus("pending_approval");
    showToast("✓ Đã lưu ghi chú sửa tay (cục bộ) và chuyển sang trạng thái CHỜ RÀ SOÁT!");
  }, []);

  const handleSendForApproval = useCallback(() => {
    setCad2dApprovalStatus("pending_approval");
    showToast(
      "Đã đánh dấu hồ sơ chuẩn hóa 2D chờ Kỹ Sư Trưởng / BIM Lead rà soát (ghi chú cục bộ — ký duyệt chính thức thực hiện tại sổ bản vẽ /ban-ve).",
    );
  }, []);

  const handleApprove2d = useCallback(() => {
    setCad2dApprovalStatus("approved");
    const now = new Date();
    setApprovedAt(
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
    );
    showToast(
      "✓ Đã ghi chú rà soát cục bộ cho bản vẽ CAD 2D (CHƯA phải ký duyệt chính thức — thực hiện tại sổ bản vẽ /ban-ve).",
    );
  }, []);

  const handleReject2d = useCallback(() => {
    setCad2dApprovalStatus("rejected");
    showToast("Đã trả lại hồ sơ 2D yêu cầu kỹ sư rà soát và hiệu chỉnh lại.");
  }, []);

  const is2dApproved = cad2dApprovalStatus === "approved";

  return {
    cad2dApprovalStatus,
    setCad2dApprovalStatus,
    approverName,
    setApproverName,
    approvedAt,
    approvalNotes,
    setApprovalNotes,
    isReviewDone,
    setIsReviewDone,
    reviewerRemarks,
    setReviewerRemarks,
    is2dApproved,
    handleSaveManualReview,
    handleSendForApproval,
    handleApprove2d,
    handleReject2d,
  };
}
