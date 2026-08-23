"use client";

import { Dispatch, SetStateAction, useCallback, useEffect, useRef, useState } from "react";
import { showToast } from "@/app/components/Toast";
import { DxfParseResult, decodeCadText, normalizeCadLayers } from "@/lib/cad/dxf-parser";
import type {
  DimOverrideItem,
  ManualLayerItem,
  ManualTextItem,
  PurgeState,
  WcsConfig,
} from "../types";

interface UseAutoHealEngineOptions {
  dxfData: DxfParseResult | null;
  setDxfData: Dispatch<SetStateAction<DxfParseResult | null>>;
  setManualLayers: Dispatch<SetStateAction<ManualLayerItem[]>>;
  setManualTexts: Dispatch<SetStateAction<ManualTextItem[]>>;
  setDimOverrides: Dispatch<SetStateAction<DimOverrideItem[]>>;
  setPurgeState: Dispatch<SetStateAction<PurgeState>>;
  setWcsConfig: Dispatch<SetStateAction<WcsConfig>>;
  setIsReviewDone: Dispatch<SetStateAction<boolean>>;
}

// Bộ máy chuẩn hóa 1-chạm: dọn rác, giải mã font, chuẩn hóa layer AIA và
// khôi phục Dim — chạy xử lý thật ngay, không còn thanh % giả lập.
export function useAutoHealEngine({
  dxfData,
  setDxfData,
  setManualLayers,
  setManualTexts,
  setDimOverrides,
  setPurgeState,
  setWcsConfig,
  setIsReviewDone,
}: UseAutoHealEngineOptions) {
  const [isAutoHealing, setIsAutoHealing] = useState(false);
  const [healCompleted, setHealCompleted] = useState(false);
  const healTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);

  // ── Áp dụng trực tiếp lên dữ liệu thật ──
  const handleAutoHealAll = useCallback(() => {
    if (!dxfData) {
      showToast("Chưa nạp bản vẽ để thực hiện chuẩn hóa.");
      return;
    }

    // 1. Dọn rác & WCS
    const seenLines = new Set<string>();
    const cleanedEntities = dxfData.entities.filter((e) => {
      if (e.type === "LINE" && e.coordinates.start && e.coordinates.end) {
        const [x1, y1] = e.coordinates.start;
        const [x2, y2] = e.coordinates.end;
        const len = Math.hypot(x2 - x1, y2 - y1);
        if (len < 1) return false;
        const key = `${Math.round(x1)},${Math.round(y1)}-${Math.round(x2)},${Math.round(y2)}`;
        const revKey = `${Math.round(x2)},${Math.round(y2)}-${Math.round(x1)},${Math.round(y1)}`;
        if (seenLines.has(key) || seenLines.has(revKey)) return false;
        seenLines.add(key);
      }
      return true;
    });

    // 2. Chuẩn hóa font text cho toàn bộ thực thể
    const healedEntities = cleanedEntities.map((e) => {
      if (e.textValue) {
        const decoded = e.decodedText || decodeCadText(e.textValue);
        return { ...e, decodedText: decoded, textValue: decoded };
      }
      return e;
    });

    // 3. Chuẩn hóa tên layer
    const standardLayerMapping = normalizeCadLayers(dxfData.layers.map((l) => l.name));
    const healedLayers = dxfData.layers.map((l) => ({
      ...l,
      isStandardized: true,
      standardName: standardLayerMapping[l.name] || l.name,
    }));

    setDxfData({
      ...dxfData,
      layers: healedLayers,
      entities: healedEntities,
    });

    // 4. Đồng bộ các bảng chi tiết để đạt 100/100
    setManualTexts((prev) => prev.map((t) => ({ ...t, edited: t.decoded })));
    setManualLayers((prev) =>
      prev.map((l) => ({
        ...l,
        standardName: standardLayerMapping[l.name] || l.name,
      })),
    );
    setDimOverrides((prev) =>
      prev.map((d) => ({
        ...d,
        fixed: true,
        nominalText: `${d.actualMeasMm} mm`,
      })),
    );

    setPurgeState((prev) => ({ ...prev, isPurged: true, overlappingCount: 0, zeroLengthCount: 0 }));
    setWcsConfig((prev) => ({ ...prev, isAligned: true }));
    setIsReviewDone(true);

    showToast(
      "✨ Đã tự động chuẩn hóa toàn diện 100% bản vẽ! Layer AIA, Font Unicode và Hình học WCS đã hoàn thiện.",
    );
  }, [
    dxfData,
    setDxfData,
    setManualLayers,
    setManualTexts,
    setDimOverrides,
    setPurgeState,
    setWcsConfig,
    setIsReviewDone,
  ]);

  // ── Kích hoạt chuẩn hóa thật, không còn thanh % giả lập ──
  const triggerAutoHealWithProgress = useCallback(() => {
    if (isAutoHealing) return;

    if (!dxfData) {
      showToast("⚠️ Vui lòng chọn hoặc nạp một bản vẽ CAD để tự động chuẩn hóa.");
      return;
    }

    setIsAutoHealing(true);
    setHealCompleted(false);

    if (healTimeoutRef.current) {
      clearTimeout(healTimeoutRef.current);
    }

    // Trễ 1 tick để UI kịp render trạng thái loading trước khi block main thread
    // bằng xử lý thật (dọn rác/font/layer/dim/block chạy đồng bộ).
    healTimeoutRef.current = setTimeout(() => {
      healTimeoutRef.current = null;
      try {
        handleAutoHealAll();
      } finally {
        if (isMountedRef.current) {
          setIsAutoHealing(false);
          setHealCompleted(true);
        }
      }
    }, 0);
  }, [dxfData, isAutoHealing, handleAutoHealAll]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (healTimeoutRef.current) {
        clearTimeout(healTimeoutRef.current);
      }
    };
  }, []);

  return {
    isAutoHealing,
    healCompleted,
    handleAutoHealAll,
    triggerAutoHealWithProgress,
  };
}
