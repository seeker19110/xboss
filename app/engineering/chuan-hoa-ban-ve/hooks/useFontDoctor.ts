"use client";

import { useCallback, useState } from "react";
import { showToast } from "@/app/components/Toast";
import type { FontSnippet } from "../types";

// Bác sĩ font chữ: giải mã TCVN3/VNI sang Unicode UTF-8 kèm bộ mẫu đối chiếu.
export function useFontDoctor() {
  const [legacyInput, setLegacyInput] = useState("");
  const [convertedText, setConvertedText] = useState("");
  const [sampleFontSnippets] = useState<FontSnippet[]>([
    {
      label: "Text ống gió VNI/TCVN3",
      source: "èng giã cÊp l¹nh AHU-01 800x500",
      expected: "Ống gió cấp lạnh AHU-01 800x500",
    },
    {
      label: "Text cao độ & độ dốc ống",
      source: "èng thót n−íc D114 dèc i=1.5% BOP=+2850",
      expected: "Ống thoát nước D114 dốc i=1.5% BOP=+2850",
    },
    {
      label: "Ký hiệu kỹ thuật Ø và ±",
      source: "Lç më xuyªn dÇm %%c150 cao ®é %%p0.000",
      expected: "Lỗ mở xuyên dầm Ø150 cao độ ±0.000",
    },
    {
      label: "Thiết bị PCCC Sprinkler",
      source: "§Çu phun PCCC Sprinkler 68øC quay xuèng",
      expected: "Đầu phun PCCC Sprinkler 68°C quay xuống",
    },
  ]);

  const handleConvertFont = useCallback(
    async (customText?: string) => {
      const textToConvert = customText !== undefined ? customText : legacyInput;
      try {
        const res = await fetch("/api/engineering/cad/normalize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ legacyText: textToConvert }),
        });

        if (res.ok) {
          const data = await res.json();
          setConvertedText(data.unicodeText || textToConvert);
          showToast("Đã chuyển đổi font sang Unicode UTF-8 thành công!");
        }
      } catch (e) {
        console.error(e);
      }
    },
    [legacyInput],
  );

  // Điền sẵn cặp text lỗi/đã giải mã lấy từ bản vẽ thật vào ô Doctor.
  const applyDetectedSample = useCallback((raw: string, decoded: string) => {
    setLegacyInput(raw);
    setConvertedText(decoded);
  }, []);

  return {
    legacyInput,
    setLegacyInput,
    convertedText,
    setConvertedText,
    sampleFontSnippets,
    handleConvertFont,
    applyDetectedSample,
  };
}
