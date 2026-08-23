"use client";

import { useCallback, useState } from "react";
import { showToast } from "@/app/components/Toast";
import type { LispTemplateType } from "../types";

// Sinh mã AutoLISP 2D (giá đỡ, ống lồng xuyên tường, cút chuyển tiết diện ống gió).
export function useAutoLispGenerator() {
  const [copied, setCopied] = useState(false);
  const [lispType, setLispType] = useState<LispTemplateType>("hanger");
  const [hangerWidth, setHangerWidth] = useState(600);
  const [hangerHeight, setHangerHeight] = useState(400);
  const [rodDiameter, setRodDiameter] = useState(10);
  const [sleeveDiameter, setSleeveDiameter] = useState(150);
  const [sleeveTag, setSleeveTag] = useState("SL-FP-01");
  const [inletWidth, setInletWidth] = useState(800);
  const [inletHeight, setInletHeight] = useState(400);
  const [outletWidth, setOutletWidth] = useState(600);
  const [outletHeight, setOutletHeight] = useState(400);
  const [transitionLength, setTransitionLength] = useState(600);
  const [generatedLispCode, setGeneratedLispCode] = useState("");

  const handleGenerateLisp = useCallback(async () => {
    try {
      const res = await fetch("/api/engineering/cad/lisp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateType: lispType,
          params: {
            widthMm: hangerWidth,
            heightMm: hangerHeight,
            rodDiameterMm: rodDiameter,
            diameterMm: sleeveDiameter,
            tagLabel: sleeveTag,
            inletWidthMm: inletWidth,
            inletHeightMm: inletHeight,
            outletWidthMm: outletWidth,
            outletHeightMm: outletHeight,
            transitionLengthMm: transitionLength,
          },
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setGeneratedLispCode(data.lispCode);
      }
    } catch (e) {
      console.error(e);
    }
  }, [
    lispType,
    hangerWidth,
    hangerHeight,
    rodDiameter,
    sleeveDiameter,
    sleeveTag,
    inletWidth,
    inletHeight,
    outletWidth,
    outletHeight,
    transitionLength,
  ]);

  const handleCopyCode = useCallback(() => {
    if (!generatedLispCode) return;
    navigator.clipboard.writeText(generatedLispCode);
    setCopied(true);
    showToast("Đã sao chép mã AutoLISP vào bộ nhớ tạm!");
    setTimeout(() => setCopied(false), 2000);
  }, [generatedLispCode]);

  const handleDownloadLisp = useCallback(() => {
    if (!generatedLispCode) return;
    const element = document.createElement("a");
    const file = new Blob([generatedLispCode], { type: "text/plain" });
    element.href = URL.createObjectURL(file);
    element.download = `xboss_autocad_${lispType}.lsp`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    showToast("Đã tải tệp .lsp về máy!");
  }, [generatedLispCode, lispType]);

  return {
    copied,
    lispType,
    setLispType,
    hangerWidth,
    setHangerWidth,
    hangerHeight,
    setHangerHeight,
    rodDiameter,
    setRodDiameter,
    sleeveDiameter,
    setSleeveDiameter,
    sleeveTag,
    setSleeveTag,
    inletWidth,
    setInletWidth,
    inletHeight,
    setInletHeight,
    outletWidth,
    setOutletWidth,
    outletHeight,
    setOutletHeight,
    transitionLength,
    setTransitionLength,
    generatedLispCode,
    handleGenerateLisp,
    handleCopyCode,
    handleDownloadLisp,
  };
}
