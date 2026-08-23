"use client";

import { useCallback, useState } from "react";
import { showToast } from "@/app/components/Toast";
import type { Cad2dApprovalStatus } from "../types";

// Cổng chất lượng & ký duyệt bản vẽ CAD 2D: trạng thái phê duyệt, người duyệt
// và ghi chú rà soát của kỹ sư.
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
    showToast("✓ Đã lưu toàn bộ nội dung sửa tay và chuyển sang trạng thái CHỜ DUYỆT!");
  }, []);

  const handleSendForApproval = useCallback(() => {
    setCad2dApprovalStatus("pending_approval");
    showToast("Đã gửi toàn bộ hồ sơ chuẩn hóa 2D cho Kỹ Sư Trưởng / BIM Lead chờ phê duyệt!");
  }, []);

  const handleApprove2d = useCallback(() => {
    setCad2dApprovalStatus("approved");
    const now = new Date();
    setApprovedAt(
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
    );
    showToast("✓ Đã PHÊ DUYỆT chuẩn hóa bản vẽ CAD 2D theo tiêu chuẩn ISO 19650!");
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
