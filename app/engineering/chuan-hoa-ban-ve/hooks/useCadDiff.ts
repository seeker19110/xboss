"use client";

import { useCallback, useState } from "react";
import type { CadDiffResult } from "../types";

// So sánh phiên bản bản vẽ (CAD Diff).
export function useCadDiff() {
  const [diffResult, setDiffResult] = useState<CadDiffResult | null>(null);

  // Không tự động dựng diff giả khi chưa chọn đủ 2 phiên bản thực tế để đối chiếu.
  const runDiffAnalysis = useCallback(async () => {
    setDiffResult(null);
  }, []);

  return { diffResult, runDiffAnalysis };
}
